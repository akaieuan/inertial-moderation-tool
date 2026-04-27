import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronUp, X as CloseIcon } from "lucide-react";
import type {
  AgentTrace,
  ReviewItem,
  ReviewVerdict,
  StructuredSignal,
} from "@inertial/schemas";
import { MiniTrace, type TraceStep } from "../components/hitl/MiniTrace.js";
import { ChannelChip } from "../components/ChannelChip.js";
import { ImageEvidence, type BboxOverlay } from "../components/ImageEvidence.js";
import { AuthorBadge } from "../components/AuthorBadge.js";
import { RelativeTime } from "../components/RelativeTime.js";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card.js";
import { Button } from "../components/ui/button.js";
import { Separator } from "../components/ui/separator.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { commitDecision, getEventDetail, type EventDetail } from "../lib/api.js";
import { cn } from "../lib/utils.js";

const REVIEWER = "ieuan@local";

interface QueueDetailPanelProps {
  item: ReviewItem;
  onCommit: () => Promise<void> | void;
  onClose: () => void;
}

export function QueueDetailPanel({ item, onCommit, onClose }: QueueDetailPanelProps) {
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [rationale, setRationale] = useState("");
  const openedAt = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    setRationale("");
    openedAt.current = Date.now();
    getEventDetail(item.contentEventId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item.contentEventId]);

  const decide = async (verdict: ReviewVerdict) => {
    if (committing || item.state === "decided") return;
    setCommitting(true);
    try {
      await commitDecision({
        reviewItemId: item.id,
        reviewerId: REVIEWER,
        verdict,
        rationale: rationale.trim() || undefined,
        durationMs: Math.max(1, Date.now() - openedAt.current),
      });
      await onCommit();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCommitting(false);
    }
  };

  const decided = item.state === "decided";

  return (
    <Card className="flex h-full flex-col gap-0 overflow-hidden border-0 bg-transparent p-0 shadow-none">
      <div className="flex items-center gap-2 border-b border-border bg-muted/10 px-4 py-2">
        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          placeholder="Rationale (optional)"
          rows={1}
          disabled={committing || decided}
          className={cn(
            "h-7 flex-1 resize-none rounded-md border border-input bg-background px-2.5 py-1 text-[12px] leading-tight",
            "placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        />
        <Button
          size="sm"
          className="h-7 bg-emerald-600 px-2.5 text-[12px] text-white hover:bg-emerald-700"
          disabled={committing || decided}
          onClick={() => decide("approve")}
        >
          <Check className="mr-1 h-3 w-3" />
          Approve
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className="h-7 px-2.5 text-[12px]"
          disabled={committing || decided}
          onClick={() => decide("remove")}
        >
          Remove
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2.5 text-[12px]"
          disabled={committing || decided}
          onClick={() => decide("escalate")}
        >
          Escalate
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close detail panel"
          title="Esc"
          className="h-7 w-7 text-muted-foreground"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && <SkeletonBody />}
        {error && (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}
        {detail && !loading && <DetailBody detail={detail} />}
      </div>
    </Card>
  );
}

function DetailBody({ detail }: { detail: EventDetail }) {
  const { event, signal, traces } = detail;
  const overlaysByMedia = useMemo(() => buildOverlayMap(signal), [signal]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <AuthorBadge author={event.author} size="md" />
        <RelativeTime
          iso={event.postedAt}
          className="shrink-0 text-xs text-muted-foreground tabular-nums"
        />
      </div>

      {event.text && (
        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {event.text}
          </p>
        </div>
      )}

      {event.media.length > 0 && (
        <div>
          <SectionLabel>Media</SectionLabel>
          <div className="mt-2 flex flex-wrap gap-3">
            {event.media.map((m) => (
              <div key={m.id}>
                <ImageEvidence
                  src={m.url}
                  alt={`media ${m.id.slice(0, 8)}`}
                  bboxes={overlaysByMedia.get(m.id) ?? []}
                />
                <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {m.modality} · {m.mimeType}
                  {m.width && m.height ? ` · ${m.width}×${m.height}` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {event.links.length > 0 && (
        <div>
          <SectionLabel>Links</SectionLabel>
          <ul className="mt-2 space-y-1">
            {event.links.map((l) => (
              <li key={l} className="truncate font-mono text-xs text-muted-foreground">
                {l}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Separator />

      {signal && (
        <div>
          <SectionLabel>Channels</SectionLabel>
          {Object.values(signal.channels).length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              no channels emitted
            </p>
          ) : (
            <div className="mt-2 flex flex-col gap-2">
              {Object.values(signal.channels)
                .sort((a, b) => b.probability - a.probability)
                .map((ch) => (
                  <ChannelChip key={ch.channel} channel={ch} />
                ))}
            </div>
          )}
        </div>
      )}

      <div>
        <SectionLabel>Event metadata</SectionLabel>
        <dl className="mt-2 grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 text-xs">
          <Row label="Instance">{event.instance.id}</Row>
          <Row label="Source">{event.source}</Row>
          <Row label="Modalities">{event.modalities.join(", ")}</Row>
          <Row label="Posted">{event.postedAt}</Row>
        </dl>
      </div>

      {traces.length > 0 && <TracesSection traces={traces} />}
    </div>
  );
}

function TracesSection({ traces }: { traces: AgentTrace[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between rounded-md hover:bg-muted/40 px-1 py-1"
      >
        <SectionLabel>Agent traces ({traces.length})</SectionLabel>
        <ChevronUp
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform",
            !expanded && "rotate-180",
          )}
        />
      </button>
      {expanded && (
        <div className="mt-3 flex flex-col gap-3">
          {traces.map((t, i) => (
            <div key={`${t.agent}-${t.startedAt}-${i}`} className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-mono">{t.agent}</span>
                <span className="text-muted-foreground">{t.model}</span>
              </div>
              <MiniTrace steps={traceToSteps(t)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono text-foreground truncate">{children}</dd>
    </>
  );
}

function SkeletonBody() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-24 w-full rounded-md" />
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-32 w-full rounded-md" />
    </div>
  );
}

function buildOverlayMap(signal: StructuredSignal | null): Map<string, BboxOverlay[]> {
  const map = new Map<string, BboxOverlay[]>();
  if (!signal) return map;
  for (const channel of Object.values(signal.channels)) {
    const severity =
      channel.probability >= 0.8 ? "high" : channel.probability >= 0.5 ? "medium" : "low";
    for (const ev of channel.evidence) {
      if (ev.kind !== "image-region") continue;
      const bbox: BboxOverlay = {
        ...ev.bbox,
        label: `${channel.channel} ${channel.probability.toFixed(2)}`,
        severity,
      };
      const arr = map.get(ev.mediaAssetId) ?? [];
      arr.push(bbox);
      map.set(ev.mediaAssetId, arr);
    }
  }
  return map;
}

function traceToSteps(trace: AgentTrace): TraceStep[] {
  return trace.steps.map((s) => {
    if (s.kind === "decision") {
      return {
        type: "result",
        label: `${s.channel} = ${s.probability.toFixed(3)}`,
        detail: s.rationale,
      };
    }
    if (s.kind === "thought") return { type: "thought", label: s.content };
    if (s.kind === "tool-call") {
      return {
        type: "action",
        label: s.tool,
        detail: JSON.stringify(s.args).slice(0, 200),
      };
    }
    if (s.kind === "tool-result") {
      return {
        type: "result",
        label: `${s.tool} (${s.durationMs}ms)`,
        detail:
          typeof s.result === "string"
            ? s.result
            : JSON.stringify(s.result).slice(0, 200),
      };
    }
    return { type: "result", label: `error: ${s.message}` };
  });
}
