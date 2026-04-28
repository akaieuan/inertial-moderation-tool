// Skills — fine-grained, swappable units of capability
export {
  videoFrameExtractSkill,
  ffmpegAvailable,
  _resetFfmpegCache,
  type VideoFrameExtractInput,
  type VideoFrameExtractOutput,
  type ExtractedFrame,
} from "./skills/frame-extract.js";

// Agent — composes whichever skills the worker registered
export { VideoAgent } from "./agent.js";
