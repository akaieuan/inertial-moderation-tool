import { BaseAgent, type AgentContext } from "@aur/core";
import type { ContentEvent, Modality, SignalChannel } from "@aur/schemas";

export class VideoAgent extends BaseAgent {
  readonly name = "video-agent";
  readonly modalities: readonly Modality[] = ["video"];
  readonly model = "stub-video-v0";

  protected override async analyze(
    _event: ContentEvent,
    _ctx: AgentContext,
  ): Promise<SignalChannel[]> {
    return [];
  }
}
