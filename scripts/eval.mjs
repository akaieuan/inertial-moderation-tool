#!/usr/bin/env node
/**
 * pnpm eval — verify skill calibration against the hand-labeled gold set.
 *
 * Boots an in-memory pglite + a SkillRegistry mirroring the runciter's
 * default boot path (text-toxicity-local + text-detect-spam-link + context
 * skills, plus cloud skills if env keys present). Loads
 * `config/evals/gold-set-v1.jsonl`, runs every event through the dispatch
 * pipeline, scores per-(skill, channel) calibrations, and prints a summary
 * table. Exit code is non-zero if `EVAL_BRIER_THRESHOLD` is set and any
 * (skill, channel) pair exceeds it.
 *
 * Cloud skills are skipped by default unless `EVAL_INCLUDE_CLOUD=true` is set
 * — keeps `pnpm eval` free + fast in CI.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  InMemoryRunciter,
  SkillRegistry,
  ToolRegistry,
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
} from "@inertial/agents-cloud";
import {
  ContextAgent,
  textContextAuthorSkill,
  textContextSimilarSkill,
} from "@inertial/agents-context";
import { events as eventsRepo } from "@inertial/db";
import { createDevDatabase } from "@inertial/db/dev";
import {
  makeAuthorHistoryTool,
  makeFindSimilarEventsTool,
  makeGetEmbeddingTool,
} from "@inertial/db/tools";
import { loadGoldSetFromFile, runEval } from "@inertial/eval";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOLD_SET_PATH = resolve(__dirname, "..", "config", "evals", "gold-set-v1.jsonl");
const GOLD_SET_VERSION = "gold-set-v1";
const INSTANCE_ID = "default";
const INCLUDE_CLOUD = process.env.EVAL_INCLUDE_CLOUD === "true";
const BRIER_THRESHOLD = process.env.EVAL_BRIER_THRESHOLD
  ? Number(process.env.EVAL_BRIER_THRESHOLD)
  : null;

console.log(`[eval] starting — gold set: ${GOLD_SET_PATH}`);

// 1. DB.
const dbHandle = await createDevDatabase();
const db = dbHandle.db;

// 2. Skills — mirror the runciter's default boot path.
const skills = new SkillRegistry()
  .register(textSpamLinkSkill)
  .register(textToxicityLocalSkill)
  .register(textContextAuthorSkill)
  .register(textContextSimilarSkill);

if (INCLUDE_CLOUD && anthropicAvailable()) {
  skills.register(textToxicityAnthropicSkill);
  skills.register(imageNsfwAnthropicSkill);
  console.log("[eval] cloud skills registered (ANTHROPIC_API_KEY present)");
} else if (INCLUDE_CLOUD) {
  console.log("[eval] EVAL_INCLUDE_CLOUD=true but no ANTHROPIC_API_KEY — skipping");
} else {
  console.log("[eval] cloud skills skipped (set EVAL_INCLUDE_CLOUD=true to include)");
}

if (INCLUDE_CLOUD && voyageAvailable()) {
  skills.register(textEmbedVoyageSkill);
}

// 3. Tools.
const tools = new ToolRegistry()
  .register(makeAuthorHistoryTool(db))
  .register(makeFindSimilarEventsTool(db))
  .register(makeGetEmbeddingTool(db));

// 4. Runciter.
const runciter = new InMemoryRunciter({
  agents: [
    new TextAgent(),
    new VisionAgent(["image-classify@anthropic"]),
    new ContextAgent(),
  ],
  skills,
  tools,
});

// 5. Pre-warm transformers.js (toxic-bert) so per-event latency is honest.
console.log("[eval] warming local skills…");
await skills.warmupAll();

// 6. Load + persist gold events into the in-memory db so the runner's
//    getContentEvent lookup works.
const { entries, errors } = await loadGoldSetFromFile(GOLD_SET_PATH);
if (errors.length > 0) {
  console.warn(`[eval] ${errors.length} parse error(s); first: line ${errors[0].line}: ${errors[0].reason}`);
}
console.log(`[eval] loaded ${entries.length} gold event(s)`);

for (const e of entries) {
  await eventsRepo.saveContentEvent(db, e.event);
}

// 7. Run the eval.
const goldEvents = entries.map((e) => e.goldEvent);
console.log(`[eval] dispatching ${goldEvents.length} event(s)…`);

let lastTick = 0;
const result = await runEval({
  goldEvents,
  goldSetVersion: GOLD_SET_VERSION,
  instanceId: INSTANCE_ID,
  triggeredBy: "cli",
  getContentEvent: async (gold) => eventsRepo.getContentEvent(db, gold.contentEventId),
  evaluate: async (event) => {
    const r = await runciter.run(event);
    return r.signal;
  },
  onProgress: (done, total) => {
    const pct = Math.floor((done / total) * 100);
    if (pct >= lastTick + 10) {
      console.log(`[eval] ${done}/${total} (${pct}%)`);
      lastTick = pct;
    }
  },
});

// (Skip explicit dbHandle.close() — OS reaps on process exit, and
//  the synchronous teardown races with transformers.js's WASM thread
//  exit causing a cosmetic libc++abi mutex error.)

// 8. Summary table.
const cals = result.run.skillCalibrations;
console.log("");
console.log(formatHeader());
console.log(formatDivider());
for (const c of cals) {
  console.log(formatRow(c));
}
console.log(formatDivider());
console.log(
  `${cals.length} (skill, channel) row(s) | scored: ${result.predictions.length} | unresolved: ${result.unresolved.length} | failed: ${result.failed.length} | mean latency: ${result.run.meanLatencyMs}ms`,
);

// 9. Exit code based on optional Brier threshold.
if (BRIER_THRESHOLD !== null) {
  const regressions = cals.filter((c) => c.brierScore > BRIER_THRESHOLD);
  if (regressions.length > 0) {
    console.error("");
    console.error(`[eval] FAIL: ${regressions.length} (skill, channel) pair(s) over Brier threshold ${BRIER_THRESHOLD}:`);
    for (const c of regressions) {
      console.error(`  - ${c.skillName} → ${c.channelName}: ${c.brierScore.toFixed(4)}`);
    }
    process.exit(1);
  }
}

if (result.failed.length > 0) {
  console.error("");
  console.error(`[eval] ${result.failed.length} event(s) failed to evaluate:`);
  for (const f of result.failed) {
    console.error(`  - ${f.goldEvent.id.slice(0, 8)}: ${f.error}`);
  }
}

// Print a single machine-parseable summary line so CI can check success
// independently of the exit code. Node's exit on macOS races with
// @huggingface/transformers's WASM thread teardown and emits a cosmetic
// libc++abi abort that we can't preempt from JS land — the eval still
// produced the correct output above this line.
const exitCode = result.predictions.length === 0 ? 1 : 0;
console.log(
  `[eval] result=${exitCode === 0 ? "ok" : "fail"} scored=${result.predictions.length} skipped=${result.unresolved.length + result.failed.length} rows=${cals.length}`,
);
process.exit(exitCode);

// --- formatting helpers ---

function formatHeader() {
  return [
    pad("skill", 38),
    pad("channel", 22),
    rpad("brier", 7),
    rpad("ece", 7),
    rpad("agree", 7),
    rpad("samples", 8),
  ].join(" ");
}

function formatDivider() {
  return [
    "─".repeat(38),
    "─".repeat(22),
    "─".repeat(7),
    "─".repeat(7),
    "─".repeat(7),
    "─".repeat(8),
  ].join(" ");
}

function formatRow(c) {
  return [
    pad(c.skillName, 38),
    pad(c.channelName, 22),
    rpad(c.brierScore.toFixed(4), 7),
    rpad(c.ece.toFixed(4), 7),
    rpad(c.agreement.toFixed(2), 7),
    rpad(String(c.samples), 8),
  ].join(" ");
}

function pad(s, n) {
  if (s.length >= n) return s.slice(0, n - 1) + "…";
  return s + " ".repeat(n - s.length);
}

function rpad(s, n) {
  if (s.length >= n) return s.slice(0, n);
  return " ".repeat(n - s.length) + s;
}
