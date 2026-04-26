// Skills — fine-grained, swappable units of capability
export { textSpamLinkSkill } from "./skills/spam-link.js";
export { textToxicityLocalSkill } from "./skills/toxicity-local.js";

// Agent — composes whichever skills the worker registered
export { TextAgent } from "./agent.js";

// Compatibility re-exports for callers that still reference the old class
// names. The composed TextAgent absorbs both responsibilities; the worker
// wires the corresponding skills into the SkillRegistry at boot.
export { TextAgent as TextRegexAgent } from "./agent.js";
export { TextAgent as TextToxicityLocalAgent } from "./agent.js";
