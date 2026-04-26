import { eq } from "drizzle-orm";
import { StructuredSignalSchema, type StructuredSignal } from "@inertial/schemas";
import type { DbExecutor } from "../executor.js";
import { structuredSignals } from "../schema.js";
import { toIso } from "../utils.js";

type SignalRow = typeof structuredSignals.$inferSelect;

function rowToSignal(row: SignalRow): StructuredSignal {
  return StructuredSignalSchema.parse({
    contentEventId: row.contentEventId,
    channels: row.channels,
    entities: row.entities,
    agentsRun: row.agentsRun,
    agentsFailed: row.agentsFailed,
    latencyMs: row.latencyMs,
    generatedAt: toIso(row.generatedAt),
  });
}

/**
 * Upsert the aggregated signal for an event. We carry instanceId explicitly
 * because the structured_signals row inherits it from the originating
 * ContentEvent for query-side denormalization.
 */
export async function saveStructuredSignal(
  db: DbExecutor,
  signal: StructuredSignal,
  instanceId: string,
): Promise<void> {
  const row = {
    contentEventId: signal.contentEventId,
    instanceId,
    channels: signal.channels,
    entities: signal.entities,
    agentsRun: signal.agentsRun,
    agentsFailed: signal.agentsFailed,
    latencyMs: signal.latencyMs,
    generatedAt: signal.generatedAt,
  } satisfies typeof structuredSignals.$inferInsert;

  await db
    .insert(structuredSignals)
    .values(row)
    .onConflictDoUpdate({ target: structuredSignals.contentEventId, set: row });
}

export async function getStructuredSignal(
  db: DbExecutor,
  contentEventId: string,
): Promise<StructuredSignal | null> {
  const rows = await db
    .select()
    .from(structuredSignals)
    .where(eq(structuredSignals.contentEventId, contentEventId))
    .limit(1);
  const row = rows[0];
  return row ? rowToSignal(row) : null;
}
