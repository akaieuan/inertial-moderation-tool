import { spawn } from "node:child_process";
import { mkdir, mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Skill, SkillContext } from "@inertial/core";

const FFMPEG = "ffmpeg";
const FFPROBE = "ffprobe";

/** Default frames-per-event. 6 keyframes covers ~30s clips with adequate
 *  visual coverage; bumping much higher pushes per-event cost without
 *  proportional signal. Configurable per call. */
const DEFAULT_FRAME_COUNT = 6;

export interface VideoFrameExtractInput {
  /** Stable id of the source video MediaAsset — preserved on emitted frames. */
  mediaAssetId: string;
  /** `file://...` for local fixtures, `http(s)://...` in production. */
  url: string;
  mimeType: string;
  /** Number of evenly-spaced keyframes to extract. Default 6. */
  count?: number;
}

export interface ExtractedFrame {
  /** Synthesized id: `${sourceMediaAssetId}:frame:${index}`. */
  id: string;
  /** `file://` URL pointing at the per-event temp dir. */
  url: string;
  mimeType: "image/jpeg";
  width: number;
  height: number;
  /** Timestamp (seconds) within the source video where this frame was sampled. */
  timestampSec: number;
  /** FK back to the source MediaAsset. */
  sourceMediaAssetId: string;
}

export interface VideoFrameExtractOutput {
  frames: ExtractedFrame[];
  /** Probed video duration in seconds. Null when ffprobe couldn't determine it. */
  durationSec: number | null;
}

/**
 * Detect system ffmpeg + ffprobe at module load. Result is cached so we
 * don't re-shell on every event. Mirrors the `voyageAvailable()` /
 * `anthropicAvailable()` pattern used by the cloud skills.
 *
 * Returns true only when BOTH binaries are reachable; ffprobe is needed
 * for duration probing before frame extraction.
 */
let ffmpegCheckCache: boolean | null = null;
export async function ffmpegAvailable(): Promise<boolean> {
  if (ffmpegCheckCache !== null) return ffmpegCheckCache;
  const ffmpegOk = await binaryExists(FFMPEG);
  const ffprobeOk = await binaryExists(FFPROBE);
  ffmpegCheckCache = ffmpegOk && ffprobeOk;
  return ffmpegCheckCache;
}

