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
  SKILL_CATALOG,
  TAG_CATALOG,
  findCatalogEntry,
  type Skill,
  type SignalOutput,
  type TextClassificationInput,
} from "@inertial/core";
import {
  TextAgent,
  textSpamLinkSkill,
  textToxicityLocalSkill,
} from "@inertial/agents-text";
import { VisionAgent } from "@inertial/agents-vision";
import {
  anthropicAvailable,
  imageNsfwAnthropicSkill,
  textToxicityAnthropicSkill,
  textEmbedVoyageSkill,
  voyageAvailable,
  type TextEmbedInput,
  type TextEmbedOutput,
} from "@inertial/agents-cloud";
import {
  ContextAgent,
  textContextAuthorSkill,
  textContextSimilarSkill,
} from "@inertial/agents-context";
import {
  ContentEventSchema,
  ReviewDecisionSchema,
  SkillRegistrationSchema,
  type AgentTrace,
  type ContentEvent,
  type GoldEvent,
  type PolicyAction,
  type ReviewItem,
  type SignalChannel,
  type SkillRegistration,
  type StructuredSignal,
} from "@inertial/schemas";
import {
  audit,
  embeddings,
  evalRuns as evalRunsRepo,
  events,
  goldEvents as goldEventsRepo,
  review,
  reviewerTags as reviewerTagsRepo,
  shadow,
  signals,
  skillRegistrations as skillRegs,
  traces,
} from "@inertial/db";
import { createDevDatabase } from "@inertial/db/dev";
import {
  makeAuthorHistoryTool,
  makeFindSimilarEventsTool,
  makeGetEmbeddingTool,
  type AuthorHistoryOutput,
} from "@inertial/db/tools";
import {
  convertDecisionToGoldEvent,
  loadGoldSetFromFile,
  runEval,
} from "@inertial/eval";
import {
  applySkillsPolicy,
  evaluatePolicy,
  loadPolicyFromFile,
  selectEscalations,
} from "@inertial/policy";
import {
  registerFromCatalog,
  skillNameForCatalogId,
} from "./skill-wiring.js";

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
  .register(textToxicityLocalSkill)
  // Context skills are DB-only; no API key required, always registered.
  .register(textContextAuthorSkill)
  .register(textContextSimilarSkill);

if (anthropicAvailable()) {
  skills.register(textToxicityAnthropicSkill);
  skills.register(imageNsfwAnthropicSkill);
  console.log(
    "[runciter] cloud skills registered: text-classify-toxicity@anthropic, image-classify@anthropic",
  );
} else {
  console.log(
    "[runciter] no ANTHROPIC_API_KEY — cloud skills NOT registered (vision is cloud-only; image events will get no signal)",
  );
}

if (voyageAvailable()) {
  skills.register(textEmbedVoyageSkill);
  console.log("[runciter] embedding skill registered: text-embed@voyage");
} else {
  console.log(
    "[runciter] no VOYAGE_API_KEY — text-embed@voyage NOT registered (similar-events context will return no neighbours)",
  );
}

// 4. Apply per-instance skill governance (block-list, exec-model gates,
//    data-leaving-machine gate). Mutates the registry in place.
applySkillsPolicy(skills, policy.skills);

