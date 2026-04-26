// Agent — composes whichever vision skills the runciter registered.
// Vision skills live in `@inertial/agents-cloud` (Claude Vision) — there is
// no local image classifier shipped here because small local vision models
// don't reliably do the high-stakes calls (minor-detection, intent, video
// temporal reasoning) that are the actual moderator pain.
export { VisionAgent } from "./agent.js";
