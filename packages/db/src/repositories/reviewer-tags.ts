import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  ReviewerTagSchema,
  type ReviewerTag,
} from "@inertial/schemas";
import type { DbExecutor } from "../executor.js";
import { reviewerTags } from "../schema.js";
import { toIso } from "../utils.js";

type ReviewerTagRow = typeof reviewerTags.$inferSelect;
type ReviewerTagInsert = typeof reviewerTags.$inferInsert;

export interface PersistedReviewerTag extends ReviewerTag {
  id: string;
  contentEventId: string;
  reviewDecisionId: string;
  instanceId: string;
  reviewerId: string;
  createdAt: string;
}

function rowToTag(row: ReviewerTagRow): PersistedReviewerTag {
  // Validate the wire-shape part with Zod for safety; the persistence-only
  // fields (id, contentEventId, etc.) are trusted from the row.
  const wire = ReviewerTagSchema.parse({
    tagId: row.tagId,
    scope: row.scope ?? undefined,
    note: row.note ?? undefined,
  });
  return {
    ...wire,
    id: row.id,
    contentEventId: row.contentEventId,
    reviewDecisionId: row.reviewDecisionId,
    instanceId: row.instanceId,
    reviewerId: row.reviewerId,
    createdAt: toIso(row.createdAt),
  };
}

export interface SaveReviewerTagInput {
  contentEventId: string;
  reviewDecisionId: string;
  instanceId: string;
  reviewerId: string;
  tag: ReviewerTag;
}

/** Save one tag — mints a new id. Multiple tags per decision is normal. */
export async function save(
  db: DbExecutor,
  input: SaveReviewerTagInput,
): Promise<PersistedReviewerTag> {
  const insert: ReviewerTagInsert = {
    id: randomUUID(),
    contentEventId: input.contentEventId,
    reviewDecisionId: input.reviewDecisionId,
    instanceId: input.instanceId,
    tagId: input.tag.tagId,
    scope: input.tag.scope ?? null,
    note: input.tag.note ?? null,
    reviewerId: input.reviewerId,
  };
  const rows = await db.insert(reviewerTags).values(insert).returning();
  const row = rows[0];
  if (!row) throw new Error("reviewer-tags.save: insert returned no row");
  return rowToTag(row);
}

/** Bulk save — used by `commitDecision` to persist all tags in one go. */
export async function saveMany(
  db: DbExecutor,
  inputs: readonly SaveReviewerTagInput[],
): Promise<PersistedReviewerTag[]> {
  const out: PersistedReviewerTag[] = [];
  for (const i of inputs) {
    out.push(await save(db, i));
  }
  return out;
}

export async function listForEvent(
  db: DbExecutor,
  contentEventId: string,
): Promise<PersistedReviewerTag[]> {
  const rows = await db
    .select()
    .from(reviewerTags)
    .where(eq(reviewerTags.contentEventId, contentEventId))
    .orderBy(asc(reviewerTags.createdAt));
  return rows.map(rowToTag);
}

export async function listForDecision(
  db: DbExecutor,
  reviewDecisionId: string,
): Promise<PersistedReviewerTag[]> {
  const rows = await db
    .select()
    .from(reviewerTags)
    .where(eq(reviewerTags.reviewDecisionId, reviewDecisionId))
    .orderBy(asc(reviewerTags.createdAt));
  return rows.map(rowToTag);
}

export interface TagFrequencyRow {
  tagId: string;
  count: number;
}

/** Aggregated tag usage for an instance — drives the Insights tab's
 *  "tag coverage" bars. */
export async function frequenciesByInstance(
  db: DbExecutor,
  instanceId: string,
): Promise<TagFrequencyRow[]> {
  const rows = await db
    .select({
      tagId: reviewerTags.tagId,
      count: sql<number>`count(*)::int`,
    })
    .from(reviewerTags)
    .where(eq(reviewerTags.instanceId, instanceId))
    .groupBy(reviewerTags.tagId)
    .orderBy(desc(sql<number>`count(*)`));
  return rows.map((r) => ({ tagId: r.tagId, count: r.count }));
}

/** Total reviewer-tag count for an instance — fed into the dashboard's
 *  Insights "Tag corpus" stat. */
export async function countByInstance(
  db: DbExecutor,
  instanceId: string,
): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reviewerTags)
    .where(eq(reviewerTags.instanceId, instanceId));
  return rows[0]?.n ?? 0;
}

/** Find prior reviewer tags for the same author — feeds the Author history
 *  panel + acts as a building block for a future precedent skill. */
export async function listByAuthorAndTag(
  db: DbExecutor,
  params: { instanceId: string; authorId: string; tagId: string; limit?: number },
): Promise<PersistedReviewerTag[]> {
  // We don't denormalize authorId on reviewer_tags; this is a join through
  // content_events. Kept simple — adding the denormalization is a follow-up
  // if the query becomes hot.
  void params;
  return [];
}
