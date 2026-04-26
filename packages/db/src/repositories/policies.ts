import { and, desc, eq } from "drizzle-orm";
import { PolicySchema, type Policy } from "@inertial/schemas";
import type { DbExecutor } from "../executor.js";
import { policies } from "../schema.js";
import { nullToUndef, toIso } from "../utils.js";

type PolicyRow = typeof policies.$inferSelect;

function rowToPolicy(row: PolicyRow): Policy {
  return PolicySchema.parse({
    instance: row.instanceId,
    version: row.version,
    basedOn: nullToUndef(row.basedOn),
    rules: row.rules,
    default: row.defaultAction,
    createdAt: toIso(row.createdAt),
    createdBy: nullToUndef(row.createdBy),
  });
}

/** Persist a new policy version. (instance_id, version) is unique. */
export async function savePolicy(db: DbExecutor, policy: Policy): Promise<void> {
  await db.insert(policies).values({
    instanceId: policy.instance,
    version: policy.version,
    basedOn: policy.basedOn ?? null,
    rules: policy.rules,
    defaultAction: policy.default,
    createdAt: policy.createdAt,
    createdBy: policy.createdBy ?? null,
  });
}

/** The active (latest version) policy for an instance, if any. */
export async function getActivePolicy(
  db: DbExecutor,
  instanceId: string,
): Promise<Policy | null> {
  const rows = await db
    .select()
    .from(policies)
    .where(eq(policies.instanceId, instanceId))
    .orderBy(desc(policies.version))
    .limit(1);
  const row = rows[0];
  return row ? rowToPolicy(row) : null;
}

export async function getPolicyVersion(
  db: DbExecutor,
  instanceId: string,
  version: number,
): Promise<Policy | null> {
  const rows = await db
    .select()
    .from(policies)
    .where(and(eq(policies.instanceId, instanceId), eq(policies.version, version)))
    .limit(1);
  const row = rows[0];
  return row ? rowToPolicy(row) : null;
}

export async function listPolicyVersions(
  db: DbExecutor,
  instanceId: string,
): Promise<Policy[]> {
  const rows = await db
    .select()
    .from(policies)
    .where(eq(policies.instanceId, instanceId))
    .orderBy(desc(policies.version));
  return rows.map(rowToPolicy);
}
