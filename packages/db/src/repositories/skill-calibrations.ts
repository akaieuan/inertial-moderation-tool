import { and, asc, eq, gte } from "drizzle-orm";
import {
  SkillCalibrationSchema,
  type SkillCalibration,
} from "@inertial/schemas";
import type { DbExecutor } from "../executor.js";
import { evalRuns, skillCalibrations } from "../schema.js";

type CalRow = typeof skillCalibrations.$inferSelect;

function rowToCalibration(row: CalRow): SkillCalibration {
  return SkillCalibrationSchema.parse({
    skillName: row.skillName,
    channelName: row.channelName,
    brierScore: Number(row.brierScore),
    ece: Number(row.ece),
    agreement: Number(row.agreement),
    samples: row.samples,
    meanPredicted: Number(row.meanPredicted),
    meanActual: Number(row.meanActual),
  });
}

/** Save a batch of calibrations for one run. Idempotent on (run, skill, channel). */
export async function saveMany(
  db: DbExecutor,
  evalRunId: string,
  cals: readonly SkillCalibration[],
): Promise<void> {
  if (cals.length === 0) return;
  const rows = cals.map((c) => ({
    evalRunId,
    skillName: c.skillName,
    channelName: c.channelName,
    // Drizzle's `numeric` type expects a string for precise insertion.
    brierScore: c.brierScore.toFixed(4),
    ece: c.ece.toFixed(4),
    agreement: c.agreement.toFixed(4),
    samples: c.samples,
    meanPredicted: c.meanPredicted.toFixed(4),
    meanActual: c.meanActual.toFixed(4),
  }));
  await db
    .insert(skillCalibrations)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        skillCalibrations.evalRunId,
        skillCalibrations.skillName,
        skillCalibrations.channelName,
      ],
      set: {
        brierScore: skillCalibrations.brierScore,
        ece: skillCalibrations.ece,
        agreement: skillCalibrations.agreement,
        samples: skillCalibrations.samples,
        meanPredicted: skillCalibrations.meanPredicted,
        meanActual: skillCalibrations.meanActual,
      },
    });
}

export async function listForRun(
  db: DbExecutor,
  evalRunId: string,
): Promise<SkillCalibration[]> {
  const rows = await db
    .select()
    .from(skillCalibrations)
    .where(eq(skillCalibrations.evalRunId, evalRunId))
    .orderBy(asc(skillCalibrations.skillName), asc(skillCalibrations.channelName));
  return rows.map(rowToCalibration);
}

export interface TimeSeriesPoint {
  evalRunId: string;
  startedAt: string;
  brierScore: number;
  ece: number;
  agreement: number;
  samples: number;
}

/**
 * History of one (skill, channel)'s calibration across the most recent N
 * eval runs for an instance. Used to populate the trend sparklines on the
 * Insights tab. Ordered oldest → newest so charts can render left-to-right.
 */
export async function getTimeSeries(
  db: DbExecutor,
  params: {
    instanceId: string;
    skillName: string;
    channelName: string;
    limit?: number;
  },
): Promise<TimeSeriesPoint[]> {
  const limit = params.limit ?? 12;
  const rows = await db
    .select({
      evalRunId: evalRuns.id,
      startedAt: evalRuns.startedAt,
      brierScore: skillCalibrations.brierScore,
      ece: skillCalibrations.ece,
      agreement: skillCalibrations.agreement,
      samples: skillCalibrations.samples,
    })
    .from(skillCalibrations)
    .innerJoin(evalRuns, eq(skillCalibrations.evalRunId, evalRuns.id))
    .where(
      and(
        eq(evalRuns.instanceId, params.instanceId),
        eq(skillCalibrations.skillName, params.skillName),
        eq(skillCalibrations.channelName, params.channelName),
        eq(evalRuns.status, "completed"),
      ),
    )
    .orderBy(asc(evalRuns.startedAt))
    .limit(limit);
  return rows.map((r) => ({
    evalRunId: r.evalRunId,
    startedAt:
      typeof r.startedAt === "string" ? r.startedAt : new Date(r.startedAt).toISOString(),
    brierScore: Number(r.brierScore),
    ece: Number(r.ece),
    agreement: Number(r.agreement),
    samples: r.samples,
  }));
}

/** Cutoff helper for a "last N days" query — used by the Insights tab. */
export async function getRecentForInstance(
  db: DbExecutor,
  instanceId: string,
  sinceIso: string,
): Promise<SkillCalibration[]> {
  const rows = await db
    .select({
      skillName: skillCalibrations.skillName,
      channelName: skillCalibrations.channelName,
      brierScore: skillCalibrations.brierScore,
      ece: skillCalibrations.ece,
      agreement: skillCalibrations.agreement,
      samples: skillCalibrations.samples,
      meanPredicted: skillCalibrations.meanPredicted,
      meanActual: skillCalibrations.meanActual,
    })
    .from(skillCalibrations)
    .innerJoin(evalRuns, eq(skillCalibrations.evalRunId, evalRuns.id))
    .where(
      and(
        eq(evalRuns.instanceId, instanceId),
        eq(evalRuns.status, "completed"),
        gte(evalRuns.startedAt, sinceIso),
      ),
    );
  return rows.map((row) =>
    SkillCalibrationSchema.parse({
      skillName: row.skillName,
      channelName: row.channelName,
      brierScore: Number(row.brierScore),
      ece: Number(row.ece),
      agreement: Number(row.agreement),
      samples: row.samples,
      meanPredicted: Number(row.meanPredicted),
      meanActual: Number(row.meanActual),
    }),
  );
}
