import type { AgentTrace, SignalChannel, TraceStep } from "@inertial/schemas";

export interface TraceFinalizeMeta {
  agent: string;
  contentEventId: string;
  model: string;
  startedAt: string;
  usage?: AgentTrace["usage"];
}

export class TraceCollector {
  private readonly steps: TraceStep[] = [];

  toolCall(tool: string, args: Record<string, unknown>): void {
    this.steps.push({
      kind: "tool-call",
      tool,
      args,
      timestamp: new Date().toISOString(),
    });
  }

  toolResult(tool: string, result: unknown, durationMs: number): void {
    this.steps.push({
      kind: "tool-result",
      tool,
      result,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  }

  thought(content: string): void {
    this.steps.push({
      kind: "thought",
      content,
      timestamp: new Date().toISOString(),
    });
  }

  decision(channel: SignalChannel): void {
    this.steps.push({
      kind: "decision",
      channel: channel.channel,
      probability: channel.probability,
      rationale: channel.notes ?? "",
      timestamp: new Date().toISOString(),
    });
  }

  error(message: string, recoverable: boolean): void {
    this.steps.push({
      kind: "error",
      message,
      recoverable,
      timestamp: new Date().toISOString(),
    });
  }

  finalize(meta: TraceFinalizeMeta): AgentTrace {
    return {
      agent: meta.agent,
      contentEventId: meta.contentEventId,
      model: meta.model,
      startedAt: meta.startedAt,
      endedAt: new Date().toISOString(),
      steps: this.steps,
      ...(meta.usage ? { usage: meta.usage } : {}),
    };
  }
}
