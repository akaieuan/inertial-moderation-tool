import type {
  Skill,
  SkillContext,
  SignalOutput,
} from "@inertial/core";
import type { ContextSkillInput } from "./author-context.js";

/** Mirror of `@inertial/db/tools` outputs to avoid pulling the db dep into a
 *  pure agent module. The actual shapes are validated at the tool boundary. */
interface GetEmbeddingOutput {
  embedding: number[] | null;
  model: string | null;
}
interface FindSimilarOutput {
  neighbors: Array<{ contentEventId: string; similarity: number }>;
  count: number;
}

/** Don't fire on weak matches — 0.78 is the empirical "feels related" floor for
 *  voyage-3-large @ 1536-dim on social posts. Tune per-instance later. */
const MIN_SIMILARITY = 0.78;
/** Top-K neighbours to surface in the reviewer's evidence panel. */
const NEIGHBOR_LIMIT = 5;

/**
 * Cross-event similarity context. Looks up this event's pre-computed text
 * embedding via `db.embeddings.get`, then queries `db.events.find-similar`
 * for the nearest neighbours within the same instance.
 *
 * Degrades gracefully:
 *  - If no embedding has been computed for this event (Voyage skill missing or
 *    failed earlier in the pipeline), returns no channels.
 *  - If no neighbours clear `MIN_SIMILARITY`, returns no channels.
 *
 * In both cases the channel's absence — not a low probability — is the signal
 * that no context was available.
 */
export const textContextSimilarSkill: Skill<ContextSkillInput, SignalOutput> = {
  meta: {
    name: "text-context-similar@local",
    version: "0.1.0",
    provider: "db",
    executionModel: "in-process",
    dataLeavesMachine: false,
    costEstimateUsd: 0,
    avgLatencyMs: 30,
    description:
      "pgvector cosine search over recent events from the same instance — requires the Voyage embedding skill to be active",
  },

  async run(input: ContextSkillInput, _ctx: SkillContext): Promise<SignalOutput> {
    const own = await _ctx.callTool<
      { contentEventId: string; kind: "text" },
      GetEmbeddingOutput
    >("db.embeddings.get", {
      contentEventId: input.contentEventId,
      kind: "text",
    });

    if (!own.embedding) return { channels: [] };

    const sim = await _ctx.callTool<
      {
        embedding: number[];
        kind: "text";
        limit: number;
        minSimilarity: number;
        excludeContentEventId: string;
      },
      FindSimilarOutput
    >("db.events.find-similar", {
      embedding: own.embedding,
      kind: "text",
      limit: NEIGHBOR_LIMIT,
      minSimilarity: MIN_SIMILARITY,
      excludeContentEventId: input.contentEventId,
    });

    const top = sim.neighbors[0];
    if (!top) return { channels: [] };

    // Cosine similarity is in [-1, 1]; the schema's probability field is [0, 1].
    // Clamp negatives to 0 (perfect dissimilarity reads as "no context").
    const probability = Math.max(0, Math.min(1, top.similarity));

    return {
      channels: [
        {
          channel: "context.similar-events-recent",
          probability,
          emittedBy: "text-context-similar@local",
          confidence: 0.85,
          evidence: [
            {
              kind: "similarity-cluster",
              neighbors: sim.neighbors.map((n) => ({
                contentEventId: n.contentEventId,
                similarity: n.similarity,
              })),
              score: probability,
            },
          ],
          notes: `${sim.neighbors.length} similar event(s), top similarity ${top.similarity.toFixed(3)}`,
        },
      ],
    };
  },
};
