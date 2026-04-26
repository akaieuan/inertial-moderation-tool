import type {
  AgentTrace,
  ContentEvent,
  Modality,
  SignalChannel,
} from "@aur/schemas";
import { TraceCollector } from "./trace.js";

export interface AgentContext {
  trace: TraceCollector;
  signal: AbortSignal;
  runId: string;
}

export interface AgentResult {
  channels: SignalChannel[];
  trace: AgentTrace;
}

export abstract class BaseAgent {
  abstract readonly name: string;
  abstract readonly modalities: readonly Modality[];
  abstract readonly model: string;

  shouldRun(event: ContentEvent): boolean {
    return event.modalities.some((m) => this.modalities.includes(m));
  }

  async run(event: ContentEvent, ctx: AgentContext): Promise<AgentResult> {
    const startedAt = new Date().toISOString();
    try {
      const channels = await this.analyze(event, ctx);
      for (const ch of channels) ctx.trace.decision(ch);
      return {
        channels,
        trace: ctx.trace.finalize({
          agent: this.name,
          contentEventId: event.id,
          model: this.model,
          startedAt,
        }),
      };
    } catch (err) {
      ctx.trace.error(err instanceof Error ? err.message : String(err), false);
      throw err;
    }
  }

  protected abstract analyze(
    event: ContentEvent,
    ctx: AgentContext,
  ): Promise<SignalChannel[]>;
}