async function binaryExists(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(bin, ["-version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

/**
 * Extract evenly-spaced keyframes from a video MediaAsset using system
 * ffmpeg. Returns the extracted frames as new image MediaAssets — the
 * VideoAgent can then pipe these into the existing image classifiers
 * (image-classify@anthropic etc.) without any video-specific model.
 *
 * Why system ffmpeg (not ffmpeg-wasm):
 *  - 50-100x faster (native code)
 *  - Zero bundle bloat — keeps `pnpm install && pnpm seed` text-only
 *  - Native memory, no double allocation into a WASM heap
 *
 * The cost: requires `brew install ffmpeg` (or the apt/etc equivalent).
 * Documented as an opt-in dep in the README. The skill skips silently when
 * ffmpeg is missing — same posture as the cloud skills do for API keys.
 *
 * Privacy posture: dataLeavesMachine = false. ffmpeg runs locally;
 * extracted frames live in the OS temp dir.
 */
export const videoFrameExtractSkill: Skill<
  VideoFrameExtractInput,
  VideoFrameExtractOutput
> = {
  meta: {
    name: "video-frame-extract@local",
    version: "0.1.0",
    provider: "ffmpeg",
    executionModel: "in-process",
    dataLeavesMachine: false,
    costEstimateUsd: 0,
    avgLatencyMs: 800,
    description:
      "Extract N evenly-spaced keyframes from a video MediaAsset via system ffmpeg",
  },

  async run(
    input: VideoFrameExtractInput,
    ctx: SkillContext,
  ): Promise<VideoFrameExtractOutput> {
    if (!(await ffmpegAvailable())) {
      throw new Error(
        "ffmpeg not found on PATH — install with `brew install ffmpeg` " +
          "(or the apt/yum equivalent)",
      );
    }

    const count = input.count ?? DEFAULT_FRAME_COUNT;
    if (count < 1 || count > 60) {
      throw new Error(`video-frame-extract: count must be in [1, 60]; got ${count}`);
    }

    const sourcePath = await materializeVideo(input.url, ctx);
    const duration = await probeDuration(sourcePath);

    if (duration === null || duration <= 0) {
      ctx.trace.thought(
        `video-frame-extract: could not probe duration for ${input.mediaAssetId.slice(0, 8)}`,
      );
      return { frames: [], durationSec: null };
    }

    const outDir = await mkdtemp(join(tmpdir(), "inertial-frames-"));
    await mkdir(outDir, { recursive: true });

    const frames: ExtractedFrame[] = [];
    for (let i = 0; i < count; i += 1) {
      // Sample at evenly-spaced offsets in the open interval (0, duration).
      // Avoids exact 0 (often a black/intro frame) and exact end (often missing).
      const fraction = (i + 1) / (count + 1);
      const timestampSec = duration * fraction;
      const outPath = join(outDir, `frame-${i.toString().padStart(2, "0")}.jpg`);
      const dimensions = await extractKeyframe(sourcePath, timestampSec, outPath);
      if (!dimensions) continue;
      frames.push({
        id: `${input.mediaAssetId}:frame:${i}`,
        url: `file://${outPath}`,
        mimeType: "image/jpeg",
        width: dimensions.width,
        height: dimensions.height,
        timestampSec,
        sourceMediaAssetId: input.mediaAssetId,
      });
    }

    ctx.trace.thought(
      `video-frame-extract: ${frames.length}/${count} frames from ${duration.toFixed(1)}s video`,
    );
    return { frames, durationSec: duration };
  },
};

// --- ffmpeg helpers --------------------------------------------------------

/** Return a local filesystem path for the input URL. file:// URLs are
 *  decoded directly; http(s):// URLs are downloaded to a temp file first. */
async function materializeVideo(url: string, ctx: SkillContext): Promise<string> {
  if (url.startsWith("file://")) {
    const path = fileURLToPath(url);
    await stat(path); // throws if missing
    return path;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const tmpDir = await mkdtemp(join(tmpdir(), "inertial-video-"));
    const path = join(tmpDir, "source.mp4");
    const res = await fetch(url, { signal: ctx.signal });
    if (!res.ok) {
      throw new Error(`video-frame-extract: HTTP ${res.status} for ${url}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path, buf);
    return path;
  }
  throw new Error(`video-frame-extract: unsupported URL scheme: ${url}`);
}

/** Run ffprobe to read the container duration. Returns null on parse failure. */
async function probeDuration(path: string): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(FFPROBE, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      path,
    ]);
    let out = "";
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code !== 0) return resolve(null);
      const n = Number(out.trim());
      resolve(Number.isFinite(n) ? n : null);
    });
  });
}

/**
 * Seek to `timestampSec` in `sourcePath` and write a single JPEG to
 * `outPath`. Returns the actual output dimensions, or null on failure.
 *
 * `-ss` BEFORE `-i` enables fast input-side seek (decodes from the nearest
 * keyframe rather than from frame 0). Adequate accuracy for moderation.
 */
async function extractKeyframe(
  sourcePath: string,
  timestampSec: number,
  outPath: string,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const child = spawn(FFMPEG, [
      "-y", // overwrite without prompt
      "-ss",
      String(timestampSec),
      "-i",
      sourcePath,
      "-frames:v",
      "1",
      "-q:v",
      "3", // good quality, small size
      outPath,
    ]);
    child.on("error", () => resolve(null));
    child.on("close", async (code) => {
      if (code !== 0) return resolve(null);
      // Probe the output to get its dimensions — ffmpeg prints them to stderr
      // but parsing structured ffprobe output is more robust.
      const dims = await probeDimensions(outPath);
      resolve(dims);
    });
  });
}

async function probeDimensions(
  path: string,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const child = spawn(FFPROBE, [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0:s=,",
      path,
    ]);
    let out = "";
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code !== 0) return resolve(null);
      const [w, h] = out.trim().split(",").map(Number);
      if (!Number.isFinite(w) || !Number.isFinite(h)) return resolve(null);
      resolve({ width: w as number, height: h as number });
    });
  });
}

/** Reset the cached ffmpeg detection — exposed for tests. */
export function _resetFfmpegCache(): void {
  ffmpegCheckCache = null;
}
