import { BaseAgent, type AgentContext } from "@inertial/core";
import type { ContentEvent, Modality, SignalChannel } from "@inertial/schemas";

export class VisionAgent extends BaseAgent {
  readonly name = "vision-agent";
  readonly modalities: readonly Modality[] = ["image"];
  readonly model = "stub-vision-v0";

  protected override async analyze(
    _event: ContentEvent,
    _ctx: AgentContext,
  ): Promise<SignalChannel[]> {
    return [];
  }
}
