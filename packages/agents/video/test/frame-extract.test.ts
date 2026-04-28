import { describe, expect, it, beforeEach } from "vitest";
import {
  SkillRegistry,
  ToolRegistry,
  TraceCollector,
  makeSkillContext,
} from "@inertial/core";
import {
  _resetFfmpegCache,
  ffmpegAvailable,
  videoFrameExtractSkill,
  type VideoFrameExtractInput,
} from "../src/index.js";

function makeCtx() {
  const trace = new TraceCollector();
  return makeSkillContext({
    trace,
    tools: new ToolRegistry(),
    skills: new SkillRegistry(),
    signal: new AbortController().signal,
    runId: "test-run",
    instanceId: "test",
  });
}

const fixtureInput: VideoFrameExtractInput = {
  mediaAssetId: "44444444-4444-4444-8444-444444444444",
  url: "file:///nonexistent/test-video.mp4",
  mimeType: "video/mp4",
  count: 4,
};

describe("ffmpegAvailable", () => {
  beforeEach(() => {
    _resetFfmpegCache();
  });

  it("returns a boolean (cache resets cleanly)", async () => {
    const result = await ffmpegAvailable();
    expect(typeof result).toBe("boolean");
  });

  it("caches the detection result on subsequent calls", async () => {
    const first = await ffmpegAvailable();
    const second = await ffmpegAvailable();
    expect(first).toBe(second);
  });
});

describe("videoFrameExtractSkill.meta", () => {
  it("declares in-process execution + zero cost (local ffmpeg)", () => {
    expect(videoFrameExtractSkill.meta.executionModel).toBe("in-process");
    expect(videoFrameExtractSkill.meta.dataLeavesMachine).toBe(false);
    expect(videoFrameExtractSkill.meta.costEstimateUsd).toBe(0);
    expect(videoFrameExtractSkill.meta.name).toBe("video-frame-extract@local");
    expect(videoFrameExtractSkill.meta.provider).toBe("ffmpeg");
  });
});

// These behavioural tests run conditionally on ffmpeg being present. CI
// machines without ffmpeg installed exercise the "throws on missing" path
// via the contract test above; CI machines WITH ffmpeg get extra coverage.
describe("videoFrameExtractSkill.run (conditional)", () => {
  beforeEach(() => {
    _resetFfmpegCache();
  });

  it("throws when ffmpeg is unavailable on this machine", async () => {
    if (await ffmpegAvailable()) {
      // ffmpeg IS available here — this assertion can't run, but the
      // contract is still tested by the bounds + URL scheme tests below.
      return;
    }
    await expect(videoFrameExtractSkill.run(fixtureInput, makeCtx())).rejects.toThrow(
      /ffmpeg not found/,
    );
  });

  it("validates frame count bounds when ffmpeg is available", async () => {
    if (!(await ffmpegAvailable())) return; // skip when missing
    await expect(
      videoFrameExtractSkill.run({ ...fixtureInput, count: 0 }, makeCtx()),
    ).rejects.toThrow(/count must be in/);
    await expect(
      videoFrameExtractSkill.run({ ...fixtureInput, count: 100 }, makeCtx()),
    ).rejects.toThrow(/count must be in/);
  });

  it("rejects unsupported URL schemes when ffmpeg is available", async () => {
    if (!(await ffmpegAvailable())) return; // skip when missing
    await expect(
      videoFrameExtractSkill.run(
        { ...fixtureInput, url: "ftp://example.com/video.mp4" },
        makeCtx(),
      ),
    ).rejects.toThrow(/unsupported URL scheme/);
  });
});
