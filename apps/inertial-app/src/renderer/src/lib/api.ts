import type {
  AgentTrace,
  AuditEntry,
  ContentEvent,
  ReviewItem,
  ReviewVerdict,
  SkillRegistration,
  StructuredSignal,
} from "@inertial/schemas";
import { isDemoModeActive } from "./demo-mode.js";
import {
  getDemoAudit,
  getDemoChainVerification,
  getDemoEventDetail,
  getDemoQueue,
  getDemoShadowAgreement,
  getDemoSkillCatalog,
  getDemoSkillRegistrations,
  getDemoSkills,
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
