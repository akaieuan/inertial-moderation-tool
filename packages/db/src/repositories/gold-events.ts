import { and, desc, eq, sql } from "drizzle-orm";
import { GoldEventSchema, type GoldEvent } from "@inertial/schemas";
import type { DbExecutor } from "../executor.js";
import { goldEvents } from "../schema.js";
import { toIso } from "../utils.js";

type GoldEventRow = typeof goldEvents.$inferSelect;
type GoldEventInsert = typeof goldEvents.$inferInsert;

function rowToGoldEvent(row: GoldEventRow): GoldEvent {
  return GoldEventSchema.parse({
    id: row.id,
    contentEventId: row.contentEventId,
    instanceId: row.instanceId,
    expectedChannels: row.expectedChannels,
    expectedAction: row.expectedAction ?? undefined,
    source: row.source,
    authorId: row.authorId,
    notes: row.notes ?? undefined,
    createdAt: toIso(row.createdAt),
  });
}

function goldEventToRow(g: GoldEvent): GoldEventInsert {
  return {
    id: g.id,
    contentEventId: g.contentEventId,
    instanceId: g.instanceId,
    expectedChannels: g.expectedChannels,
    expectedAction: g.expectedAction ?? null,
    source: g.source,
    authorId: g.authorId,
    notes: g.notes ?? null,
    createdAt: g.createdAt,
  };
}

/**
 * Save a gold event. Idempotent on (contentEventId, source) — re-saving the
 * same event from the same source replaces the existing label. This lets the
 * boot loader run on every restart without duplicating hand-labeled rows,
 * AND lets a reviewer revise their own past decision and have the
 * reviewer-derived label update accordingly.
 */
export async function save(db: DbExecutor, gold: GoldEvent): Promise<void> {
  const row = goldEventToRow(gold);
  await db
    .insert(goldEvents)
    .values(row)
    .onConflictDoUpdate({
      target: [goldEvents.contentEventId, goldEvents.source],
      set: {
        expectedChannels: row.expectedChannels,
        expectedAction: row.expectedAction,
        authorId: row.authorId,
        notes: row.notes,
      },
    });
}

/** Bulk save — used by the JSONL boot loader. Sequential, not batched, so
 *  one bad row doesn't take down the rest. */
export async function saveMany(
  db: DbExecutor,
  golds: readonly GoldEvent[],
): Promise<void> {
  for (const g of golds) {
    await save(db, g);
  }
}

export interface ListOptions {
  channel?: string;
  source?: GoldEvent["source"];
  limit?: number;
}

export async function listByInstance(
  db: DbExecutor,
  instanceId: string,
  opts: ListOptions = {},
): Promise<GoldEvent[]> {
  const conditions = [eq(goldEvents.instanceId, instanceId)];
  if (opts.source) conditions.push(eq(goldEvents.source, opts.source));
  // Channel filter is a JSONB containment check.
  if (opts.channel) {
    conditions.push(sql`${goldEvents.expectedChannels} ? ${opts.channel}`);
  }
  const rows = await db
    .select()
    .from(goldEvents)
    .where(and(...conditions))
    .orderBy(desc(goldEvents.createdAt))
    .limit(opts.limit ?? 500);
  return rows.map(rowToGoldEvent);
}

export async function countByInstance(
  db: DbExecutor,
  instanceId: string,
): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(goldEvents)
    .where(eq(goldEvents.instanceId, instanceId));
  return rows[0]?.n ?? 0;
}

export async function getById(
  db: DbExecutor,
  id: string,
): Promise<GoldEvent | null> {
  const rows = await db
    .select()
    .from(goldEvents)
    .where(eq(goldEvents.id, id))
    .limit(1);
  const row = rows[0];
  return row ? rowToGoldEvent(row) : null;
}

export async function removeById(db: DbExecutor, id: string): Promise<boolean> {
  const rows = await db
    .delete(goldEvents)
    .where(eq(goldEvents.id, id))
    .returning({ id: goldEvents.id });
  return rows.length > 0;
}
