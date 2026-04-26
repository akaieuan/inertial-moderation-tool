import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ContentEvent } from "@inertial/schemas";
import { VisionAgent } from "../src/agent.js";

function makeEvent(overrides: Partial<ContentEvent> = {}): ContentEvent {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    sourceId: "src-1",
    source: "test",
    instance: { id: "smoke.local", source: "test" },
    modalities: ["text"],
    text: null,
    links: [],
    media: [],
    hasContentWarning: false,
    author: { id: "user-1", handle: "u", priorActionCount: 0 },
    postedAt: now,
    ingestedAt: now,
    ...overrides,
  };
}

describe("VisionAgent.shouldRun", () => {
  const agent = new VisionAgent();

  it("returns false when modalities does not include 'image'", () => {
    const event = makeEvent({ modalities: ["text"], text: "hi" });
    expect(agent.shouldRun(event)).toBe(false);
  });

  it("returns false when modalities includes 'image' but media[] is empty", () => {
    // The orchestrator's modality filter would normally catch this, but the
    // agent itself should also be defensive — an event tagged with image
    // modality but carrying no image asset has nothing for vision skills to
    // run against.
    const event = makeEvent({ modalities: ["image"], media: [] });
    expect(agent.shouldRun(event)).toBe(false);
  });

  it("returns true when modalities includes 'image' AND media has an image asset", () => {
    const event = makeEvent({
      modalities: ["image"],
      media: [
        {
          id: randomUUID(),
          modality: "image",
          url: "https://example.com/cat.jpg",
          perceptualHash: null,
          mimeType: "image/jpeg",
          bytes: 12345,
        },
      ],
    });
    expect(agent.shouldRun(event)).toBe(true);
  });

  it("returns true on mixed text+image events with at least one image asset", () => {
    const event = makeEvent({
      modalities: ["text", "image"],
      text: "look at this",
      media: [
        {
          id: randomUUID(),
          modality: "image",
          url: "file:///tmp/cat.jpg",
          perceptualHash: null,
          mimeType: "image/jpeg",
          bytes: 100,
        },
      ],
    });
    expect(agent.shouldRun(event)).toBe(true);
  });

  it("ignores non-image media (e.g. video assets) in the same event", () => {
    const event = makeEvent({
      modalities: ["video"],
      media: [
        {
          id: randomUUID(),
          modality: "video",
          url: "https://example.com/clip.mp4",
          perceptualHash: null,
          mimeType: "video/mp4",
          bytes: 1_000_000,
          durationSec: 30,
        },
      ],
    });
    expect(agent.shouldRun(event)).toBe(false);
  });
});

describe("VisionAgent metadata", () => {
  it("declares image modality and the cloud skill by default", () => {
    const agent = new VisionAgent();
    expect(agent.modalities).toContain("image");
    expect(agent.skills).toContain("image-classify@anthropic");
  });

  it("supports overriding the skill list (e.g. for shadow-only or alt providers)", () => {
    const agent = new VisionAgent(["custom-skill@some-provider"]);
    expect(agent.skills).toEqual(["custom-skill@some-provider"]);
  });
});
