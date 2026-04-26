import type {
  AgentTrace,
  ContentEvent,
  ReviewItem,
  ReviewVerdict,
  StructuredSignal,
} from "@aur/schemas";

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
