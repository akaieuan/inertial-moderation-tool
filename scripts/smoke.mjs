#!/usr/bin/env node
// End-to-end smoke. POSTs a fake ContentEvent to the gateway, asserts the
// worker dispatched the text agent and returned a StructuredSignal containing
// a high-probability spam-link-presence channel.
//
// Pre-req: gateway listening on :4000, worker listening on :4001.
//   pnpm --filter @aur/worker dev
//   pnpm --filter @aur/gateway dev

const GATEWAY = process.env.GATEWAY_URL ?? "http://localhost:4000";

const event = {
  id: "11111111-1111-4111-8111-111111111111",
  sourceId: "smoke-1",
  source: "test",
  instance: { id: "smoke.local", source: "test" },
  modalities: ["text"],
  text: "hey check out https://example.com",
  links: ["https://example.com"],
  media: [],
  hasContentWarning: false,
  author: { id: "user-1", handle: "smoker", priorActionCount: 0 },
  postedAt: "2026-04-25T12:00:00.000Z",
  ingestedAt: "2026-04-25T12:00:01.000Z",
};

function fail(msg, ctx) {
  console.error(`[smoke] FAIL: ${msg}`);
  if (ctx !== undefined) console.error(JSON.stringify(ctx, null, 2));
  process.exit(1);
}

const res = await fetch(`${GATEWAY}/v1/events`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(event),
}).catch((err) => fail(`fetch failed — is the gateway running? ${err.message}`));

if (!res.ok) fail(`gateway returned ${res.status}`, await res.json().catch(() => null));

const body = await res.json();
const signal = body?.signal;
if (!signal) fail("response missing `signal`", body);

if (!signal.agentsRun?.includes("text-agent")) {
  fail("text-agent did not run", signal);
}

const ch = signal.channels?.["spam-link-presence"];
if (!ch) fail("missing spam-link-presence channel", signal);
if (ch.probability <= 0.5) fail(`probability too low: ${ch.probability}`, ch);

console.log("[smoke] PASS");
console.log(JSON.stringify({ agentsRun: signal.agentsRun, channels: signal.channels }, null, 2));
