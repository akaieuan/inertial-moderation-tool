import { BaseAgent, type AgentContext } from "@aur/core";
import type { ContentEvent, Modality, SignalChannel } from "@aur/schemas";

export { TextToxicityLocalAgent } from "./toxicity.js";

const URL_RE = /https?:\/\/\S+/;

/**
 * Heuristic spam-link detector. Tier-0: pure regex, no model. Emits
 * `spam-link-presence` only when a URL is actually present (per schema:
 * absence is meaningful — don't emit a low probability for "no signal").
 */
export class TextRegexAgent extends BaseAgent {
  readonly name = "text-regex";
  readonly modalities: readonly Modality[] = ["text"];
  readonly model = "regex-v0";

  protected override async analyze(
    event: ContentEvent,
    _ctx: AgentContext,
  ): Promise<SignalChannel[]> {
    if (!event.text) return [];
    const match = URL_RE.exec(event.text);
    if (!match) return [];

    const start = match.index;
    const end = start + match[0].length;
    return [
      {
        channel: "spam-link-presence",
        probability: 0.8,
        emittedBy: this.name,
        confidence: 0.4,
        evidence: [
          {
            kind: "text-span",
            start,
            end,
            excerpt: match[0],
          },
        ],
        notes: "URL detected in text",
      },
    ];
  }
}

/** Compatibility re-export so existing worker imports keep working. */
export { TextRegexAgent as TextAgent };
