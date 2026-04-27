import type {
  AgentTrace,
  AuditEntry,
  ContentEvent,
  EvalRun,
  GoldEvent,
  ReviewerTag,
  ReviewItem,
  ReviewVerdict,
  SkillRegistration,
  StructuredSignal,
} from "@inertial/schemas";
import { isDemoModeActive } from "./demo-mode.js";
import {
  getDemoAudit,
  getDemoChainVerification,
  getDemoEvalRuns,
  getDemoEventDetail,
  getDemoLatestEvalRun,
  getDemoQueue,
  getDemoReviewerTagsForEvent,
  getDemoShadowAgreement,
  getDemoSkillCatalog,
  getDemoSkillRegistrations,
  getDemoSkills,
  getDemoTagCatalog,
  getDemoTagFrequencies,
} from "./demo-data.js";

// Mirror of @inertial/core's SkillCatalogEntry shape so the renderer doesn't
// need to import @inertial/core (and pull in its server-side dependencies).
export type SkillExecutionModel = "in-process" | "local-server" | "remote-api";

export interface SkillCatalogConfigField {
  key: string;
  label: string;
  type: "secret" | "text" | "select";
  options?: readonly string[];
  required: boolean;
  placeholder?: string;
  description?: string;
}

export interface SkillCatalogEntry {
  catalogId: string;
  family: string;
  displayName: string;
  provider: string;
  executionModel: SkillExecutionModel;
  dataLeavesMachine: boolean;
  costEstimateUsd: number;
  description: string;
  configFields: readonly SkillCatalogConfigField[];
  envVarHint?: string;
  defaultEnabled: boolean;
}

export type { SkillRegistration };

/** Mirrored from @inertial/db's `SkillAgreement` to avoid pulling pglite into the renderer bundle. */
export interface SkillAgreement {
  skillName: string;
  pairs: number;
  agreed: number;
  agreement: number;
  shadowMissed: number;
  shadowOverflagged: number;
}

const WORKER_URL =
  (import.meta.env.VITE_WORKER_URL as string | undefined) ??
  "http://localhost:4001";

export async function listQueue(instanceId: string): Promise<ReviewItem[]> {
  if (isDemoModeActive()) return getDemoQueue();
  const res = await fetch(
    `${WORKER_URL}/v1/queue?instance=${encodeURIComponent(instanceId)}`,
  );
  if (!res.ok) throw new Error(`listQueue failed: ${res.status}`);
  const body = (await res.json()) as { items: ReviewItem[] };
  return body.items;
}

/** Author moderation history surfaced inline in the queue detail panel. */
export interface AuthorHistorySummary {
  count: number;
  totalPriorActions: number;
  recent: Array<{ id: string; postedAt: string; excerpt: string }>;
}

/** Top-K nearest neighbours for the open event, with quick-render snippets. */
export interface SimilarEventSummary {
  contentEventId: string;
  similarity: number;
  excerpt: string;
  authorHandle: string;
}

export interface EventDetail {
  event: ContentEvent;
  signal: StructuredSignal | null;
  traces: AgentTrace[];
  /** Optional — populated by the runciter; absent in demo mode unless wired. */
  authorHistory?: AuthorHistorySummary;
  similarEvents?: SimilarEventSummary[];
}

export async function getEventDetail(eventId: string): Promise<EventDetail> {
  if (isDemoModeActive()) {
    const d = getDemoEventDetail(eventId);
    if (!d) throw new Error("event not in demo set");
    return d;
  }
  const res = await fetch(`${WORKER_URL}/v1/events/${eventId}`);
  if (!res.ok) throw new Error(`getEventDetail failed: ${res.status}`);
  return (await res.json()) as EventDetail;
}

export interface DecisionInput {
  reviewItemId: string;
  reviewerId: string;
  verdict: ReviewVerdict;
  rationale?: string;
  durationMs: number;
  /** Optional structured tags the reviewer applied during the review. */
  reviewerTags?: ReviewerTag[];
}

export async function commitDecision(input: DecisionInput): Promise<void> {
  if (isDemoModeActive()) return;
  const res = await fetch(
    `${WORKER_URL}/v1/reviews/${input.reviewItemId}/decisions`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reviewerId: input.reviewerId,
        verdict: input.verdict,
        rationale: input.rationale,
        durationMs: input.durationMs,
        reviewerTags: input.reviewerTags ?? [],
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`commitDecision failed: ${res.status} ${text}`);
  }
}

// --- Compliance ---

export interface SkillSummary {
  name: string;
  version: string;
  provider: string;
  executionModel: "in-process" | "local-server" | "remote-api";
  dataLeavesMachine: boolean;
  costEstimateUsd: number | null;
  description: string | null;
}

export interface ToolSummary {
  name: string;
  version: string;
  kind: "db" | "http" | "fs" | "compute";
  description: string;
  mutates: boolean;
}

