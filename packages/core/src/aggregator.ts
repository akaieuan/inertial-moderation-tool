import type {
  ExtractedEntity,
  SignalChannel,
  StructuredSignal,
} from "@inertial/schemas";

export interface AggregationInput {
  contentEventId: string;
  results: ReadonlyArray<{
    agent: string;
    channels: SignalChannel[];
    entities?: ExtractedEntity[];
  }>;
  failures: ReadonlyArray<{ agent: string; error: string }>;
  latencyMs: number;
}

export function aggregate(input: AggregationInput): StructuredSignal {
  const channels: Record<string, SignalChannel> = {};
  const entities: ExtractedEntity[] = [];
  const agentsRun: string[] = [];

  for (const { agent, channels: chs, entities: ents } of input.results) {
    agentsRun.push(agent);
    for (const ch of chs) {
      const existing = channels[ch.channel];
      if (!existing || ch.confidence > existing.confidence) {
        channels[ch.channel] = ch;
      }
    }
    if (ents) entities.push(...ents);
  }

  return {
    contentEventId: input.contentEventId,
    channels,
    entities,
    agentsRun,
    agentsFailed: [...input.failures],
    latencyMs: input.latencyMs,
    generatedAt: new Date().toISOString(),
  };
}
