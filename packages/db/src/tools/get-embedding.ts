import { and, eq } from "drizzle-orm";
import type { Tool } from "@inertial/core";
import type { Database } from "../client.js";
import { embeddingKindEnum, eventEmbeddings } from "../schema.js";

export type GetEmbeddingKind = (typeof embeddingKindEnum.enumValues)[number];

export interface GetEmbeddingInput {
  contentEventId: string;
  kind: GetEmbeddingKind;
}

export interface GetEmbeddingOutput {
  /** Null when no embedding has been computed for this (event, kind) pair. */
  embedding: number[] | null;
  /** Model that produced it, if present. */
  model: string | null;
}

/**
 * Retrieve a previously-saved event embedding. Used by the similar-events
 * context skill: it needs the event's own embedding before it can ask the
 * find-similar tool for neighbours.
 *
 * Returns `{ embedding: null, model: null }` when no row exists — callers
 * should treat absence as "context unavailable" rather than an error.
 */
export function makeGetEmbeddingTool(
  db: Database,
): Tool<GetEmbeddingInput, GetEmbeddingOutput> {
  return {
    meta: {
      name: "db.embeddings.get",
      version: "0.1.0",
      kind: "db",
      description: "Look up the persisted embedding for a (content event, kind) pair",
      mutates: false,
    },
    async run(input) {
      const rows = await db
        .select({
          embedding: eventEmbeddings.embedding,
          model: eventEmbeddings.model,
        })
        .from(eventEmbeddings)
        .where(
          and(
            eq(eventEmbeddings.contentEventId, input.contentEventId),
            eq(eventEmbeddings.kind, input.kind),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (!row) return { embedding: null, model: null };
      return { embedding: row.embedding, model: row.model };
    },
  };
}
