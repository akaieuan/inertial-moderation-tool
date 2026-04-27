import { and, desc, eq } from "drizzle-orm";
import {
  SkillRegistrationSchema,
  type SkillRegistration,
} from "@inertial/schemas";
import type { DbExecutor } from "../executor.js";
import { skillRegistrations } from "../schema.js";
import { toIso } from "../utils.js";

type SkillRegRow = typeof skillRegistrations.$inferSelect;
type SkillRegInsert = typeof skillRegistrations.$inferInsert;

function rowToReg(row: SkillRegRow): SkillRegistration {
  return SkillRegistrationSchema.parse({
    id: row.id,
    instanceId: row.instanceId,
    catalogId: row.catalogId,
    displayName: row.displayName,
    providerConfig: row.providerConfig,
    enabled: row.enabled,
    createdAt: toIso(row.createdAt),
    createdBy: row.createdBy,
  });
}

/** Idempotent upsert keyed by (instanceId, catalogId). */
export async function save(
  db: DbExecutor,
  reg: SkillRegistration,
): Promise<void> {
  const row: SkillRegInsert = {
    id: reg.id,
    instanceId: reg.instanceId,
    catalogId: reg.catalogId,
    displayName: reg.displayName,
    providerConfig: reg.providerConfig,
    enabled: reg.enabled,
    createdAt: reg.createdAt,
    createdBy: reg.createdBy,
  };
  await db
    .insert(skillRegistrations)
    .values(row)
    .onConflictDoUpdate({
      target: [skillRegistrations.instanceId, skillRegistrations.catalogId],
      set: {
        displayName: row.displayName,
        providerConfig: row.providerConfig,
        enabled: row.enabled,
      },
    });
}

export async function listByInstance(
  db: DbExecutor,
  instanceId: string,
): Promise<SkillRegistration[]> {
  const rows = await db
    .select()
    .from(skillRegistrations)
    .where(eq(skillRegistrations.instanceId, instanceId))
    .orderBy(desc(skillRegistrations.createdAt));
  return rows.map(rowToReg);
}

export async function getById(
  db: DbExecutor,
  id: string,
): Promise<SkillRegistration | null> {
  const rows = await db
    .select()
    .from(skillRegistrations)
    .where(eq(skillRegistrations.id, id))
    .limit(1);
  const row = rows[0];
  return row ? rowToReg(row) : null;
}

export async function getByInstanceCatalog(
  db: DbExecutor,
  instanceId: string,
  catalogId: string,
): Promise<SkillRegistration | null> {
  const rows = await db
    .select()
    .from(skillRegistrations)
    .where(
      and(
        eq(skillRegistrations.instanceId, instanceId),
        eq(skillRegistrations.catalogId, catalogId),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row ? rowToReg(row) : null;
}

/** Returns the updated row, or null if no registration with that id exists. */
export async function setEnabled(
  db: DbExecutor,
  id: string,
  enabled: boolean,
): Promise<SkillRegistration | null> {
  const rows = await db
    .update(skillRegistrations)
    .set({ enabled })
    .where(eq(skillRegistrations.id, id))
    .returning();
  const row = rows[0];
  return row ? rowToReg(row) : null;
}

/** Returns the updated row, or null if no registration with that id exists. */
export async function update(
  db: DbExecutor,
  id: string,
  patch: { displayName?: string; providerConfig?: Record<string, unknown>; enabled?: boolean },
): Promise<SkillRegistration | null> {
  const rows = await db
    .update(skillRegistrations)
    .set(patch)
    .where(eq(skillRegistrations.id, id))
    .returning();
  const row = rows[0];
  return row ? rowToReg(row) : null;
}

/** Returns true if a row was deleted. */
export async function remove(db: DbExecutor, id: string): Promise<boolean> {
  const rows = await db
    .delete(skillRegistrations)
    .where(eq(skillRegistrations.id, id))
    .returning({ id: skillRegistrations.id });
  return rows.length > 0;
}
