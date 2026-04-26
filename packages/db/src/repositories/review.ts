import { and, asc, desc, eq, type SQL } from "drizzle-orm";
import {
  ReviewDecisionSchema,
  ReviewItemSchema,
  type ReviewDecision,
  type ReviewItem,
  type QueueKind,
  type ReviewState,
  type ReviewVerdict,
} from "@inertial/schemas";
import type { DbExecutor } from "../executor.js";
import { reviewDecisions, reviewItems } from "../schema.js";
import { nullToUndef, toIso, toIsoOpt } from "../utils.js";

type ReviewItemRow = typeof reviewItems.$inferSelect;
type ReviewDecisionRow = typeof reviewDecisions.$inferSelect;

function rowToItem(
  row: ReviewItemRow,
  decisions: ReviewDecisionRow[] = [],
): ReviewItem {
  return ReviewItemSchema.parse({
    id: row.id,
    contentEventId: row.contentEventId,
    instanceId: row.instanceId,
    queue: row.queue,
    recommendedAction: row.recommendedAction,
    matchedRuleId: nullToUndef(row.matchedRuleId),
    state: row.state,
    decisions: decisions.map(rowToDecision),
    finalVerdict: row.finalVerdict,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    staleAfter: toIsoOpt(row.staleAfter),
  });
}

function rowToDecision(row: ReviewDecisionRow): ReviewDecision {
  return ReviewDecisionSchema.parse({
    id: row.id,
    reviewItemId: row.reviewItemId,
    reviewerId: row.reviewerId,
    verdict: row.verdict,
    rationale: nullToUndef(row.rationale),
    signalFeedback: row.signalFeedback,
    aiQualityScale: nullToUndef(row.aiQualityScale),
    decidedAt: toIso(row.decidedAt),
    durationMs: row.durationMs,
  });
}

export async function saveReviewItem(db: DbExecutor, item: ReviewItem): Promise<void> {
  const row = {
    id: item.id,
    contentEventId: item.contentEventId,
    instanceId: item.instanceId,
    queue: item.queue,
    recommendedAction: item.recommendedAction,
    matchedRuleId: item.matchedRuleId ?? null,
    state: item.state,
    finalVerdict: item.finalVerdict,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    staleAfter: item.staleAfter ?? null,
  } satisfies typeof reviewItems.$inferInsert;

  await db.insert(reviewItems).values(row).onConflictDoUpdate({
    target: reviewItems.id,
    set: row,
  });
}

export async function getReviewItem(
  db: DbExecutor,
  id: string,
): Promise<ReviewItem | null> {
  const items = await db.select().from(reviewItems).where(eq(reviewItems.id, id)).limit(1);
  const item = items[0];
  if (!item) return null;
  const decisions = await db
    .select()
    .from(reviewDecisions)
    .where(eq(reviewDecisions.reviewItemId, id))
    .orderBy(asc(reviewDecisions.decidedAt));
  return rowToItem(item, decisions);
}

export interface ListReviewItemsOptions {
  queue?: QueueKind;
  state?: ReviewState;
  limit?: number;
}

export async function listReviewItems(
  db: DbExecutor,
  instanceId: string,
  opts: ListReviewItemsOptions = {},
): Promise<ReviewItem[]> {
  const conditions: SQL[] = [eq(reviewItems.instanceId, instanceId)];
  if (opts.queue) conditions.push(eq(reviewItems.queue, opts.queue));
  if (opts.state) conditions.push(eq(reviewItems.state, opts.state));

  const items = await db
    .select()
    .from(reviewItems)
    .where(and(...conditions))
    .orderBy(desc(reviewItems.updatedAt))
    .limit(opts.limit ?? 100);

  if (items.length === 0) return [];
  // Decisions are loaded in a single follow-up query by ID set.
  // For v0 we preserve the simple per-item approach to keep ordering trivial.
  const out: ReviewItem[] = [];
  for (const item of items) {
    const decisions = await db
      .select()
      .from(reviewDecisions)
      .where(eq(reviewDecisions.reviewItemId, item.id))
      .orderBy(asc(reviewDecisions.decidedAt));
    out.push(rowToItem(item, decisions));
  }
  return out;
}

export async function updateReviewItemState(
  db: DbExecutor,
  id: string,
  state: ReviewState,
  finalVerdict: ReviewVerdict | null = null,
): Promise<void> {
  await db
    .update(reviewItems)
    .set({
      state,
      finalVerdict,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(reviewItems.id, id));
}

export async function appendReviewDecision(
  db: DbExecutor,
  decision: ReviewDecision,
): Promise<void> {
  await db.insert(reviewDecisions).values({
    id: decision.id,
    reviewItemId: decision.reviewItemId,
    reviewerId: decision.reviewerId,
    verdict: decision.verdict,
    rationale: decision.rationale ?? null,
    signalFeedback: decision.signalFeedback,
    aiQualityScale: decision.aiQualityScale ?? null,
    decidedAt: decision.decidedAt,
    durationMs: decision.durationMs,
  });
}
