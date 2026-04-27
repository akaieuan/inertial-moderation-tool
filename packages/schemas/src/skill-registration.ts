import { z } from "zod";

/**
 * SkillRegistration — a *user-added* skill, persisted per-instance.
 *
 * Skills themselves are code (concrete `Skill<I, O>` implementations in
 * @inertial/agents-* packages). A registration is the *configured choice* to
 * activate one of them on a given instance — together with whatever runtime
 * config that skill needs (typically an API key for cloud providers).
 *
 * `catalogId` is the foreign key into `SKILL_CATALOG` (in @inertial/core).
 * The Runciter resolves catalogId → registration function at boot time.
 *
 * Default skills (regex, text-toxicity-local, etc.) do NOT have a registration
 * row — they're hard-coded in the runciter boot path. The dashboard
 * distinguishes the two with a `default` vs `user` chip.
 */
export const SkillRegistrationSchema = z.object({
  id: z.string().uuid(),
  /** Per-instance scope — same key as InstanceContext.id. */
  instanceId: z.string(),
  /** FK into SKILL_CATALOG. The Runciter switch-case keys on this. */
  catalogId: z.string(),
  /** Operator-set label. Defaults to the catalog entry's displayName at create time. */
  displayName: z.string(),
  /** Catalog-entry-specific shape — typically `{ apiKey: string }`. Validated by the
   * runciter against the catalog entry's `configFields` before persistence. */
  providerConfig: z.record(z.string(), z.unknown()),
  enabled: z.boolean(),
  createdAt: z.string().datetime(),
  /** Operator handle (e.g. "ieuan@local"). Null for seed/system registrations. */
  createdBy: z.string().nullable(),
});
export type SkillRegistration = z.infer<typeof SkillRegistrationSchema>;
