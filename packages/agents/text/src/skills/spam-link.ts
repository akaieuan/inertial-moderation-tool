import type {
  Skill,
  SkillContext,
  SignalOutput,
  TextClassificationInput,
} from "@inertial/core";

const URL_RE = /https?:\/\/\S+/;

/**
 * Heuristic skill — emits `spam-link-presence` when a URL appears in text.
 * Tier 0: pure regex, no model, zero data leaves the machine.
 *
 * Per the schema's "absence is meaningful" rule, the skill emits no channel
 * when no URL is present — rather than emitting a low-probability signal
 * for "no URL detected".
 */
export const textSpamLinkSkill: Skill<TextClassificationInput, SignalOutput> = {
  meta: {
    name: "text-detect-spam-link",
    version: "0.1.0",
    provider: "regex",
    executionModel: "in-process",
    dataLeavesMachine: false,
    costEstimateUsd: 0,
    avgLatencyMs: 1,
    description: "Heuristic URL presence check via regex",
  },

  async run(input: TextClassificationInput, _ctx: SkillContext): Promise<SignalOutput> {
    if (!input.text) return { channels: [] };
    const match = URL_RE.exec(input.text);
    if (!match) return { channels: [] };

    const start = match.index;
    const end = start + match[0].length;
    return {
      channels: [
        {
          channel: "spam-link-presence",
          probability: 0.8,
          emittedBy: "text-detect-spam-link",
          confidence: 0.4,
          evidence: [
            { kind: "text-span", start, end, excerpt: match[0] },
          ],
          notes: "URL detected in text",
        },
      ],
    };
  },
};
