import { randomUUID } from "node:crypto";
import type {
  ContentEvent,
  EvalRun,
  GoldEvent,
  StructuredSignal,
} from "@inertial/schemas";
import { aggregateRunCalibrations, type RunPrediction } from "./calibration.js";

/**
 * Persistence-agnostic eval runner.
 *
 * The runner doesn't know about the DB or HTTP. It takes:
 *  - A list of gold events to run
 *  - An `evaluate` function that maps ContentEvent → StructuredSignal
 *
 * It returns the populated EvalRun shape + raw predictions. The caller
 * (the CLI script or the runciter HTTP endpoint) decides what to persist.
 *
 * This split means we can test the runner with a stub `evaluate` and never
 * spin up Postgres or load any agents.
 *
 * The runner expects each gold event to embed (or reference) the input
 * ContentEvent. We thread it through `getContentEvent` so the same shape
 * works whether the caller has the events in-memory (test) or needs to fetch
 * them from `content_events` (production).
 */

export interface RunEvalInput {
  goldEvents: readonly GoldEvent[];
  /** Resolve a ContentEvent for a gold event. The caller decides the source —
   *  in-memory test fixtures, DB lookup, etc. */
  getContentEvent: (gold: GoldEvent) => Promise<ContentEvent | null>;
  /** Run the dispatch pipeline and return what it produced. The runner
   *  doesn't care whether this is an in-process Runciter, an HTTP fetch,
   *  or a stub returning hand-built signals. */
  evaluate: (event: ContentEvent) => Promise<StructuredSignal>;
  goldSetVersion: string;
  instanceId: string;
  triggeredBy?: string | null;
  /** Notification callback fired after each event. Lets the dashboard show
   *  "12/50 done…" progress. */
  onProgress?: (done: number, total: number) => void;
}

export interface RunEvalResult {
  run: EvalRun;
  /** All (gold, signal, latency) triples — kept around so the caller can
   *  snapshot them for trace replay or detailed dashboard views. */
  predictions: Array<RunPrediction & { latencyMs: number }>;
  /** Gold events whose ContentEvent couldn't be resolved. Skipped from
   *  scoring but reported so the caller can flag stale gold rows. */
  unresolved: GoldEvent[];
  /** Gold events whose `evaluate` call threw. Their predictions are
   *  excluded from scoring; the caller may want to retry or log. */
  failed: Array<{ goldEvent: GoldEvent; error: string }>;
}

/**
 * Run an eval pass. Always completes (even with all failures) — never throws
 * on individual event errors. The status field on the returned run reflects
 * what happened: `completed` if any predictions scored, `failed` if all events
 * blew up or zero gold events were provided.
 */
export async function runEval(input: RunEvalInput): Promise<RunEvalResult> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const total = input.goldEvents.length;

  const predictions: Array<RunPrediction & { latencyMs: number }> = [];
  const unresolved: GoldEvent[] = [];
  const failed: Array<{ goldEvent: GoldEvent; error: string }> = [];

  for (let i = 0; i < input.goldEvents.length; i += 1) {
    const gold = input.goldEvents[i]!;
    let event: ContentEvent | null = null;
    try {
      event = await input.getContentEvent(gold);
    } catch (err) {
      failed.push({
        goldEvent: gold,
        error: `getContentEvent: ${err instanceof Error ? err.message : String(err)}`,
      });
      input.onProgress?.(i + 1, total);
      continue;
    }
    if (!event) {
      unresolved.push(gold);
      input.onProgress?.(i + 1, total);
      continue;
    }

    const evalStart = Date.now();
    let signal: StructuredSignal;
    try {
      signal = await input.evaluate(event);
    } catch (err) {
      failed.push({
        goldEvent: gold,
        error: `evaluate: ${err instanceof Error ? err.message : String(err)}`,
      });
      input.onProgress?.(i + 1, total);
      continue;
    }
    const latencyMs = Date.now() - evalStart;
    predictions.push({ goldEvent: gold, signal, latencyMs });
    input.onProgress?.(i + 1, total);
  }

  const endedAt = new Date().toISOString();
  const calibrations = aggregateRunCalibrations(predictions);
  const meanLatencyMs =
    predictions.length === 0
      ? 0
      : Math.round(
          predictions.reduce((acc, p) => acc + p.latencyMs, 0) / predictions.length,
        );

  const status: EvalRun["status"] =
    predictions.length === 0 ? "failed" : "completed";

  const run: EvalRun = {
    id: randomUUID(),
    instanceId: input.instanceId,
    goldSetVersion: input.goldSetVersion,
    goldSetSize: total,
    status,
    meanLatencyMs: status === "completed" ? meanLatencyMs : null,
    startedAt,
    endedAt,
    skillCalibrations: calibrations,
    triggeredBy: input.triggeredBy ?? null,
  };

  // Surface total wall-clock for callers that want to log it.
  void startMs;

  return { run, predictions, unresolved, failed };
}
