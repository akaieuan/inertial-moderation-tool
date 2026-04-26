import { asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { AuditEntrySchema, type AuditEntry } from "@inertial/schemas";
import type { Database } from "../client.js";
import type { DbExecutor } from "../executor.js";
import { chainHash } from "../hash.js";
import { auditEntries } from "../schema.js";
import { toIso } from "../utils.js";

type AuditRow = typeof auditEntries.$inferSelect;

function rowToEntry(row: AuditRow): AuditEntry {
  return AuditEntrySchema.parse({
    id: row.id,
    sequence: row.sequence,
    prevHash: row.prevHash,
    hash: row.hash,
    instanceId: row.instanceId,
    kind: row.kind,
    ref: { type: row.refType, id: row.refId },
    payload: row.payload,
    actorId: row.actorId,
    timestamp: toIso(row.timestamp),
  });
}

export interface AppendAuditEntryInput {
  instanceId: string;
  kind: AuditEntry["kind"];
  ref: AuditEntry["ref"];
  payload: Record<string, unknown>;
  actorId: string | null;
  /** ISO timestamp; defaults to now. Override for deterministic tests. */
  timestamp?: string;
}

/**
 * Atomic, race-free append to a per-instance hash chain.
 *
 * Uses a Postgres advisory transaction lock keyed on the instance_id hash so
 * concurrent appends for the *same* instance are serialized, while different
 * instances proceed in parallel. Within the transaction we read the latest
 * (sequence, hash) and compute the next entry — guaranteed consistent.
 */
export async function appendAuditEntry(
  db: Database,
  input: AppendAuditEntryInput,
): Promise<AuditEntry> {
  return db.transaction(async (tx) => {
    // Per-instance serialization. hashtext() returns a 32-bit signed int so the
    // lock space is bounded by the number of distinct instance ids.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${input.instanceId}))`,
    );

    const last = await tx
      .select({ sequence: auditEntries.sequence, hash: auditEntries.hash })
      .from(auditEntries)
      .where(eq(auditEntries.instanceId, input.instanceId))
      .orderBy(desc(auditEntries.sequence))
      .limit(1);

    const lastEntry = last[0];
    const sequence = (lastEntry?.sequence ?? -1) + 1;
    const prevHash = lastEntry?.hash ?? null;
    const timestamp = input.timestamp ?? new Date().toISOString();
    const hash = chainHash({ prevHash, payload: input.payload, timestamp });

    const inserted = await tx
      .insert(auditEntries)
      .values({
        instanceId: input.instanceId,
        sequence,
        prevHash,
        hash,
        kind: input.kind,
        refType: input.ref.type,
        refId: input.ref.id,
        payload: input.payload,
        actorId: input.actorId,
        timestamp,
      })
      .returning();

    const row = inserted[0];
    if (!row) throw new Error("audit append failed: no row returned");
    return rowToEntry(row);
  });
}

export interface ListAuditEntriesOptions {
  fromSequence?: number;
  limit?: number;
  kind?: AuditEntry["kind"];
}

export async function listAuditEntries(
  db: DbExecutor,
  instanceId: string,
  opts: ListAuditEntriesOptions = {},
): Promise<AuditEntry[]> {
  const conditions: SQL[] = [eq(auditEntries.instanceId, instanceId)];
  if (opts.fromSequence !== undefined) {
    conditions.push(sql`${auditEntries.sequence} >= ${opts.fromSequence}`);
  }
  if (opts.kind) conditions.push(eq(auditEntries.kind, opts.kind));

  const rows = await db
    .select()
    .from(auditEntries)
    .where(sql.join(conditions, sql` and `))
    .orderBy(asc(auditEntries.sequence))
    .limit(opts.limit ?? 1000);
  return rows.map(rowToEntry);
}

export interface ChainVerification {
  valid: boolean;
  inspected: number;
  /** Sequence number of the first inconsistent row, if any. */
  brokenAt?: number;
  reason?: string;
}

/**
 * Walk the hash chain for an instance and verify integrity. Re-derives every
 * row's hash from (prevHash, payload, timestamp) and checks linkage. Use this
 * as a periodic operator-facing check.
 */
export async function verifyAuditChain(
  db: DbExecutor,
  instanceId: string,
): Promise<ChainVerification> {
  const rows = await db
    .select()
    .from(auditEntries)
    .where(eq(auditEntries.instanceId, instanceId))
    .orderBy(asc(auditEntries.sequence));

  let prevHash: string | null = null;
  let expectedSequence = 0;

  for (const row of rows) {
    if (row.sequence !== expectedSequence) {
      return {
        valid: false,
        inspected: expectedSequence,
        brokenAt: row.sequence,
        reason: `sequence gap: expected ${expectedSequence}, got ${row.sequence}`,
      };
    }
    if (row.prevHash !== prevHash) {
      return {
        valid: false,
        inspected: expectedSequence,
        brokenAt: row.sequence,
        reason: `prev_hash mismatch at sequence ${row.sequence}`,
      };
    }
    // Postgres returns timestamps in its own format; normalize to ISO 8601 to
    // match the form used when the hash was originally computed.
    const expectedHash = chainHash({
      prevHash: row.prevHash,
      payload: row.payload,
      timestamp: toIso(row.timestamp),
    });
    if (row.hash !== expectedHash) {
      return {
        valid: false,
        inspected: expectedSequence,
        brokenAt: row.sequence,
        reason: `hash mismatch at sequence ${row.sequence}`,
      };
    }
    prevHash = row.hash;
    expectedSequence += 1;
  }

  return { valid: true, inspected: rows.length };
}