// 4b. Load any user-added skill registrations from the DB and wire them via
//     the catalog switch (apps/runciter/src/skill-wiring.ts). Failure on a
//     single registration is logged but doesn't block boot — operators can
//     fix the bad config from the dashboard without bouncing the runciter.
const userRegs = await skillRegs.listByInstance(db, "default");
let userSkillsWired = 0;
for (const reg of userRegs) {
  if (!reg.enabled) continue;
  // Skip if the env-based default is already registered for this skill name.
  const skillName = skillNameForCatalogId(reg.catalogId);
  if (skillName && skills.has(skillName)) {
    console.warn(
      `[runciter] registration ${reg.id} (${reg.catalogId}) overlaps env-based default — skipping`,
    );
    continue;
  }
  try {
    registerFromCatalog(skills, reg);
    userSkillsWired += 1;
  } catch (err) {
    console.warn(
      `[runciter] failed to wire registration ${reg.id} (${reg.catalogId}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
console.log(
  `[runciter] user-registered skills wired: ${userSkillsWired}/${userRegs.length}`,
);

const activeSkills = skills.list();
console.log(
  `[runciter] active skills (${activeSkills.length}): ${activeSkills
    .map((s) => `${s.name}(${s.provider})`)
    .join(", ")}`,
);

// 5. Tool registry — db-backed tools.
const tools = new ToolRegistry()
  .register(makeAuthorHistoryTool(db))
  .register(makeFindSimilarEventsTool(db))
  .register(makeGetEmbeddingTool(db));
console.log(
  `[runciter] active tools (${tools.list().length}): ${tools
    .list()
    .map((t) => t.name)
    .join(", ")}`,
);

// 6. Runciter \u2014 dispatches inertials (agents) that compose skills.
//    VisionAgent is given the cloud skill name explicitly so it composes
//    only that. (No local image classifier ships — see CLAUDE.md "honest
//    vision capability" section.)
const runciter = new InMemoryRunciter({
  agents: [
    new TextAgent(),
    new VisionAgent(["image-classify@anthropic"]),
    // ContextAgent runs on every event regardless of modality; its skills
    // degrade gracefully when prerequisites (embeddings, history) are missing.
    new ContextAgent(),
  ],
  skills,
  tools,
});

// 7. Pre-warm any expensive skill init (toxic-bert ~250MB on first run).
console.log("[runciter] warming skills (toxic-bert downloads on first run)…");
await skills.warmupAll();
console.log("[runciter] skills ready");

// 8. Load the hand-labeled gold set if present. Idempotent: re-running on
//    boot replaces existing rows for the same (contentEventId, source) pair,
//    so editing the JSONL during dev just hot-reloads the labels.
const GOLD_SET_PATH = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "config",
  "evals",
  "gold-set-v1.jsonl",
);
const GOLD_SET_VERSION = "gold-set-v1";

try {
  const { entries, errors } = await loadGoldSetFromFile(GOLD_SET_PATH);
  if (errors.length > 0) {
    console.warn(
      `[runciter] gold set: ${errors.length} parse error(s) — first: line ${errors[0]!.line}: ${errors[0]!.reason}`,
    );
  }
  for (const entry of entries) {
    await events.saveContentEvent(db, entry.event);
    await goldEventsRepo.save(db, entry.goldEvent);
  }
  console.log(
    `[runciter] gold set ${GOLD_SET_VERSION} loaded: ${entries.length} hand-labeled event(s)`,
  );
} catch (err) {
  // Gold set is optional — if the file's missing the runciter still boots.
  if ((err as { code?: string })?.code === "ENOENT") {
    console.log(`[runciter] gold set ${GOLD_SET_VERSION} not present at ${GOLD_SET_PATH} — skipping`);
  } else {
    console.warn(
      `[runciter] gold set load failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

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

  // Resolve context inline for the dashboard. We call the existing repository
  // helpers directly rather than going through the SkillContext — these are
  // pure reads, no skill is being scored, so no audit entry is appropriate.
  const [historyEvents, ownEmbedding] = await Promise.all([
    events
      .listContentEventsByAuthor(db, event.instance.id, event.author.id, { limit: 25 })
      .then((rows) => rows.filter((e) => e.id !== event.id)),
    embeddings.getEmbeddingForEvent(db, event.id, "text"),
  ]);

  const authorHistory = {
    count: historyEvents.length,
    totalPriorActions: historyEvents.reduce(
      (sum, e) => sum + e.author.priorActionCount,
      0,
    ),
    recent: historyEvents.slice(0, 5).map((e) => ({
      id: e.id,
      postedAt: e.postedAt,
      excerpt: (e.text ?? "").slice(0, 160),
    })),
  };

  let similarEvents: Array<{
    contentEventId: string;
    similarity: number;
    excerpt: string;
    authorHandle: string;
  }> = [];
  if (ownEmbedding) {
    const neighbors = await embeddings.findSimilarEvents(db, {
      instanceId: event.instance.id,
      kind: "text",
      embedding: ownEmbedding,
      limit: 5,
      minSimilarity: 0.7,
    });
    const filtered = neighbors.filter((n) => n.contentEventId !== event.id);
    const fetched = await Promise.all(
      filtered.slice(0, 5).map(async (n) => {
        const ev = await events.getContentEvent(db, n.contentEventId);
        return {
          contentEventId: n.contentEventId,
          similarity: n.similarity,
          excerpt: (ev?.text ?? "").slice(0, 160),
          authorHandle: ev?.author.handle ?? "",
        };
      }),
    );
    similarEvents = fetched;
  }

  return c.json({
    event,
    signal,
    traces: eventTraces,
    authorHistory,
    similarEvents,
  });
});

app.get("/v1/skills", (c) =>
  c.json({
    skills: skills.list().map((s) => ({
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

// --- Skill catalog + registrations -----------------------------------------

app.get("/v1/skills/catalog", (c) => c.json({ catalog: SKILL_CATALOG }));

app.get("/v1/skills/registrations", async (c) => {
  const instanceId = c.req.query("instance") ?? "default";
  const registrations = await skillRegs.listByInstance(db, instanceId);
  return c.json({ registrations });
});

app.post("/v1/skills/registrations", async (c) => {
  const raw = await c.req.json();
  const parsed = SkillRegistrationSchema.omit({ id: true, createdAt: true }).safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_registration", issues: parsed.error.issues },
      400,
    );
  }
  const input = parsed.data;
  const entry = findCatalogEntry(input.catalogId);
  if (!entry) {
    return c.json({ error: "unknown_catalog_id", catalogId: input.catalogId }, 400);
  }
  // Validate providerConfig has every required field of the right shape.
  for (const field of entry.configFields) {
    if (!field.required) continue;
    const v = input.providerConfig[field.key];
    if (typeof v !== "string" || v.length === 0) {
      return c.json(
        {
          error: "missing_provider_config",
          field: field.key,
          message: `${entry.catalogId} requires providerConfig.${field.key}`,
        },
        400,
      );
    }
  }

  const reg: SkillRegistration = {
    id: randomUUID(),
    instanceId: input.instanceId,
    catalogId: input.catalogId,
    displayName: input.displayName || entry.displayName,
    providerConfig: input.providerConfig,
    enabled: input.enabled,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
  };

  // Try to wire it live before persisting, so a config typo fails loudly
  // without leaving an unwireable row in the table.
  if (reg.enabled) {
    const skillName = skillNameForCatalogId(reg.catalogId);
    if (skillName && skills.has(skillName)) {
      // Existing default occupies this slot — block it so the user version takes over.
      skills.block(skillName);
    }
    try {
      registerFromCatalog(skills, reg);
    } catch (err) {
      // Restore the default if we blocked it.
      if (skillName) skills.unblock(skillName);
      return c.json(
        { error: "wire_failed", message: err instanceof Error ? err.message : String(err) },
        400,
      );
    }
  }

  await skillRegs.save(db, reg);
  await audit.appendAuditEntry(db, {
    instanceId: reg.instanceId,
    kind: "policy-updated",
    ref: { type: "policy", id: reg.id },
    payload: {
      kind: "skill-registered",
      catalogId: reg.catalogId,
      displayName: reg.displayName,
    },
    actorId: reg.createdBy,
  });
  return c.json({ registration: reg }, 201);
});

app.patch("/v1/skills/registrations/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const existing = await skillRegs.getById(db, id);
  if (!existing) return c.json({ error: "not_found" }, 404);

  const patch: { displayName?: string; providerConfig?: Record<string, unknown>; enabled?: boolean } = {};
  if (typeof body.displayName === "string") patch.displayName = body.displayName;
  if (body.providerConfig && typeof body.providerConfig === "object") {
    patch.providerConfig = body.providerConfig as Record<string, unknown>;
  }
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;

  const updated = await skillRegs.update(db, id, patch);
  if (!updated) return c.json({ error: "not_found" }, 404);

  // Hot-mutate the live SkillRegistry on enabled changes.
  const skillName = skillNameForCatalogId(updated.catalogId);
  if (skillName && typeof patch.enabled === "boolean") {
    if (patch.enabled) {
      // Re-wire if missing; unblock if just blocked.
      if (skills.has(skillName)) {
        // already active; nothing to do
      } else {
        try {
          // try unblock first (cheap), else fully re-register
          skills.unblock(skillName);
          if (!skills.has(skillName)) registerFromCatalog(skills, updated);
        } catch (err) {
          console.warn(
            `[runciter] PATCH ${id}: re-register failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } else {
      skills.block(skillName);
    }
  }

  await audit.appendAuditEntry(db, {
    instanceId: updated.instanceId,
    kind: "policy-updated",
    ref: { type: "policy", id: updated.id },
    payload: {
      kind: typeof patch.enabled === "boolean" ? "skill-toggled" : "skill-config-updated",
      catalogId: updated.catalogId,
      enabled: updated.enabled,
    },
    actorId: null,
  });
  return c.json({ registration: updated });
});

app.delete("/v1/skills/registrations/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await skillRegs.getById(db, id);
  if (!existing) return c.json({ error: "not_found" }, 404);

  const skillName = skillNameForCatalogId(existing.catalogId);
  if (skillName) skills.block(skillName);

  const deleted = await skillRegs.remove(db, id);
  if (!deleted) return c.json({ error: "not_found" }, 404);

  await audit.appendAuditEntry(db, {
    instanceId: existing.instanceId,
    kind: "policy-updated",
    ref: { type: "policy", id: existing.id },
    payload: { kind: "skill-removed", catalogId: existing.catalogId },
    actorId: null,
  });
  return c.json({ ok: true });
});

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

// --- Eval harness ----------------------------------------------------------

app.get("/v1/eval/runs", async (c) => {
  const instanceId = c.req.query("instance") ?? "default";
  const limit = c.req.query("limit");
  const runs = await evalRunsRepo.listByInstance(db, instanceId, {
    limit: limit ? Number(limit) : 20,
  });
  return c.json({ runs });
});

app.get("/v1/eval/runs/latest", async (c) => {
  const instanceId = c.req.query("instance") ?? "default";
  const run = await evalRunsRepo.getLatestCompleted(db, instanceId);
  return c.json({ run });
});

app.get("/v1/eval/runs/:id", async (c) => {
  const id = c.req.param("id");
  const run = await evalRunsRepo.getById(db, id);
  if (!run) return c.json({ error: "not_found" }, 404);
  return c.json({ run });
});

app.post("/v1/eval/runs", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const instanceId: string = body.instanceId ?? "default";
  const goldSetVersion: string = body.goldSetVersion ?? GOLD_SET_VERSION;
  const triggeredBy: string | null = body.triggeredBy ?? "dashboard";

  // Pull the gold events from the DB. We rely on the boot loader (or earlier
  // POSTs) having seeded them — empty set is a 400.
  const goldEvents = await goldEventsRepo.listByInstance(db, instanceId, {
    limit: 1000,
  });
  if (goldEvents.length === 0) {
    return c.json(
      { error: "no_gold_events", instanceId, hint: "load config/evals/gold-set-v1.jsonl first" },
      400,
    );
  }

  // Persist a `running` row up front so the dashboard can poll for progress.
  const row = await evalRunsRepo.start(db, {
    instanceId,
    goldSetVersion,
    goldSetSize: goldEvents.length,
    triggeredBy,
  });
  await audit.appendAuditEntry(db, {
    instanceId,
    kind: "eval-run-started",
    ref: { type: "eval-run", id: row.id },
    payload: { goldSetVersion, goldSetSize: goldEvents.length },
    actorId: triggeredBy,
  });

  // Run the eval async — return 202 immediately so the dashboard can poll.
  // Failure is logged + persisted as status=failed; we never let an eval
  // error crash the runciter.
  void runAndPersistEval(row.id, goldEvents, instanceId, goldSetVersion).catch(
    (err) => {
      console.warn(
        `[runciter] eval run ${row.id} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    },
  );

  return c.json({ runId: row.id, status: "running" }, 202);
});

// --- Reviewer tag layer --------------------------------------------------

app.get("/v1/tags/catalog", (c) => c.json({ catalog: TAG_CATALOG }));

app.get("/v1/tags", async (c) => {
  const eventId = c.req.query("eventId");
  if (!eventId) return c.json({ error: "missing_eventId" }, 400);
  const tags = await reviewerTagsRepo.listForEvent(db, eventId);
  return c.json({ tags });
});

app.get("/v1/tags/frequencies", async (c) => {
  const instanceId = c.req.query("instance") ?? "default";
  const frequencies = await reviewerTagsRepo.frequenciesByInstance(db, instanceId);
  const total = await reviewerTagsRepo.countByInstance(db, instanceId);
  return c.json({ frequencies, total });
});

app.get("/v1/eval/gold-events", async (c) => {
  const instanceId = c.req.query("instance") ?? "default";
  const channel = c.req.query("channel") ?? undefined;
  const source = c.req.query("source") as
    | "hand-labeled"
    | "reviewer-derived"
    | undefined;
  const limit = c.req.query("limit");
  const goldEvents = await goldEventsRepo.listByInstance(db, instanceId, {
    channel,
    source,
    limit: limit ? Number(limit) : 200,
  });
  return c.json({ goldEvents, total: goldEvents.length });
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

  // Persist any reviewer tags that came in alongside the decision.
  // The decision itself already carries them via the schema (validated), so
  // each row here is a flattened view of decision.data.reviewerTags.
  const tagInputs = (decision.data.reviewerTags ?? []).map((tag) => ({
    contentEventId: item.contentEventId,
    reviewDecisionId: decision.data.id,
    instanceId: item.instanceId,
    reviewerId: decision.data.reviewerId,
    tag,
  }));
  if (tagInputs.length > 0) {
    await reviewerTagsRepo.saveMany(db, tagInputs);
  }

  await audit.appendAuditEntry(db, {
    instanceId: item.instanceId,
    kind: "decision-recorded",
    ref: { type: "review-item", id: reviewItemId },
    payload: {
      verdict: decision.data.verdict,
      rationale: decision.data.rationale ?? null,
      durationMs: decision.data.durationMs,
      reviewerTagCount: tagInputs.length,
    },
    actorId: decision.data.reviewerId,
  });

  // Auto-promote to a reviewer-derived gold event when the reviewer left
  // signalFeedback or reviewer tags. This is the throughline that grows the gold set
  // organically — every commit decision becomes a free gold label.
  // Failure here is non-fatal: the decision is already saved.
  try {
    const [contentEvent, signal] = await Promise.all([
      events.getContentEvent(db, item.contentEventId),
      signals.getStructuredSignal(db, item.contentEventId),
    ]);
    if (contentEvent) {
      const goldEvent = convertDecisionToGoldEvent({
        decision: decision.data,
        contentEvent,
        signal,
      });
      if (goldEvent) {
        await goldEventsRepo.save(db, goldEvent);
      }
    }
  } catch (err) {
    console.warn(
      `[runciter] reviewer-derived gold-event promotion failed for decision ${decision.data.id}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

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

  // 1b. Embed event text BEFORE orchestration so the similar-events context
  //     skill can find this event's own embedding when it runs in step 2.
  //     Failure is non-fatal: the event is already persisted, similar-events
  //     just won't find this event as a future neighbour.
  if (event.text && event.text.trim() && voyageAvailable()) {
    try {
      await embedAndPersist(event);
    } catch (err) {
      console.warn(
        `[runciter] embedding failed for ${event.id.slice(0, 8)}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

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

/**
 * Run the registered embedding skill against `event.text` and persist the
 * vector to `event_embeddings`. Caller is responsible for the voyageAvailable
 * check; this throws on failure so the caller can audit.
 */
async function embedAndPersist(event: ContentEvent): Promise<void> {
  const skill = skills.get<TextEmbedInput, TextEmbedOutput>("text-embed@voyage");
  if (!skill) return; // shouldn't happen given caller's check, but defensive
  const trace = new TraceCollector();
  const ctx = makeSkillContext({
    trace,
    tools,
    skills,
    signal: new AbortController().signal,
    runId: event.id,
    instanceId: event.instance.id,
  });
  const out = await skill.run({ text: event.text ?? "" }, ctx);
  await embeddings.saveEmbedding(db, {
    contentEventId: event.id,
    instanceId: event.instance.id,
    kind: "text",
    model: out.model,
    embedding: out.embedding,
  });
  await audit.appendAuditEntry(db, {
    instanceId: event.instance.id,
    kind: "signal-generated",
    ref: { type: "signal", id: event.id },
    payload: {
      stage: "embedding",
      model: out.model,
      dim: out.embedding.length,
      inputTokens: out.inputTokens,
    },
    actorId: null,
  });
}

/**
 * Async eval run executor. Walks the gold set through the live runciter,
 * scores results, and persists the completed EvalRun + per-(skill, channel)
 * calibrations. Errors are caught + recorded as status=failed.
 */
async function runAndPersistEval(
  runId: string,
  goldEvents: GoldEvent[],
  instanceId: string,
  goldSetVersion: string,
): Promise<void> {
  try {
    const result = await runEval({
      goldEvents,
      goldSetVersion,
      instanceId,
      triggeredBy: "dashboard",
      // Resolve content events from the DB — the boot loader populated them.
      getContentEvent: async (gold) => events.getContentEvent(db, gold.contentEventId),
      // Use the actual production runciter — same skill registry, same dispatch.
      evaluate: async (event) => {
        const r = await runciter.run(event);
        return r.signal;
      },
    });

    const completed = await evalRunsRepo.complete(db, runId, {
      meanLatencyMs: result.run.meanLatencyMs ?? 0,
      calibrations: result.run.skillCalibrations,
    });

    await audit.appendAuditEntry(db, {
      instanceId,
      kind: "eval-run-completed",
      ref: { type: "eval-run", id: runId },
      payload: {
        goldSetVersion,
        goldSetSize: result.run.goldSetSize,
        completed: result.predictions.length,
        unresolved: result.unresolved.length,
        failed: result.failed.length,
        calibrationCount: result.run.skillCalibrations.length,
        meanLatencyMs: completed?.meanLatencyMs ?? 0,
      },
      actorId: "dashboard",
    });

    console.log(
      `[runciter] eval ${runId.slice(0, 8)} done: ${result.predictions.length}/${
        result.run.goldSetSize
      } scored, ${result.run.skillCalibrations.length} (skill, channel) rows`,
    );
  } catch (err) {
    await evalRunsRepo.fail(db, runId, err instanceof Error ? err.message : String(err));
    await audit.appendAuditEntry(db, {
      instanceId,
      kind: "eval-run-completed",
      ref: { type: "eval-run", id: runId },
      payload: {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      },
      actorId: "dashboard",
    });
    throw err;
  }
}
