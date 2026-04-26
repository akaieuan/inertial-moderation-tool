#!/usr/bin/env node
// Seed the worker with 10 hand-crafted events covering each policy bucket.
// Posts through the gateway (which forwards to the worker), then prints
// the resulting queue.
//
// Pre-req: gateway on :4000 + worker on :4001 (and worker has finished
// its toxicity-model warmup, which is what gates /healthz).

import { randomUUID } from "node:crypto";

const GATEWAY = process.env.GATEWAY_URL ?? "http://localhost:4000";
const WORKER = process.env.WORKER_URL ?? "http://localhost:4001";
const INSTANCE = "smoke.local";

/**
 * Each entry: a short label + the text payload + the expected policy outcome
 * (for human-readable diff against actual). Content is deliberately
 * tame-but-classifiable so toxic-bert can score it without the seed file
 * being a slur archive.
 */
const SAMPLES = [
  {
    label: "01 clean post",
    text: "Just had a great cup of coffee this morning.",
    expect: "auto-allow",
  },
  {
    label: "02 url spam",
    text: "click here for FREE CRYPTO https://example-scam.invalid",
    expect: "queue.quick (spam-link)",
    author: { id: "spammer-7", handle: "spammer", priorActionCount: 3 },
  },
  {
    label: "03 mild insult",
    text: "what an idiot, you have no idea what you're talking about",
    expect: "queue.quick (insult/toxic)",
  },
  {
    label: "04 stronger toxic",
    text: "you're so stupid, I genuinely can't believe people like you exist",
    expect: "queue.quick (toxic > 0.7)",
  },
  {
    label: "05 threat",
    text: "I'll find you and you'll regret it. mark my words.",
    expect: "queue.deep (threat)",
  },
  {
    label: "06 hate-adjacent broad insult",
    text: "this whole community is trash, all of them are pathetic losers",
    expect: "queue.quick (insult)",
  },
  {
    label: "07 obscene profanity",
    text: "this is fucking ridiculous bullshit, total garbage",
    expect: "queue.quick (obscene)",
  },
  {
    label: "08 url + toxic combo",
    text: "you're a moron, also https://example-scam.invalid",
    expect: "queue.quick (multiple rules — first-match wins)",
  },
  {
    label: "09 reputable url (false positive demo)",
    text: "check the docs at https://en.wikipedia.org/wiki/Federation",
    expect: "queue.quick (regex doesn't know reputable)",
  },
  {
    label: "10 empty text",
    text: "",
    expect: "auto-allow",
  },
];

function makeEvent(text, override = {}) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    sourceId: `seed-${Math.random().toString(36).slice(2, 10)}`,
    source: "test",
    instance: { id: INSTANCE, source: "test" },
    modalities: ["text"],
    text: text === "" ? null : text,
    links: [],
    media: [],
    hasContentWarning: false,
    author: { id: "seeder", handle: "seeder", priorActionCount: 0 },
    postedAt: now,
    ingestedAt: now,
    ...override,
    // modalities must be non-empty even when text is null
    ...(text === "" ? { modalities: ["text"] } : {}),
  };
}

async function waitForHealth(label, url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/healthz`);
      if (res.ok) {
        console.log(`[seed] ${label} ready`);
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`[seed] ${label} did not become healthy within ${timeoutMs}ms`);
}

async function main() {
  await waitForHealth("worker", WORKER);
  await waitForHealth("gateway", GATEWAY);

  console.log(`\n[seed] posting ${SAMPLES.length} events to ${GATEWAY}/v1/events …\n`);
  const padLabel = Math.max(...SAMPLES.map((s) => s.label.length));

  for (const sample of SAMPLES) {
    const event = makeEvent(sample.text, sample.author ? { author: sample.author } : {});
    const res = await fetch(`${GATEWAY}/v1/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    });
    if (!res.ok) {
      console.error(`  ✗ ${sample.label}: HTTP ${res.status}`);
      continue;
    }
    const body = await res.json();
    const matched = body.matchedRuleId ?? "default";
    const channels = Object.entries(body.signal?.channels ?? {})
      .map(([k, v]) => `${k}=${v.probability.toFixed(2)}`)
      .join(", ");
    console.log(
      `  ${sample.label.padEnd(padLabel)}  →  ${body.action.kind.padEnd(20)}  [${matched}]  {${channels || "no channels"}}`,
    );
  }

  console.log("\n[seed] fetching queue …\n");
  const queueRes = await fetch(
    `${WORKER}/v1/queue?instance=${encodeURIComponent(INSTANCE)}`,
  );
  const queue = await queueRes.json();
  console.log(`[seed] queue has ${queue.items.length} items:`);
  for (const item of queue.items) {
    console.log(
      `  ${item.queue.padEnd(11)} ${item.recommendedAction.kind.padEnd(20)} ${item.recommendedAction.reason}`,
    );
  }
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
