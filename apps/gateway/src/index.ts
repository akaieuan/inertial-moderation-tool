import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { z } from "zod";
import {
  AuthorSchema,
  ContentEventSchema,
  InstanceContextSchema,
  MediaAssetSchema,
  ModalitySchema,
  SourceSchema,
} from "@aur/schemas";

const PORT = Number(process.env.PORT ?? 4000);
const WORKER_URL = process.env.WORKER_URL ?? "http://localhost:4001";

const GatewayEventInputSchema = z.object({
  id: z.string().uuid().optional(),
  sourceId: z.string(),
  source: SourceSchema,
  instance: InstanceContextSchema,
  modalities: z.array(ModalitySchema).min(1),
  text: z.string().nullable(),
  links: z.array(z.string().url()).optional(),
  // TODO: download + perceptually-hash media; for now pass through assuming
  // url is already an internal storage URL.
  media: z.array(MediaAssetSchema).optional(),
  hasContentWarning: z.boolean().optional(),
  contentWarningText: z.string().nullable().optional(),
  author: AuthorSchema,
  report: z
    .object({
      reporterId: z.string(),
      reportedAt: z.string().datetime(),
      reason: z.string().nullable(),
    })
    .nullable()
    .optional(),
  postedAt: z.string().datetime(),
  ingestedAt: z.string().datetime().optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
});

const app = new Hono();

app.get("/healthz", (c) => c.json({ ok: true }));

app.post("/v1/events", async (c) => {
  const raw = await c.req.json();
  const input = GatewayEventInputSchema.safeParse(raw);
  if (!input.success) {
    return c.json({ error: "invalid_input", issues: input.error.issues }, 400);
  }

  const normalized = {
    ...input.data,
    id: input.data.id ?? randomUUID(),
    ingestedAt: input.data.ingestedAt ?? new Date().toISOString(),
    links: input.data.links ?? [],
    media: input.data.media ?? [],
    hasContentWarning: input.data.hasContentWarning ?? false,
  };

  const event = ContentEventSchema.safeParse(normalized);
  if (!event.success) {
    return c.json(
      { error: "normalization_produced_invalid_event", issues: event.error.issues },
      500,
    );
  }

  const res = await fetch(`${WORKER_URL}/v1/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event.data),
  });
  const body = await res.json();
  return c.json(body, res.status as 200 | 400 | 500);
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[gateway] listening on http://localhost:${info.port}`);
});
