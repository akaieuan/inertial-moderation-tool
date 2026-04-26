import type {
  AgentTrace,
  AuditEntry,
  ContentEvent,
  ReviewItem,
  ReviewVerdict,
  StructuredSignal,
} from "@inertial/schemas";

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
  const res = await fetch(
    `${WORKER_URL}/v1/queue?instance=${encodeURIComponent(instanceId)}`,
  );
  if (!res.ok) throw new Error(`listQueue failed: ${res.status}`);
  const body = (await res.json()) as { items: ReviewItem[] };
  return body.items;
}

export interface EventDetail {
  event: ContentEvent;
  signal: StructuredSignal | null;
  traces: AgentTrace[];
}

export async function getEventDetail(eventId: string): Promise<EventDetail> {
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
  const res = await fetch(`${WORKER_URL}/v1/skills`);
  if (!res.ok) throw new Error(`getSkills failed: ${res.status}`);
  return (await res.json()) as SkillsResponse;
}

export async function listAudit(
  instanceId: string,
  opts: { limit?: number; from?: number } = {},
): Promise<AuditEntry[]> {
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
  const res = await fetch(
    `${WORKER_URL}/v1/audit/${encodeURIComponent(instanceId)}/verify`,
  );
  if (!res.ok) throw new Error(`verifyAudit failed: ${res.status}`);
  return (await res.json()) as AuditChainVerification;
}

export async function getShadowAgreement(
  instanceId: string,
): Promise<SkillAgreement[]> {
  const res = await fetch(
    `${WORKER_URL}/v1/shadow/${encodeURIComponent(instanceId)}/agreement`,
  );
  if (!res.ok) throw new Error(`getShadowAgreement failed: ${res.status}`);
  const body = (await res.json()) as { skills: SkillAgreement[] };
  return body.skills;
}
