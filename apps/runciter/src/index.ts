import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  InMemoryRunciter,
  SkillRegistry,
  ToolRegistry,
  TraceCollector,
  makeSkillContext,
  type Skill,
  type SignalOutput,
  type TextClassificationInput,
} from "@inertial/core";
import {
  TextAgent,
  textSpamLinkSkill,
  textToxicityLocalSkill,
} from "@inertial/agents-text";
import {
  anthropicAvailable,
  textToxicityAnthropicSkill,
} from "@inertial/agents-cloud";
import {
  ContentEventSchema,
  ReviewDecisionSchema,
  type AgentTrace,
  type ContentEvent,
  type PolicyAction,
  type ReviewItem,
  type SignalChannel,
  type StructuredSignal,
} from "@inertial/schemas";
import { audit, events, review, shadow, signals, traces } from "@inertial/db";
import { createDevDatabase } from "@inertial/db/dev";
import { makeAuthorHistoryTool } from "@inertial/db/tools";
import {
  applySkillsPolicy,
  evaluatePolicy,
  loadPolicyFromFile,
  selectEscalations,
} from "@inertial/policy";

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

console.log("[runciter] starting…");

// 1. DB.
const dbHandle = await createDevDatabase();
const db = dbHandle.db;
console.log("[runciter] in-memory pglite ready");

// 2. Policy.
const policy = await loadPolicyFromFile(POLICY_PATH);
console.log(
  `[runciter] policy loaded: ${policy.instance} v${policy.version} (${policy.rules.length} rules, ${policy.escalation.length} escalations, ${policy.shadow.length} shadow skills)`,
);

// 3. Skill registry. Always register local skills; cloud skill registers
//    only if ANTHROPIC_API_KEY is in the environment AND the policy doesn't
//    block remote-api execution model.
const skills = new SkillRegistry()
  .register(textSpamLinkSkill)
  .register(textToxicityLocalSkill);

if (anthropicAvailable()) {
  skills.register(textToxicityAnthropicSkill);
  console.log("[runciter] cloud skill registered: text-classify-toxicity@anthropic");
} else {
  console.log(
    "[runciter] no ANTHROPIC_API_KEY — text-classify-toxicity@anthropic NOT registered (escalations will skip it)",
  );
}

// 4. Apply per-instance skill governance (block-list, exec-model gates,
//    data-leaving-machine gate). Mutates the registry in place.
applySkillsPolicy(skills, policy.skills);
const activeSkills = skills.list();
console.log(
  `[runciter] active skills (${activeSkills.length}): ${activeSkills
    .map((s) => `${s.name}(${s.provider})`)
    .join(", ")}`,
);

// 5. Tool registry — db-backed tools.
const tools = new ToolRegistry().register(makeAuthorHistoryTool(db));
console.log(
  `[runciter] active tools (${tools.list().length}): ${tools
    .list()
    .map((t) => t.name)
    .join(", ")}`,
);

// 6. Runciter \u2014 dispatches inertials (agents) that compose skills.
const runciter = new InMemoryRunciter({
  agents: [new TextAgent()],
  skills,
  tools,
});

// 7. Pre-warm any expensive skill init.
console.log("[runciter] warming skills (one-time toxic-bert download ~250MB on first run)…");
await skills.warmupAll();
console.log("[runciter] skills ready");

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
    `[runciter] ${event.id.slice(0, 8)} → ${result.action.kind} (${result.matchedRuleId ?? "default"}) escalations=${result.escalationsRun} shadow=${result.shadowRunsCompleted}`,
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

app.get("/v1/skills", (c) =>
  c.json({
    skills: activeSkills.map((s) => ({
      name: s.name,
      version: s.version,
      provider: s.provider,
      executionModel: s.executionModel,
      dataLeavesMachine: s.dataLeavesMachine,
      costEstimateUsd: s.costEstimateUsd ?? null,
      description: s.description ?? null,
    })),
    tools: tools.list(),
    shadow: policy.shadow,
  }),
);

app.get("/v1/audit/:instance", async (c) => {
  const instanceId = c.req.param("instance");
  const fromSequence = c.req.query("from");
  const limit = c.req.query("limit");
  const entries = await audit.listAuditEntries(db, instanceId, {
    fromSequence: fromSequence ? Number(fromSequence) : undefined,
    limit: limit ? Number(limit) : 100,
  });
  return c.json({ entries });
});

app.get("/v1/audit/:instance/verify", async (c) => {
  const instanceId = c.req.param("instance");
  const result = await audit.verifyAuditChain(db, instanceId);
  return c.json(result);
});

app.get("/v1/shadow/:instance/agreement", async (c) => {
  const instanceId = c.req.param("instance");
  const rows = await shadow.getSkillAgreement(db, instanceId);
  return c.json({ skills: rows });
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
  console.log(`[runciter] listening on http://localhost:${info.port}`);
});

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

interface ProcessResult {
  signal: StructuredSignal;
  action: PolicyAction;
  matchedRuleId?: string;
  reviewItemId?: string;
  escalationsRun: number;
  shadowRunsCompleted: number;
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

  // 2. Base orchestration — agents compose their default skills.
  const baseRun = await runciter.run(event);
  let signal = baseRun.signal;
  const allTraces: AgentTrace[] = [...baseRun.traces];

