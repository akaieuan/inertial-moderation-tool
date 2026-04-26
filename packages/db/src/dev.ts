/**
 * Development-mode database factory. Spins up an in-memory pglite (Postgres-
 * in-WASM with pgvector) and applies migrations. Same Drizzle query API as the
 * production postgres-js path, so repository code is identical.
 *
 * Use this in apps that want a hermetic local dev loop without Docker. State
 * is in-memory — every restart is a fresh DB. For persistence, point
 * DATABASE_URL at a real Postgres and use `createDatabase()` instead.
 */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema.js";
import type { Database } from "./executor.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// dist/dev.js → ../migrations
const migrationsFolder = resolve(__dirname, "..", "migrations");

export interface DevDatabaseHandle {
  db: Database;
  close: () => Promise<void>;
}

export async function createDevDatabase(): Promise<DevDatabaseHandle> {
  const client = new PGlite({ extensions: { vector } });
  await client.waitReady;

  const drizzleDb = drizzle(client, { schema, casing: "snake_case" });
  await migrate(drizzleDb, { migrationsFolder });

  return {
    db: drizzleDb as unknown as Database,
    close: async () => {
      await client.close();
    },
  };
}
