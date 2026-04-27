import { useState } from "react";
import type { SignalChannel } from "@inertial/schemas";
import { cn } from "../lib/utils.js";

interface ChannelChipProps {
  channel: SignalChannel;
}

/**
 * Compact visualization of a single SignalChannel — channel name, probability
 * bar (severity-coloured), confidence indicator, and click-to-expand evidence
 * surfacing. Keeps the queue detail panel scannable while preserving the
 * full audit trail one click away.
 */
export function ChannelChip({ channel }: ChannelChipProps) {
  const [expanded, setExpanded] = useState(false);
  const severity = channelSeverity(channel.probability);

  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-xs transition-colors",
        SEVERITY_BG[severity],
        SEVERITY_BORDER[severity],
      )}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className="font-mono text-[color:var(--foreground)]">
          {channel.channel}
        </span>
        <span className="flex-1" />
        <span
          className="inline-block h-2 w-24 overflow-hidden rounded-full bg-[color:var(--border)]"
          aria-label={`probability ${channel.probability.toFixed(2)}`}
        >
          <span
            className={cn("block h-full", SEVERITY_BAR[severity])}
            style={{ width: `${Math.min(100, channel.probability * 100)}%` }}
          />
        </span>
        <span className="w-12 text-right tabular-nums text-[color:var(--muted-foreground)]">
          {channel.probability.toFixed(2)}
        </span>
        <span
          className="inline-block h-2 w-2 rounded-full bg-[color:var(--accent-blue)]"
          style={{ opacity: 0.3 + channel.confidence * 0.7 }}
          title={`confidence ${channel.confidence.toFixed(2)}`}
        />
        <span className="w-3 text-center text-[color:var(--muted-foreground)]">
          {expanded ? "−" : "+"}
        </span>
      </button>
      {expanded && (
        <div className="mt-2 space-y-1 border-t border-[color:var(--border)] pt-2 text-[color:var(--muted-foreground)]">
          <div>
            <span className="text-[color:var(--muted-foreground)]/60">by</span>{" "}
            <span className="font-mono">{channel.emittedBy}</span>
            {channel.notes && (
              <span className="ml-2">— {channel.notes}</span>
            )}
          </div>
          {channel.evidence.length > 0 && (
            <div className="space-y-0.5">
              {channel.evidence.map((ev, i) => (
                <div key={i} className="font-mono text-[10px]">
                  evidence[{i}]: {summarizeEvidence(ev)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type Severity = "low" | "medium" | "high";

function channelSeverity(p: number): Severity {
  if (p < 0.5) return "low";
  if (p < 0.8) return "medium";
  return "high";
}

const SEVERITY_BG: Record<Severity, string> = {
  low: "bg-emerald-500/5 dark:bg-emerald-500/10",
  medium: "bg-amber-500/10 dark:bg-amber-500/15",
  high: "bg-rose-500/10 dark:bg-rose-500/15",
};

const SEVERITY_BORDER: Record<Severity, string> = {
  low: "border-emerald-500/30 dark:border-emerald-500/40",
  medium: "border-amber-500/30 dark:border-amber-500/40",
  high: "border-rose-500/40 dark:border-rose-500/50",
};

const SEVERITY_BAR: Record<Severity, string> = {
  low: "bg-emerald-500/80",
  medium: "bg-amber-500/85",
  high: "bg-rose-500/90",
};

function summarizeEvidence(ev: SignalChannel["evidence"][number]): string {
  switch (ev.kind) {
    case "text-span":
      return `text-span [${ev.start}–${ev.end}]: "${ev.excerpt.slice(0, 60)}${ev.excerpt.length > 60 ? "…" : ""}"`;
    case "image-region":
      return `image-region ${ev.mediaAssetId.slice(0, 8)} bbox=(${ev.bbox.x.toFixed(2)}, ${ev.bbox.y.toFixed(2)}, ${ev.bbox.w.toFixed(2)}, ${ev.bbox.h.toFixed(2)})${ev.label ? ` "${ev.label}"` : ""}`;
    case "video-segment":
      return `video-segment ${ev.mediaAssetId.slice(0, 8)} ${ev.startSec}s–${ev.endSec}s`;
    case "audio-segment":
      return `audio-segment ${ev.mediaAssetId.slice(0, 8)} ${ev.startSec}s–${ev.endSec}s`;
    case "similarity-cluster":
      return `similarity-cluster score=${ev.score.toFixed(2)} (${ev.neighbors.length} neighbours)`;
    case "author-history":
      return `author-history ${ev.authorId.slice(0, 8)} (${ev.recentEventIds.length} prior, ${ev.priorActionCount} actions)`;
  }
}
