import { BaseAgent, type AgentContext } from "@aur/core";
import type { ContentEvent, Modality, SignalChannel } from "@aur/schemas";

export class AudioAgent extends BaseAgent {
  readonly name = "audio-agent";
  readonly modalities: readonly Modality[] = ["audio"];
  readonly model = "stub-audio-v0";

  protected override async analyze(
    _event: ContentEvent,
    _ctx: AgentContext,
  ): Promise<SignalChannel[]> {
    return [];
  }
}
