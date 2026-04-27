import { desc, eq } from "drizzle-orm";
import {
  EvalRunSchema,
  type EvalRun,
  type SkillCalibration,
} from "@inertial/schemas";
import type { DbExecutor } from "../executor.js";
import { evalRuns } from "../schema.js";
import { toIso } from "../utils.js";
import {
  listForRun as listCalibrationsForRun,
  saveMany as saveCalibrations,
} from "./skill-calibrations.js";

type EvalRunRow = typeof evalRuns.$inferSelect;
type EvalRunInsert = typeof evalRuns.$inferInsert;

function rowToRun(row: EvalRunRow, calibrations: SkillCalibration[] = []): EvalRun {
  return EvalRunSchema.parse({
    id: row.id,
    instanceId: row.instanceId,
    goldSetVersion: row.goldSetVersion,
    goldSetSize: row.goldSetSize,
    status: row.status,
    meanLatencyMs: row.meanLatencyMs ?? null,
    startedAt: toIso(row.startedAt),
    endedAt: row.endedAt ? toIso(row.endedAt) : null,
    skillCalibrations: calibrations,
    triggeredBy: row.triggeredBy ?? null,
  });
}

export interface StartEvalRunInput {
  instanceId: string;
  goldSetVersion: string;
  goldSetSize: number;
  triggeredBy?: string | null;
}

/** Insert with status=running. Returns the created run. */
export async function start(
  db: DbExecutor,
  input: StartEvalRunInput,
): Promise<EvalRun> {
  const insert: EvalRunInsert = {
    instanceId: input.instanceId,
    goldSetVersion: input.goldSetVersion,
    goldSetSize: input.goldSetSize,
    status: "running",
    startedAt: new Date().toISOString(),
    triggeredBy: input.triggeredBy ?? null,
  };
  const rows = await db.insert(evalRuns).values(insert).returning();
  const row = rows[0];
  if (!row) throw new Error("eval-runs.start: insert returned no row");
  return rowToRun(row);
}

export interface CompleteEvalRunInput {
  meanLatencyMs: number;
  calibrations: readonly SkillCalibration[];
}

/** Finalize a run: status → completed, end timestamp, persist calibrations
 *  in the same logical operation. Returns the updated run with calibrations. */
export async function complete(
  db: DbExecutor,
  id: string,
  input: CompleteEvalRunInput,
): Promise<EvalRun | null> {
  const updateRows = await db
    .update(evalRuns)
    .set({
      status: "completed",
      endedAt: new Date().toISOString(),
      meanLatencyMs: input.meanLatencyMs,
    })
    .where(eq(evalRuns.id, id))
    .returning();
  const row = updateRows[0];
  if (!row) return null;
  await saveCalibrations(db, id, input.calibrations);
  return rowToRun(row, [...input.calibrations]);
}

/** Mark a run as failed. We keep the row around so the dashboard can show
 *  "the last run errored" instead of silently disappearing. */
export async function fail(
  db: DbExecutor,
  id: string,
  reason: string,
): Promise<EvalRun | null> {
  const rows = await db
    .update(evalRuns)
    .set({
      status: "failed",
      endedAt: new Date().toISOString(),
    })
    .where(eq(evalRuns.id, id))
    .returning();
  const row = rows[0];
  if (!row) return null;
  // Stash the reason on the row's existing fields — there's no dedicated
  // `error` column, so we surface it through the audit log instead. The
  // caller is expected to append an audit entry with the reason.
  void reason;
  return rowToRun(row);
}

/** Fetch one run, including its calibrations when status=completed. */
export async function getById(
  db: DbExecutor,
  id: string,
): Promise<EvalRun | null> {
  const rows = await db
    .select()
    .from(evalRuns)
    .where(eq(evalRuns.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const cals = row.status === "completed" ? await listCalibrationsForRun(db, id) : [];
  return rowToRun(row, cals);
}

export interface ListEvalRunsOptions {
  limit?: number;
}

/** List recent runs for an instance. Calibrations are NOT loaded (kept light
 *  for list views); use `getById` to hydrate one. */
export async function listByInstance(
  db: DbExecutor,
  instanceId: string,
  opts: ListEvalRunsOptions = {},
): Promise<EvalRun[]> {
  const rows = await db
    .select()
    .from(evalRuns)
    .where(eq(evalRuns.instanceId, instanceId))
    .orderBy(desc(evalRuns.startedAt))
    .limit(opts.limit ?? 20);
  return rows.map((r) => rowToRun(r));
}

/** Most recent completed run for an instance. Used by the Insights summary. */
export async function getLatestCompleted(
  db: DbExecutor,
  instanceId: string,
): Promise<EvalRun | null> {
  const rows = await db
    .select()
    .from(evalRuns)
    .where(eq(evalRuns.instanceId, instanceId))
    .orderBy(desc(evalRuns.startedAt))
    .limit(20); // grab a small page; usually #1 is completed
  for (const row of rows) {
    if (row.status !== "completed") continue;
    const cals = await listCalibrationsForRun(db, row.id);
    return rowToRun(row, cals);
  }
  return null;
}
