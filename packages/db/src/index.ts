// Schema (tables + enums) — also available via `@inertial/db/schema` for callers
// that only need types and want to skip the runtime client.
export * from "./schema.js";

// Connection
export {
  createDatabase,
  type Database,
  type DatabaseHandle,
  type CreateDatabaseOptions,
} from "./client.js";
export type { DatabaseTx, DbExecutor } from "./executor.js";

// Audit-chain primitives (exported for downstream verification tools).
export { canonicalJSON } from "./canonical.js";
export { chainHash } from "./hash.js";

// Repositories
export * as events from "./repositories/content-events.js";
export * as signals from "./repositories/structured-signals.js";
export * as traces from "./repositories/agent-traces.js";
export * as review from "./repositories/review.js";
export * as policy from "./repositories/policies.js";
export * as audit from "./repositories/audit.js";
export * as embeddings from "./repositories/embeddings.js";
export * as shadow from "./repositories/shadow.js";
export type { SkillAgreement } from "./repositories/shadow.js";
export * as skillRegistrations from "./repositories/skill-registrations.js";
export * as goldEvents from "./repositories/gold-events.js";
export * as evalRuns from "./repositories/eval-runs.js";
export * as skillCalibrations from "./repositories/skill-calibrations.js";
export * as reviewerTags from "./repositories/reviewer-tags.js";
export type { PersistedReviewerTag } from "./repositories/reviewer-tags.js";