export interface SkillsResponse {
  skills: SkillSummary[];
  tools: ToolSummary[];
  shadow: string[];
}

export async function getSkills(): Promise<SkillsResponse> {
  if (isDemoModeActive()) return getDemoSkills();
  const res = await fetch(`${WORKER_URL}/v1/skills`);
  if (!res.ok) throw new Error(`getSkills failed: ${res.status}`);
  return (await res.json()) as SkillsResponse;
}

export async function listAudit(
  instanceId: string,
  opts: { limit?: number; from?: number } = {},
): Promise<AuditEntry[]> {
  if (isDemoModeActive()) {
    const all = getDemoAudit();
    const limit = opts.limit ?? all.length;
    return all.slice(-limit);
  }
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.from !== undefined) params.set("from", String(opts.from));
  const qs = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(
    `${WORKER_URL}/v1/audit/${encodeURIComponent(instanceId)}${qs}`,
  );
  if (!res.ok) throw new Error(`listAudit failed: ${res.status}`);
  const body = (await res.json()) as { entries: AuditEntry[] };
  return body.entries;
}

export interface AuditChainVerification {
  valid: boolean;
  inspected: number;
  brokenAt?: number;
  reason?: string;
}

export async function verifyAudit(
  instanceId: string,
): Promise<AuditChainVerification> {
  if (isDemoModeActive()) return getDemoChainVerification();
  const res = await fetch(
    `${WORKER_URL}/v1/audit/${encodeURIComponent(instanceId)}/verify`,
  );
  if (!res.ok) throw new Error(`verifyAudit failed: ${res.status}`);
  return (await res.json()) as AuditChainVerification;
}

export async function getShadowAgreement(
  instanceId: string,
): Promise<SkillAgreement[]> {
  if (isDemoModeActive()) return getDemoShadowAgreement();
  const res = await fetch(
    `${WORKER_URL}/v1/shadow/${encodeURIComponent(instanceId)}/agreement`,
  );
  if (!res.ok) throw new Error(`getShadowAgreement failed: ${res.status}`);
  const body = (await res.json()) as { skills: SkillAgreement[] };
  return body.skills;
}

export async function checkRunciterHealth(): Promise<boolean> {
  if (isDemoModeActive()) return true;
  try {
    const res = await fetch(`${WORKER_URL}/healthz`);
    return res.ok;
  } catch {
    return false;
  }
}

// --- Skill catalog + registrations ----------------------------------------

export async function getSkillCatalog(): Promise<SkillCatalogEntry[]> {
  if (isDemoModeActive()) return getDemoSkillCatalog();
  const res = await fetch(`${WORKER_URL}/v1/skills/catalog`);
  if (!res.ok) throw new Error(`getSkillCatalog failed: ${res.status}`);
  const body = (await res.json()) as { catalog: SkillCatalogEntry[] };
  return body.catalog;
}

export async function listSkillRegistrations(
  instanceId: string,
): Promise<SkillRegistration[]> {
  if (isDemoModeActive()) return getDemoSkillRegistrations();
  const res = await fetch(
    `${WORKER_URL}/v1/skills/registrations?instance=${encodeURIComponent(instanceId)}`,
  );
  if (!res.ok) throw new Error(`listSkillRegistrations failed: ${res.status}`);
  const body = (await res.json()) as { registrations: SkillRegistration[] };
  return body.registrations;
}

export interface AddSkillRegistrationInput {
  instanceId: string;
  catalogId: string;
  displayName: string;
  providerConfig: Record<string, unknown>;
  enabled: boolean;
  createdBy: string | null;
}

export async function addSkillRegistration(
  input: AddSkillRegistrationInput,
): Promise<SkillRegistration> {
  if (isDemoModeActive()) {
    // Demo: synthesize a registration for optimistic UI.
    return {
      id: crypto.randomUUID(),
      ...input,
      createdAt: new Date().toISOString(),
    };
  }
  const res = await fetch(`${WORKER_URL}/v1/skills/registrations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`addSkillRegistration failed: ${res.status} ${text}`);
  }
  const body = (await res.json()) as { registration: SkillRegistration };
  return body.registration;
}

export async function toggleSkillRegistration(
  id: string,
  enabled: boolean,
): Promise<SkillRegistration> {
  if (isDemoModeActive()) {
    // Caller is expected to mirror in local state.
    return {
      id,
      instanceId: "default",
      catalogId: "demo",
      displayName: "demo",
      providerConfig: {},
      enabled,
      createdAt: new Date().toISOString(),
      createdBy: null,
    };
  }
  const res = await fetch(`${WORKER_URL}/v1/skills/registrations/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`toggleSkillRegistration failed: ${res.status} ${text}`);
  }
  const body = (await res.json()) as { registration: SkillRegistration };
  return body.registration;
}

