/**
 * Hermetic test harness. Spins up an in-memory pglite Postgres with the
 * pgvector extension loaded, applies migrations once, and provides a
 * `truncateAll()` helper for inter-test isolation.
 *
 * Production code talks to a real Postgres via postgres-js (`createDatabase`).
 * The harness uses pglite via Drizzle's pglite adapter — same query API,
 * different runtime. The cast to `Database` is sound because Drizzle's query
 * builder is backend-agnostic.
 */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import type { Database } from "../src/executor.js";
import * as schema from "../src/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, "..", "migrations");

export interface TestHarness {
  db: Database;
  truncateAll: () => Promise<void>;
  close: () => Promise<void>;
}

export async function createTestHarness(): Promise<TestHarness> {
  const client = new PGlite({ extensions: { vector } });
  await client.waitReady;

  const drizzleDb = drizzle(client, { schema, casing: "snake_case" });
  await migrate(drizzleDb, { migrationsFolder });

  const db = drizzleDb as unknown as Database;

  return {
    db,
    truncateAll: async () => {
      // Listed child-first so cascade is unnecessary, but RESTART IDENTITY
      // also resets sequence counters between tests.
      await drizzleDb.execute(sql`
        TRUNCATE TABLE
          skill_calibrations,
          eval_runs,
          gold_events,
          reviewer_tags,
          review_decisions,
          review_items,
          structured_signals,
          agent_traces,
          event_embeddings,
          audit_entries,
          policies,
          skill_registrations,
          content_events
        RESTART IDENTITY CASCADE
      `);
    },
    close: async () => {
      await client.close();
    },
  };
}
