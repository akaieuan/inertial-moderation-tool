import { and, eq, inArray, like } from "drizzle-orm";
import type { DbExecutor } from "../executor.js";
import { agentTraces, reviewDecisions, reviewItems } from "../schema.js";

const SHADOW_PREFIX = "shadow:";
/** Channel probability above which a shadow run counts as "this skill flagged the event". */
const SHADOW_FLAG_THRESHOLD = 0.5;

export interface SkillAgreement {
  skillName: string;
  /** Pairs evaluated — events with both a shadow prediction from this skill
   *  AND a recorded human decision. */
  pairs: number;
  /** Pairs where shadow_flagged === human_flagged. */
  agreed: number;
  /** agreed / pairs, in [0, 1]. */
  agreement: number;
  /** Human-flagged but shadow missed it (false negatives — local would have under-moderated). */
  shadowMissed: number;
  /** Shadow flagged but human approved (false positives — local would have over-moderated). */
  shadowOverflagged: number;
}

/**
 * Per-skill agreement between shadow predictions and reviewer verdicts.
 *
 * Pairs every (shadow trace, final review decision) for the same content
 * event and asks: "did the skill's flagging match the human's flagging?"
 *
 * Flagging is binary for v0:
 *   shadow_flagged = any decision step had probability > 0.5
 *   human_flagged  = verdict ∉ {approve, skip}
 *
 * Continuous-calibration (Brier / ECE) lands later via @inertial/eval.
 */
export async function getSkillAgreement(
  db: DbExecutor,
  instanceId: string,
): Promise<SkillAgreement[]> {
  // 1. All decided review items for this instance.
  const decidedItems = await db
    .select({
      itemId: reviewItems.id,
      contentEventId: reviewItems.contentEventId,
    })
    .from(reviewItems)
    .where(
      and(
        eq(reviewItems.instanceId, instanceId),
        eq(reviewItems.state, "decided"),
      ),
    );
  if (decidedItems.length === 0) return [];

  const eventIds = decidedItems.map((i) => i.contentEventId);
  const itemIds = decidedItems.map((i) => i.itemId);
  const itemByEvent = new Map(decidedItems.map((i) => [i.contentEventId, i.itemId]));

  // 2. Latest decision per review item — verdict is what we compare against.
  const decisions = await db
    .select({
      reviewItemId: reviewDecisions.reviewItemId,
      verdict: reviewDecisions.verdict,
    })
    .from(reviewDecisions)
    .where(inArray(reviewDecisions.reviewItemId, itemIds));
  const verdictByItem = new Map(decisions.map((d) => [d.reviewItemId, d.verdict]));

  // 3. All shadow traces on those events.
  const traces = await db
    .select({
      contentEventId: agentTraces.contentEventId,
      agent: agentTraces.agent,
      steps: agentTraces.steps,
    })
    .from(agentTraces)
    .where(
      and(
        inArray(agentTraces.contentEventId, eventIds),
        like(agentTraces.agent, `${SHADOW_PREFIX}%`),
      ),
    );

  // 4. Pair + tally.
  const bySkill = new Map<string, SkillAgreement>();
  for (const trace of traces) {
    const skillName = trace.agent.slice(SHADOW_PREFIX.length);
    const itemId = itemByEvent.get(trace.contentEventId);
    if (!itemId) continue;
    const verdict = verdictByItem.get(itemId);
    if (!verdict) continue;

    const shadowFlagged = trace.steps.some(
      (s) =>
        s.kind === "decision" && s.probability > SHADOW_FLAG_THRESHOLD,
    );
    const humanFlagged = verdict !== "approve" && verdict !== "skip";

    const row = bySkill.get(skillName) ?? {
      skillName,
      pairs: 0,
      agreed: 0,
      agreement: 0,
      shadowMissed: 0,
      shadowOverflagged: 0,
    };
    row.pairs += 1;
    if (shadowFlagged === humanFlagged) row.agreed += 1;
    if (humanFlagged && !shadowFlagged) row.shadowMissed += 1;
    if (shadowFlagged && !humanFlagged) row.shadowOverflagged += 1;
    bySkill.set(skillName, row);
  }

  return Array.from(bySkill.values()).map((row) => ({
    ...row,
    agreement: row.pairs > 0 ? row.agreed / row.pairs : 0,
  }));
}