export async function deleteSkillRegistration(id: string): Promise<void> {
  if (isDemoModeActive()) return;
  const res = await fetch(`${WORKER_URL}/v1/skills/registrations/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`deleteSkillRegistration failed: ${res.status}`);
}

// --- Eval harness ---------------------------------------------------------

export type { EvalRun, GoldEvent } from "@inertial/schemas";

export async function listEvalRuns(instance: string): Promise<EvalRun[]> {
  if (isDemoModeActive()) return getDemoEvalRuns();
  const res = await fetch(
    `${WORKER_URL}/v1/eval/runs?instance=${encodeURIComponent(instance)}`,
  );
  if (!res.ok) throw new Error(`listEvalRuns failed: ${res.status}`);
  const body = (await res.json()) as { runs: EvalRun[] };
  return body.runs;
}

export async function getLatestEvalRun(instance: string): Promise<EvalRun | null> {
  if (isDemoModeActive()) return getDemoLatestEvalRun();
  const res = await fetch(
    `${WORKER_URL}/v1/eval/runs/latest?instance=${encodeURIComponent(instance)}`,
  );
  if (!res.ok) throw new Error(`getLatestEvalRun failed: ${res.status}`);
  const body = (await res.json()) as { run: EvalRun | null };
  return body.run;
}

export async function getEvalRun(id: string): Promise<EvalRun | null> {
  if (isDemoModeActive()) return getDemoLatestEvalRun();
  const res = await fetch(`${WORKER_URL}/v1/eval/runs/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getEvalRun failed: ${res.status}`);
  const body = (await res.json()) as { run: EvalRun };
  return body.run;
}

export async function startEvalRun(input: {
  instanceId: string;
  goldSetVersion?: string;
  triggeredBy?: string;
}): Promise<{ runId: string }> {
  if (isDemoModeActive()) return { runId: "demo-run" };
  const res = await fetch(`${WORKER_URL}/v1/eval/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`startEvalRun failed: ${res.status} ${text}`);
  }
  return (await res.json()) as { runId: string };
}

export async function listGoldEvents(
  instance: string,
  opts: { channel?: string; source?: "hand-labeled" | "reviewer-derived" } = {},
): Promise<GoldEvent[]> {
  if (isDemoModeActive()) return [];
  const params = new URLSearchParams({ instance });
  if (opts.channel) params.set("channel", opts.channel);
  if (opts.source) params.set("source", opts.source);
  const res = await fetch(`${WORKER_URL}/v1/eval/gold-events?${params.toString()}`);
  if (!res.ok) throw new Error(`listGoldEvents failed: ${res.status}`);
  const body = (await res.json()) as { goldEvents: GoldEvent[] };
  return body.goldEvents;
}

// --- Tag layer ------------------------------------------------------------

export type TagModality =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "link"
  | "cross-modal";

export type TagSeverity = "info" | "warn" | "danger" | "neutral";

export interface TagCatalogEntry {
  tagId: string;
  displayName: string;
  description: string;
  applicableModalities: readonly TagModality[];
  severity: TagSeverity;
  group: string;
  supportsSegmentScope: boolean;
  supportsSpanScope: boolean;
}

export interface PersistedReviewerTag {
  id: string;
  contentEventId: string;
  reviewDecisionId: string;
  instanceId: string;
  reviewerId: string;
  tagId: string;
  scope?: ReviewerTag["scope"];
  note?: string;
  createdAt: string;
}

export async function getTagCatalog(): Promise<TagCatalogEntry[]> {
  if (isDemoModeActive()) return getDemoTagCatalog();
  const res = await fetch(`${WORKER_URL}/v1/tags/catalog`);
  if (!res.ok) throw new Error(`getTagCatalog failed: ${res.status}`);
  const body = (await res.json()) as { catalog: TagCatalogEntry[] };
  return body.catalog;
}

export async function listReviewerTagsForEvent(
  eventId: string,
): Promise<PersistedReviewerTag[]> {
  if (isDemoModeActive()) return getDemoReviewerTagsForEvent(eventId);
  const res = await fetch(
    `${WORKER_URL}/v1/tags?eventId=${encodeURIComponent(eventId)}`,
  );
  if (!res.ok) throw new Error(`listReviewerTagsForEvent failed: ${res.status}`);
  const body = (await res.json()) as { tags: PersistedReviewerTag[] };
  return body.tags;
}

export interface TagFrequencyRow {
  tagId: string;
  count: number;
}

export async function getTagFrequencies(
  instance: string,
): Promise<{ frequencies: TagFrequencyRow[]; total: number }> {
  if (isDemoModeActive()) return getDemoTagFrequencies();
  const res = await fetch(
    `${WORKER_URL}/v1/tags/frequencies?instance=${encodeURIComponent(instance)}`,
  );
  if (!res.ok) throw new Error(`getTagFrequencies failed: ${res.status}`);
  return (await res.json()) as { frequencies: TagFrequencyRow[]; total: number };
}
