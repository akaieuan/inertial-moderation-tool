import type {
  AgentTrace,
  ContentEvent,
  Modality,
  SignalChannel,
} from "@inertial/schemas";
import type { SkillContext } from "./skill.js";

/**
 * AgentContext is identical to SkillContext — agents *are* skill composers.
 * Aliasing rather than duplicating keeps the field list authoritative in
 * one place (skill.ts) so adding new context capabilities (e.g. budget
 * tracker, structured logger) doesn't require touching two definitions.
 */
export type AgentContext = SkillContext;

export interface AgentResult {
  channels: SignalChannel[];
  trace: AgentTrace;
}

export abstract class BaseAgent {
  abstract readonly name: string;
  abstract readonly modalities: readonly Modality[];
  abstract readonly model: string;

  /** Skills this agent depends on. Optional — used for capability discovery
   * and policy-time validation. If a listed skill is unavailable at boot the
   * worker can refuse to start the agent rather than fail mid-event. */
  readonly skills: readonly string[] = [];

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
