import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { InMemoryOrchestrator } from "@aur/core";
import { TextRegexAgent, TextToxicityLocalAgent } from "@aur/agents-text";
import {
  ContentEventSchema,
  ReviewDecisionSchema,
  type ContentEvent,
  type PolicyAction,
  type ReviewItem,
  type StructuredSignal,
} from "@aur/schemas";
import { audit, events, review, signals, traces } from "@aur/db";
import { createDevDatabase } from "@aur/db/dev";
import { evaluatePolicy, loadPolicyFromFile } from "@aur/policy";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4001);
const POLICY_PATH = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "config",
  "policies",
  "default.yaml",
);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

console.log("[worker] starting…");

const toxicityAgent = new TextToxicityLocalAgent();
const orchestrator = new InMemoryOrchestrator([
  new TextRegexAgent(),
  toxicityAgent,
]);

const policy = await loadPolicyFromFile(POLICY_PATH);
console.log(
  `[worker] policy loaded: ${policy.instance} v${policy.version} (${policy.rules.length} rules)`,
);

const dbHandle = await createDevDatabase();
const db = dbHandle.db;
console.log("[worker] in-memory pglite ready");

console.log("[worker] warming up toxicity classifier (one-time ~250MB download on first run)…");
await toxicityAgent.warmup();
console.log("[worker] toxicity classifier ready");

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const app = new Hono();
app.use("*", cors({ origin: "*" }));

app.get("/healthz", (c) => c.json({ ok: true }));

app.post("/v1/events", async (c) => {
  const raw = await c.req.json();
  const parsed = ContentEventSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_content_event", issues: parsed.error.issues },
      400,
    );
  }
  const event = parsed.data;
  const result = await processEvent(event);
  console.log(
    `[worker] ${event.id} → ${result.action.kind} (${result.matchedRuleId ?? "default"})`,
  );
  return c.json(result);
});

app.get("/v1/queue", async (c) => {
  const instanceId = c.req.query("instance");
  if (!instanceId) {
    return c.json({ error: "missing_instance_query_param" }, 400);
  }
  const items = await review.listReviewItems(db, instanceId, {
    limit: Number(c.req.query("limit") ?? 100),
  });
  return c.json({ items });
});

app.get("/v1/events/:id", async (c) => {
  const id = c.req.param("id");
  const [event, signal, eventTraces] = await Promise.all([
    events.getContentEvent(db, id),
    signals.getStructuredSignal(db, id),
    traces.listAgentTracesForEvent(db, id),
  ]);
  if (!event) return c.json({ error: "not_found" }, 404);
  return c.json({ event, signal, traces: eventTraces });
});

app.post("/v1/reviews/:id/decisions", async (c) => {
  const reviewItemId = c.req.param("id");
  const body = await c.req.json();
  const decision = ReviewDecisionSchema.safeParse({
    ...body,
    id: body.id ?? randomUUID(),
    reviewItemId,
    decidedAt: body.decidedAt ?? new Date().toISOString(),
  });
  if (!decision.success) {
    return c.json({ error: "invalid_decision", issues: decision.error.issues }, 400);
  }

  const item = await review.getReviewItem(db, reviewItemId);
  if (!item) return c.json({ error: "review_item_not_found" }, 404);

  await review.appendReviewDecision(db, decision.data);
  await review.updateReviewItemState(db, reviewItemId, "decided", decision.data.verdict);
  await audit.appendAuditEntry(db, {
    instanceId: item.instanceId,
    kind: "decision-recorded",
    ref: { type: "review-item", id: reviewItemId },
    payload: {
      verdict: decision.data.verdict,
      rationale: decision.data.rationale ?? null,
      durationMs: decision.data.durationMs,
    },
    actorId: decision.data.reviewerId,
  });
  return c.json({ ok: true, decisionId: decision.data.id });
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[worker] listening on http://localhost:${info.port}`);
});

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

interface ProcessResult {
  signal: StructuredSignal;
  action: PolicyAction;
  matchedRuleId?: string;
  reviewItemId?: string;
}

async function processEvent(event: ContentEvent): Promise<ProcessResult> {
  // 1. Persist + audit ingestion.
  await events.saveContentEvent(db, event);
  await audit.appendAuditEntry(db, {
    instanceId: event.instance.id,
    kind: "event-ingested",
    ref: { type: "content-event", id: event.id },
    payload: {
      sourceId: event.sourceId,
      source: event.source,
      modalities: event.modalities,
      authorId: event.author.id,
    },
    actorId: null,
  });

  // 2. Orchestrate agents.
  const { signal, traces: agentTraces } = await orchestrator.run(event);
  await signals.saveStructuredSignal(db, signal, event.instance.id);
  for (const trace of agentTraces) {
    await traces.saveAgentTrace(db, trace);
  }
  await audit.appendAuditEntry(db, {
    instanceId: event.instance.id,
    kind: "signal-generated",
    ref: { type: "signal", id: event.id },
    payload: {
      agentsRun: signal.agentsRun,
      agentsFailed: signal.agentsFailed,
      latencyMs: signal.latencyMs,
      channels: Object.keys(signal.channels),
    },
    actorId: null,
  });

  // 3. Evaluate policy.
  const evaluation = evaluatePolicy(policy, signal);
  await audit.appendAuditEntry(db, {
    instanceId: event.instance.id,
    kind: "policy-evaluated",
    ref: { type: "signal", id: event.id },
    payload: {
      matchedRuleId: evaluation.matchedRuleId ?? null,
      action: evaluation.action,
    },
    actorId: null,
  });

  // 4. If the action routes to a review queue, persist the ReviewItem.
  let reviewItemId: string | undefined;
  if (
    evaluation.action.kind === "queue.quick" ||
    evaluation.action.kind === "queue.deep" ||
    evaluation.action.kind === "escalate.mandatory"
  ) {
    const queue: ReviewItem["queue"] =
      evaluation.action.kind === "queue.quick"
        ? "quick"
        : evaluation.action.kind === "queue.deep"
          ? "deep"
          : "escalation";
    const now = new Date().toISOString();
    const item: ReviewItem = {
      id: randomUUID(),
      contentEventId: event.id,
      instanceId: event.instance.id,
      queue,
      recommendedAction: evaluation.action,
      matchedRuleId: evaluation.matchedRuleId,
      state: "pending",
      decisions: [],
      finalVerdict: null,
      createdAt: now,
      updatedAt: now,
    };
    await review.saveReviewItem(db, item);
    reviewItemId = item.id;
    await audit.appendAuditEntry(db, {
      instanceId: event.instance.id,
      kind: "queue-routed",
      ref: { type: "review-item", id: item.id },
      payload: {
        queue,
        contentEventId: event.id,
        recommendedAction: evaluation.action,
      },
      actorId: null,
    });
  }

  return {
    signal,
    action: evaluation.action,
    matchedRuleId: evaluation.matchedRuleId,
    reviewItemId,
  };
}
