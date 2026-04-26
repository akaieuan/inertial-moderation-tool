import { BaseAgent, type AgentContext } from "@inertial/core";
import type { ContentEvent, Modality, SignalChannel } from "@inertial/schemas";

export class ContextAgent extends BaseAgent {
  readonly name = "context-agent";
  readonly modalities: readonly Modality[] = ["text", "image", "video", "audio", "link"];
  readonly model = "stub-context-v0";

  protected override async analyze(
    _event: ContentEvent,
    _ctx: AgentContext,
  ): Promise<SignalChannel[]> {
    return [];
  }
}
