import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import type { Database } from "./executor.js";
import * as schema from "./schema.js";

export interface CreateDatabaseOptions {
  /** Postgres connection string. Defaults to `process.env.DATABASE_URL`. */
  url?: string;
  /** Max connections in the pool. Defaults to 10. */
  maxConnections?: number;
  /** Enable query logging to stderr. Defaults to false. */
  debug?: boolean;
}

export interface DatabaseHandle {
  db: Database;
  client: Sql;
  close: () => Promise<void>;
}

export function createDatabase(options: CreateDatabaseOptions = {}): DatabaseHandle {
  const url = options.url ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "createDatabase: DATABASE_URL is not set. Pass `url` explicitly or export the env var.",
    );
  }

  const client = postgres(url, {
    max: options.maxConnections ?? 10,
    onnotice: () => {},
    debug: options.debug ?? false,
  });

  const drizzleDb = drizzle(client, { schema, casing: "snake_case" });

  return {
    db: drizzleDb as unknown as Database,
    client,
    close: async () => {
      await client.end({ timeout: 5 });
    },
  };
}

// Re-export the canonical Database type from the executor module so callers
// can do `import type { Database } from "@aur/db"`.
export type { Database } from "./executor.js";
