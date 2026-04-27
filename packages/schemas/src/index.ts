/**
 * @inertial/schemas \u2014 the lingua franca of inertial.
 *
 * Every package in this monorepo speaks Zod-validated shapes from this file.
 * Connectors emit ContentEvent. Agents emit SignalChannel + AgentTrace.
 * The aggregator produces StructuredSignal. The PolicyEngine consumes it and
 * emits PolicyAction. Reviewers emit ReviewDecision. Everything writes
 * AuditEntry rows.
 *
 * If you find yourself reaching for `as` casts, the first question is
 * whether there's a missing shape here.
 */

export * from "./content-event.js";
export * from "./structured-signal.js";
export * from "./agent-trace.js";
export * from "./policy.js";
export * from "./review.js";
export * from "./audit.js";
export * from "./skill-registration.js";
