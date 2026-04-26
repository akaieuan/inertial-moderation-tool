import type { ExtractTablesWithRelations } from "drizzle-orm";
import type {
  PgDatabase,
  PgQueryResultHKT,
  PgTransaction,
} from "drizzle-orm/pg-core";
import type * as schema from "./schema.js";

type Schema = typeof schema;
type FullSchema = ExtractTablesWithRelations<Schema>;

/**
 * Backend-agnostic Drizzle handle. Repositories accept this so the same code
 * can run against postgres-js (production) and pglite (tests).
 *
 * The first generic — the QueryResult HKT — is invariant in Drizzle, so we
 * widen with `any` rather than picking a concrete backend.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = PgDatabase<any, Schema, FullSchema>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DatabaseTx = PgTransaction<any, Schema, FullSchema>;

export type DbExecutor = Database | DatabaseTx;

// Surface the HKT type for callers that need it.
export type { PgQueryResultHKT };
