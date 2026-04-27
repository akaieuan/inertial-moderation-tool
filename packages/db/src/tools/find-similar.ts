import type { Tool } from "@inertial/core";
import type { Database } from "../client.js";
import {
  findSimilarEvents,
  type EmbeddingKind,
  type SimilarEvent,
} from "../repositories/embeddings.js";

export interface FindSimilarInput {
  /** Query vector. Length must match `event_embeddings.embedding` dimensionality (1536). */
  embedding: number[];
  /** Modality of the embedding being queried (so text queries don't match image embeddings). */
  kind: EmbeddingKind;
  limit?: number;
  /** Minimum cosine similarity in [-1, 1]. Defaults to 0.7. */
  minSimilarity?: number;
  /** When set, the matching event id is filtered out — used so an event isn't its own neighbour. */
  excludeContentEventId?: string;
}

export interface FindSimilarOutput {
  neighbors: SimilarEvent[];
  count: number;
}

/**
 * Top-K nearest neighbours within an instance using pgvector cosine
 * similarity. Read-only DB tool — wrapped around the existing
 * `findSimilarEvents` repository function.
 *
 * Skills call this via `ctx.callTool("db.events.find-similar", ...)`, which
 * auto-records the side-effect into the agent trace.
 */
export function makeFindSimilarEventsTool(
  db: Database,
): Tool<FindSimilarInput, FindSimilarOutput> {
  return {
    meta: {
      name: "db.events.find-similar",
      version: "0.1.0",
      kind: "db",
      description: "Top-K cosine-similar ContentEvents within an instance via pgvector",
      mutates: false,
    },
    async run(input, ctx) {
      // Slight over-fetch so we can still return `limit` after dropping the source event.
      const fetchLimit = (input.limit ?? 10) + (input.excludeContentEventId ? 1 : 0);
      const raw = await findSimilarEvents(db, {
        instanceId: ctx.instanceId,
        kind: input.kind,
        embedding: input.embedding,
        limit: fetchLimit,
        minSimilarity: input.minSimilarity,
      });
      const neighbors = (
        input.excludeContentEventId
          ? raw.filter((n) => n.contentEventId !== input.excludeContentEventId)
          : raw
      ).slice(0, input.limit ?? 10);
      return { neighbors, count: neighbors.length };
    },
  };
}
