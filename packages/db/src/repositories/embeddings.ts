import { and, cosineDistance, desc, eq, gt, sql } from "drizzle-orm";
import type { DbExecutor } from "../executor.js";
import { embeddingKindEnum, eventEmbeddings } from "../schema.js";

export type EmbeddingKind = (typeof embeddingKindEnum.enumValues)[number];

/** Fetch the persisted embedding for one (event, kind) pair. Null when absent. */
export async function getEmbeddingForEvent(
  db: DbExecutor,
  contentEventId: string,
  kind: EmbeddingKind,
): Promise<number[] | null> {
  const rows = await db
    .select({ embedding: eventEmbeddings.embedding })
    .from(eventEmbeddings)
    .where(
      and(
        eq(eventEmbeddings.contentEventId, contentEventId),
        eq(eventEmbeddings.kind, kind),
      ),
    )
    .limit(1);
  return rows[0]?.embedding ?? null;
}

export interface SaveEmbeddingInput {
  contentEventId: string;
  instanceId: string;
  kind: EmbeddingKind;
  model: string;
  /** Length must equal the column dimensionality (1536). */
  embedding: number[];
}

export async function saveEmbedding(
  db: DbExecutor,
  input: SaveEmbeddingInput,
): Promise<void> {
  await db
    .insert(eventEmbeddings)
    .values({
      contentEventId: input.contentEventId,
      instanceId: input.instanceId,
      kind: input.kind,
      model: input.model,
      embedding: input.embedding,
    })
    .onConflictDoUpdate({
      target: [eventEmbeddings.contentEventId, eventEmbeddings.kind],
      set: {
        embedding: input.embedding,
        model: input.model,
      },
    });
}

export interface SimilarEvent {
  contentEventId: string;
  /** Cosine similarity in [-1, 1]; 1.0 = identical direction. */
  similarity: number;
}

/**
 * Top-K nearest neighbors for a query embedding within an instance.
 * Uses pgvector cosine distance (`<=>`); we transform back to similarity
 * (`1 - distance`) for downstream consumers.
 */
export async function findSimilarEvents(
  db: DbExecutor,
  params: {
    instanceId: string;
    kind: EmbeddingKind;
    embedding: number[];
    limit?: number;
    /** Minimum similarity to include. Defaults to 0.7. */
    minSimilarity?: number;
  },
): Promise<SimilarEvent[]> {
  const limit = params.limit ?? 10;
  const minSimilarity = params.minSimilarity ?? 0.7;
  const distance = cosineDistance(eventEmbeddings.embedding, params.embedding);
  const similarity = sql<number>`1 - (${distance})`;

  const rows = await db
    .select({
      contentEventId: eventEmbeddings.contentEventId,
      similarity,
    })
    .from(eventEmbeddings)
    .where(
      sql`${eventEmbeddings.instanceId} = ${params.instanceId} and ${eventEmbeddings.kind} = ${params.kind} and 1 - (${distance}) >= ${minSimilarity}`,
    )
    .orderBy((t) => desc(t.similarity))
    .limit(limit);

  return rows.map((r) => ({
    contentEventId: r.contentEventId,
    similarity: Number(r.similarity),
  }));
}
