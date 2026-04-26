import { randomUUID } from "node:crypto";
import type {
  AgentTrace,
  ContentEvent,
  Policy,
  ReviewDecision,
  ReviewItem,
  StructuredSignal,
} from "@aur/schemas";

export function makeContentEvent(overrides: Partial<ContentEvent> = {}): ContentEvent {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    sourceId: `src-${Math.random().toString(36).slice(2, 10)}`,
    source: "test",
    instance: { id: "smoke.local", source: "test" },
    modalities: ["text"],
    text: "hey check out https://example.com",
    links: ["https://example.com"],
    media: [],
    hasContentWarning: false,
    author: { id: "user-1", handle: "smoker", priorActionCount: 0 },
    postedAt: now,
    ingestedAt: now,
    ...overrides,
  };
}

export function makeStructuredSignal(
  contentEventId: string,
  overrides: Partial<StructuredSignal> = {},
): StructuredSignal {
  return {
    contentEventId,
    channels: {
      "spam-link-presence": {
        channel: "spam-link-presence",
        probability: 0.8,
        emittedBy: "text-agent",
        confidence: 0.4,
        evidence: [],
      },
    },
    entities: [],
    agentsRun: ["text-agent"],
    agentsFailed: [],
    latencyMs: 12,
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function makeAgentTrace(
  contentEventId: string,
  overrides: Partial<AgentTrace> = {},
): AgentTrace {
  const start = new Date(Date.now() - 100).toISOString();
  return {
    agent: "text-agent",
    contentEventId,
    model: "stub-text-v0",
    steps: [
      {
        kind: "decision",
        channel: "spam-link-presence",
        probability: 0.8,
        rationale: "URL detected",
        timestamp: start,
      },
    ],
    startedAt: start,
    endedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function makeReviewItem(
  contentEventId: string,
  overrides: Partial<ReviewItem> = {},
): ReviewItem {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    contentEventId,
    instanceId: "smoke.local",
    queue: "quick",
    recommendedAction: { kind: "queue.quick", reason: "spam-link-presence > 0.5" },
    state: "pending",
    decisions: [],
    finalVerdict: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function makeReviewDecision(
  reviewItemId: string,
  overrides: Partial<ReviewDecision> = {},
): ReviewDecision {
  return {
    id: randomUUID(),
    reviewItemId,
    reviewerId: "reviewer-1",
    verdict: "approve",
    rationale: "looked clean",
    signalFeedback: [
      { channel: "spam-link-presence", agreed: true },
    ],
    aiQualityScale: 3,
    decidedAt: new Date().toISOString(),
    durationMs: 4_800,
    ...overrides,
  };
}

export function makePolicy(
  instance: string,
  version: number,
  overrides: Partial<Policy> = {},
): Policy {
  return {
    instance,
    version,
    basedOn: "standard",
    rules: [
      {
        id: "rule-spam-link",
        expression: 'channels."spam-link-presence".probability > 0.7',
        action: { kind: "queue.quick", reason: "spam-link-presence > 0.7" },
      },
    ],
    default: { kind: "auto-allow", reason: "no rule matched" },
    createdAt: new Date().toISOString(),
    createdBy: "operator",
    ...overrides,
  };
}
