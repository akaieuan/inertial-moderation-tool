import { BaseAgent, type AgentContext } from "@inertial/core";
import type { ContentEvent, Modality, SignalChannel } from "@inertial/schemas";

export class IdentityAgent extends BaseAgent {
  readonly name = "identity-agent";
  /** Identity is author-derived; runs on every event regardless of modality. */
  readonly modalities: readonly Modality[] = ["text", "image", "video", "audio", "link"];
  readonly model = "stub-identity-v0";

  protected override async analyze(
    _event: ContentEvent,
    _ctx: AgentContext,
  ): Promise<SignalChannel[]> {
    return [];
  }
}
