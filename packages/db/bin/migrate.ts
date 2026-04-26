#!/usr/bin/env tsx
/**
 * Programmatic migration runner. Used by `pnpm --filter @inertial/db db:migrate`
 * and by the CI harness. Honours DATABASE_URL.
 *
 * Before running drizzle-kit's migrator, we install pgvector and verify the
 * version is recent enough for the HNSW index syntax used in 0000_init.sql.
 * Failing here gives a clearer error than letting the migrator hit
 * "operator class \"vector_cosine_ops\" does not exist" deep in the SQL.
 */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDatabase, type DatabaseHandle } from "../src/client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, "..", "migrations");

/** HNSW indexes were added to pgvector in 0.5.0. */
const MIN_PGVECTOR_MAJOR = 0;
const MIN_PGVECTOR_MINOR = 5;

async function preflight(handle: DatabaseHandle): Promise<void> {
  // Install vector if not already present; idempotent.
  await handle.client.unsafe(`CREATE EXTENSION IF NOT EXISTS vector`);

  const rows = await handle.client.unsafe<{ version: string }[]>(
    `SELECT extversion::text AS version FROM pg_extension WHERE extname = 'vector'`,
  );
  const version = rows[0]?.version;
  if (!version) {
    throw new Error(
      "[db] pgvector is not installed in this Postgres. Use the pgvector/pgvector image or `CREATE EXTENSION vector;` after installing the .so.",
    );
  }
  const [major, minor] = version.split(".").map((n) => Number(n));
  const tooOld =
    (major ?? 0) < MIN_PGVECTOR_MAJOR ||
    ((major ?? 0) === MIN_PGVECTOR_MAJOR && (minor ?? 0) < MIN_PGVECTOR_MINOR);
  if (tooOld) {
    throw new Error(
      `[db] pgvector ${version} is too old; >= ${MIN_PGVECTOR_MAJOR}.${MIN_PGVECTOR_MINOR} required for the HNSW index in 0000_init.sql. Upgrade with \`ALTER EXTENSION vector UPDATE\` or rebuild on a newer image.`,
    );
  }
  console.log(`[db] pgvector ${version} ✓`);
}

async function main() {
  const handle = createDatabase();
  try {
    await preflight(handle);
    console.log(`[db] running migrations from ${migrationsFolder}`);
    await migrate(handle.db, { migrationsFolder });
    console.log("[db] migrations applied");
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  console.error("[db] migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
