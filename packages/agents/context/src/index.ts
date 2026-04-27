// Skills — fine-grained units of context capability
export { textContextAuthorSkill, type ContextSkillInput } from "./skills/author-context.js";
export { textContextSimilarSkill } from "./skills/similar-events-context.js";

// Agent — composes whichever context skills the worker registered
export { ContextAgent } from "./agent.js";
