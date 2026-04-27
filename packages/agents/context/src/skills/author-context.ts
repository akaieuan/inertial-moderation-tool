import type {
  Skill,
  SkillContext,
  SignalOutput,
} from "@inertial/core";

export interface ContextSkillInput {
  contentEventId: string;
  authorId: string;
  instanceId: string;
}

/** History fetched via db.author.list-history. Mirrored from @inertial/db/tools to
 *  avoid taking a dependency on the db package from a pure agent module. */
interface AuthorHistoryToolOutput {
  events: Array<{ id: string }>;
  count: number;
  totalPriorActions: number;
}

/** Cap. 5 prior actions ≈ heavy-reputation author; we don't keep climbing
 *  forever or every habitual poster ends up at probability 1.0. */
const PRIOR_ACTION_FULL_SIGNAL = 5;

/**
 * Reputation context. Calls `db.author.list-history` and emits a single
 * `context.author-prior-actions` channel scaled by the author's cumulative
 * prior moderation actions.
 *
 * This is a *context* skill — its output is a hint for the reviewer, not a
 * routing decision. The policy engine sees the channel like any other but the
 * default policies don't gate on it.
 *
 * Absence is meaningful: when an author has zero prior events on this
 * instance, the skill emits no channel at all.
 */
export const textContextAuthorSkill: Skill<ContextSkillInput, SignalOutput> = {
  meta: {
    name: "text-context-author@local",
    version: "0.1.0",
    provider: "db",
    executionModel: "in-process",
    dataLeavesMachine: false,
    costEstimateUsd: 0,
    avgLatencyMs: 5,
    description:
      "Reputation context from the author's prior moderated events on this instance",
  },

  async run(input: ContextSkillInput, ctx: SkillContext): Promise<SignalOutput> {
    const history = await ctx.callTool<
      { authorId: string; limit?: number },
      AuthorHistoryToolOutput
    >("db.author.list-history", {
      authorId: input.authorId,
      limit: 25,
    });

    if (history.count === 0) return { channels: [] };

    const probability = Math.min(
      history.totalPriorActions / PRIOR_ACTION_FULL_SIGNAL,
      1.0,
    );

    return {
      channels: [
        {
          channel: "context.author-prior-actions",
          probability,
          emittedBy: "text-context-author@local",
          confidence: 0.9, // structural data, high confidence
          evidence: [
            {
              kind: "author-history",
              authorId: input.authorId,
              recentEventIds: history.events
                .slice(0, 5)
                .map((e) => e.id),
              priorActionCount: history.totalPriorActions,
            },
          ],
          notes: `${history.count} prior event(s), ${history.totalPriorActions} prior moderation action(s)`,
        },
      ],
    };
  },
};
