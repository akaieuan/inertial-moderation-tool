import { and, desc, eq, type SQL } from "drizzle-orm";
import { ContentEventSchema, type ContentEvent } from "@aur/schemas";
import type { DbExecutor } from "../executor.js";
import { contentEvents } from "../schema.js";
import { nullToUndef, toIso } from "../utils.js";

type ContentEventRow = typeof contentEvents.$inferSelect;
type ContentEventInsert = typeof contentEvents.$inferInsert;

function eventToRow(event: ContentEvent): ContentEventInsert {
  return {
    id: event.id,
    sourceId: event.sourceId,
    source: event.source,
    instanceId: event.instance.id,
    instanceName: event.instance.name ?? null,
    instanceSource: event.instance.source,
    modalities: event.modalities,
    text: event.text,
    links: event.links,
    media: event.media,
    hasContentWarning: event.hasContentWarning,
    contentWarningText: event.contentWarningText ?? null,
    authorId: event.author.id,
    authorHandle: event.author.handle,
    authorDisplayName: event.author.displayName ?? null,
    authorAccountAgeDays: event.author.accountAgeDays ?? null,
    authorPriorActionCount: event.author.priorActionCount,
    report: event.report ?? null,
    postedAt: event.postedAt,
    ingestedAt: event.ingestedAt,
    raw: event.raw ?? null,
  };
}

function rowToEvent(row: ContentEventRow): ContentEvent {
  return ContentEventSchema.parse({
    id: row.id,
    sourceId: row.sourceId,
    source: row.source,
    instance: {
      id: row.instanceId,
      ...(row.instanceName ? { name: row.instanceName } : {}),
      source: row.instanceSource,
    },
    modalities: row.modalities,
    text: row.text,
    links: row.links,
    media: row.media,
    hasContentWarning: row.hasContentWarning,
    contentWarningText: row.contentWarningText,
    author: {
      id: row.authorId,
      handle: row.authorHandle,
      displayName: row.authorDisplayName,
      accountAgeDays: row.authorAccountAgeDays,
      priorActionCount: row.authorPriorActionCount,
    },
    report: row.report,
    postedAt: toIso(row.postedAt),
    ingestedAt: toIso(row.ingestedAt),
    raw: nullToUndef(row.raw),
  });
}

/** Idempotent upsert keyed on the gateway-assigned UUID. */
export async function saveContentEvent(
  db: DbExecutor,
  event: ContentEvent,
): Promise<void> {
  const row = eventToRow(event);
  await db
    .insert(contentEvents)
    .values(row)
    .onConflictDoUpdate({ target: contentEvents.id, set: row });
}

export async function getContentEvent(
  db: DbExecutor,
  id: string,
): Promise<ContentEvent | null> {
  const rows = await db.select().from(contentEvents).where(eq(contentEvents.id, id)).limit(1);
  const row = rows[0];
  return row ? rowToEvent(row) : null;
}

export interface ListContentEventsOptions {
  limit?: number;
  before?: string; // postedAt cursor (ISO timestamp)
}

export async function listContentEventsByInstance(
  db: DbExecutor,
  instanceId: string,
  opts: ListContentEventsOptions = {},
): Promise<ContentEvent[]> {
  const conditions: SQL[] = [eq(contentEvents.instanceId, instanceId)];
  const rows = await db
    .select()
    .from(contentEvents)
    .where(and(...conditions))
    .orderBy(desc(contentEvents.postedAt))
    .limit(opts.limit ?? 100);
  return rows.map(rowToEvent);
}

export async function listContentEventsByAuthor(
  db: DbExecutor,
  instanceId: string,
  authorId: string,
  opts: ListContentEventsOptions = {},
): Promise<ContentEvent[]> {
  const rows = await db
    .select()
    .from(contentEvents)
    .where(
      and(eq(contentEvents.instanceId, instanceId), eq(contentEvents.authorId, authorId)),
    )
    .orderBy(desc(contentEvents.postedAt))
    .limit(opts.limit ?? 100);
  return rows.map(rowToEvent);
}
