import type { Tool } from "@inertial/core";
import type { ContentEvent } from "@inertial/schemas";
import type { Database } from "../client.js";
import { listContentEventsByAuthor } from "../repositories/content-events.js";

export interface AuthorHistoryInput {
  authorId: string;
  /** Defaults to 50. */
  limit?: number;
}

export interface AuthorHistoryOutput {
  events: ContentEvent[];
  count: number;
  /** Sum of `priorActionCount` across the returned events — quick reputation signal. */
  totalPriorActions: number;
}

/**
 * Look up an author's recent ContentEvents on a given instance. Used by
 * IdentityAgent and ContextAgent for reputation + behavioral context.
 *
 * Tool — deterministic, read-only. No reasoning here.
 */
export function makeAuthorHistoryTool(
  db: Database,
): Tool<AuthorHistoryInput, AuthorHistoryOutput> {
  return {
    meta: {
      name: "db.author.list-history",
      version: "0.1.0",
      kind: "db",
      description: "Recent ContentEvents by author within an instance",
      mutates: false,
    },
    async run(input, ctx) {
      const events = await listContentEventsByAuthor(db, ctx.instanceId, input.authorId, {
        limit: input.limit ?? 50,
      });
      return {
        events,
        count: events.length,
        totalPriorActions: events.reduce(
          (sum, e) => sum + e.author.priorActionCount,
          0,
        ),
      };
    },
  };
}