  // 3. Evaluate escalations against the partial signal. Each rule that fires
  //    runs its skills and merges their channels back into the signal
  //    (max-confidence collision, same as the aggregator).
  const escalations = selectEscalations(policy, signal);
  let escalationsRun = 0;
  for (const { rule, skills: skillNames } of escalations) {
    for (const skillName of skillNames) {
      const skill = skills.get<TextClassificationInput, SignalOutput>(skillName);
      if (!skill) {
        console.warn(
          `[runciter] escalation ${rule.id}: skill "${skillName}" not registered — skipping`,
        );
        continue;
      }
      const { channels, trace } = await runEscalationSkill(skill, event, rule.id);
      signal = mergeChannels(signal, channels);
      allTraces.push(trace);
      escalationsRun += 1;
      await audit.appendAuditEntry(db, {
        instanceId: event.instance.id,
        kind: "signal-generated",
        ref: { type: "signal", id: event.id },
        payload: {
          escalation: rule.id,
          skill: skillName,
          provider: skill.meta.provider,
          dataLeavesMachine: skill.meta.dataLeavesMachine,
          channelsAdded: channels.map((c) => c.channel),
        },
        actorId: null,
      });
    }
  }

  // 4. Persist the *final* signal + every trace.
  await signals.saveStructuredSignal(db, signal, event.instance.id);
  for (const trace of allTraces) {
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
      escalationsRun,
    },
    actorId: null,
  });

  // 5. Shadow runs — fire-and-forget skills whose predictions never affect
  //    the production signal or routing. Persisted as `shadow:<skill>` traces
  //    so the agreement helper in @inertial/db can pair them with reviewer
  //    decisions later. Failure here MUST NOT fail the event.
  let shadowRunsCompleted = 0;
  for (const skillName of policy.shadow) {
    const skill = skills.get<TextClassificationInput, SignalOutput>(skillName);
    if (!skill) {
      console.warn(
        `[runciter] shadow skill "${skillName}" not registered — skipping`,
      );
      continue;
    }
    try {
      const trace = await runShadowSkill(skill, event);
      await traces.saveAgentTrace(db, trace);
      shadowRunsCompleted += 1;
      const channelDecisions = trace.steps.filter((s) => s.kind === "decision");
      await audit.appendAuditEntry(db, {
        instanceId: event.instance.id,
        kind: "signal-generated",
        ref: { type: "signal", id: event.id },
        payload: {
          mode: "shadow",
          skill: skillName,
          provider: skill.meta.provider,
          dataLeavesMachine: skill.meta.dataLeavesMachine,
          channelsPredicted: channelDecisions.map((s) =>
            s.kind === "decision" ? { channel: s.channel, probability: s.probability } : null,
          ),
        },
        actorId: null,
      });
    } catch (err) {
      console.warn(
        `[runciter] shadow skill ${skillName} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 6. Evaluate policy.
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

  // 7. Route into the queue if policy says so.
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
    escalationsRun,
    shadowRunsCompleted,
  };
}

async function runShadowSkill(
  skill: Skill<TextClassificationInput, SignalOutput>,
  event: ContentEvent,
): Promise<AgentTrace> {
  const trace = new TraceCollector();
  const ctx = makeSkillContext({
    trace,
    tools,
    skills,
    signal: new AbortController().signal,
    runId: event.id,
    instanceId: event.instance.id,
  });
  const startedAt = new Date().toISOString();
  trace.thought(
    `shadow run: ${skill.meta.name} (${skill.meta.provider}, dataLeavesMachine=${skill.meta.dataLeavesMachine}) — prediction NOT used by production policy`,
  );
  const output = await skill.run(
    {
      text: event.text ?? "",
      authorId: event.author.id,
      instanceId: event.instance.id,
    },
    ctx,
  );
  for (const ch of output.channels) trace.decision(ch);
  // The `shadow:` agent prefix is what the db.shadow.getSkillAgreement query
  // looks for to distinguish silent predictions from production runs.
  return trace.finalize({
    agent: `shadow:${skill.meta.name}`,
    contentEventId: event.id,
    model: skill.meta.name,
    startedAt,
  });
}

async function runEscalationSkill(
  skill: Skill<TextClassificationInput, SignalOutput>,
  event: ContentEvent,
  ruleId: string,
): Promise<{ channels: SignalChannel[]; trace: AgentTrace }> {
  const trace = new TraceCollector();
  const ctx = makeSkillContext({
    trace,
    tools,
    skills,
    signal: new AbortController().signal,
    runId: event.id,
    instanceId: event.instance.id,
  });
  const startedAt = new Date().toISOString();
  trace.thought(
    `escalation ${ruleId}: invoking ${skill.meta.name} (${skill.meta.provider})`,
  );
  const output = await skill.run(
    {
      text: event.text ?? "",
      authorId: event.author.id,
      instanceId: event.instance.id,
    },
    ctx,
  );
  for (const ch of output.channels) trace.decision(ch);
  return {
    channels: output.channels,
    trace: trace.finalize({
      agent: `escalation:${ruleId}`,
      contentEventId: event.id,
      model: skill.meta.name,
      startedAt,
    }),
  };
}

/** Max-confidence collision merge — same rule the aggregator uses. */
function mergeChannels(
  signal: StructuredSignal,
  newChannels: readonly SignalChannel[],
): StructuredSignal {
  const channels = { ...signal.channels };
  for (const ch of newChannels) {
    const existing = channels[ch.channel];
    if (!existing || ch.confidence > existing.confidence) {
      channels[ch.channel] = ch;
    }
  }
  return { ...signal, channels };
}
