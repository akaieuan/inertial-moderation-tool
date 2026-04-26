import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentTrace,
  ContentEvent,
  EvidencePointer,
  ReviewItem,
  ReviewVerdict,
  StructuredSignal,
} from "@inertial/schemas";
import { ApproveRejectRow } from "../components/hitl/ApproveRejectRow.js";
import { MiniTrace, type TraceStep } from "../components/hitl/MiniTrace.js";
import { ChannelChip } from "../components/ChannelChip.js";
import { ImageEvidence, type BboxOverlay } from "../components/ImageEvidence.js";
import { commitDecision, getEventDetail, type EventDetail } from "../lib/api.js";
import { cn } from "../lib/utils.js";

const REVIEWER = "ieuan@local";

const QUEUE_BADGE: Record<ReviewItem["queue"], string> = {
  quick: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  deep: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  escalation: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

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

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--card)]">
      <header className="flex items-center justify-between border-b border-[color:var(--border)] px-5 py-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "inline-flex w-fit items-center rounded-md px-2 py-0.5 text-xs font-medium uppercase tracking-wide ring-1 ring-inset",
              QUEUE_BADGE[item.queue],
            )}
          >
            {item.queue}
          </span>
          <span className="font-mono text-xs text-[color:var(--muted-foreground)]">
            {item.contentEventId.slice(0, 8)}
          </span>
          <span className="text-xs text-[color:var(--muted-foreground)]">
            · {item.recommendedAction.kind} — {item.recommendedAction.reason}
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded-md border border-[color:var(--border)] px-2 py-1 text-xs text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
          title="Esc"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loading && <SkeletonBody />}
        {error && (
          <p className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
            {error}
          </p>
        )}
        {detail && !loading && <DetailBody detail={detail} />}
      </div>

      <footer className="border-t border-[color:var(--border)] px-5 py-3">
        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          placeholder="Rationale (optional — required for remove / escalate in production)"
          rows={2}
          className="mb-3 block w-full resize-none rounded-md border border-[color:var(--border)] bg-[color:var(--muted)] px-3 py-2 text-xs text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)]"
          disabled={committing || item.state === "decided"}
        />
        <div className="flex items-center justify-between gap-3">
          <ApproveRejectRow
            state={
              item.state === "decided"
                ? item.finalVerdict === "remove"
                  ? "rejected"
                  : "approved"
                : "pending"
            }
            onApprove={
              item.state === "decided" || committing
                ? undefined
                : () => decide("approve")
            }
            onReject={
              item.state === "decided" || committing
                ? undefined
                : () => decide("remove")
            }
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => decide("escalate")}
              disabled={committing || item.state === "decided"}
              className="rounded-md border border-[color:var(--border)] px-3 py-1 text-xs uppercase tracking-widest text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)] disabled:opacity-50"
              title="e"
            >
              Escalate
            </button>
            <span className="text-[10px] text-[color:var(--muted-foreground)]">
              shortcuts:{" "}
              <kbd className="rounded bg-[color:var(--muted)] px-1">a</kbd>{" "}
              <kbd className="rounded bg-[color:var(--muted)] px-1">r</kbd>{" "}
              <kbd className="rounded bg-[color:var(--muted)] px-1">e</kbd>{" "}
              <kbd className="rounded bg-[color:var(--muted)] px-1">esc</kbd>
            </span>
          </div>
        </div>
      </footer>
    </section>
  );
}

function DetailBody({ detail }: { detail: EventDetail }) {
  const { event, signal, traces } = detail;

  /** Group every emitted image-region evidence pointer by its mediaAssetId so
   * each image renders with all the bboxes that point at it. */
  const overlaysByMedia = useMemo(
    () => buildOverlayMap(signal),
    [signal],
  );

  return (
    <div className="flex flex-col gap-5 text-sm">
      <Section title="Event">
        <Grid label="instance">
          <span className="font-mono text-xs">{event.instance.id}</span>
        </Grid>
        <Grid label="author">
          <span className="font-mono text-xs">
            @{event.author.handle}
            {event.author.priorActionCount > 0 && (
              <span className="ml-2 text-rose-300">
                ⚠ {event.author.priorActionCount} prior
              </span>
            )}
          </span>
        </Grid>
        <Grid label="modalities">
          <span className="font-mono text-xs">{event.modalities.join(", ")}</span>
        </Grid>
        <Grid label="posted">
          <span className="font-mono text-xs text-[color:var(--muted-foreground)]">
            {event.postedAt}
          </span>
        </Grid>
      </Section>

      {event.text && (
        <Section title="Text">
          <p className="whitespace-pre-wrap rounded-md bg-[color:var(--muted)] p-3 font-mono text-xs leading-relaxed">
            {event.text}
          </p>
        </Section>
      )}

      {event.media.length > 0 && (
        <Section title={`Media (${event.media.length})`}>
          <div className="flex flex-wrap gap-3">
            {event.media.map((m) => (
              <div key={m.id}>
                <ImageEvidence
                  src={m.url}
                  alt={`media ${m.id.slice(0, 8)}`}
                  bboxes={overlaysByMedia.get(m.id) ?? []}
                />
                <div className="mt-1 font-mono text-[10px] text-[color:var(--muted-foreground)]">
                  {m.id.slice(0, 8)} · {m.modality} · {m.mimeType}
                  {m.width && m.height ? ` · ${m.width}×${m.height}` : ""}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {signal && (
        <Section title="Channels">
          {Object.values(signal.channels).length === 0 ? (
            <p className="text-xs text-[color:var(--muted-foreground)]">
              no channels emitted — agents ran but produced no signal
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {Object.values(signal.channels)
                .sort((a, b) => b.probability - a.probability)
                .map((ch) => (
                  <ChannelChip key={ch.channel} channel={ch} />
                ))}
            </div>
          )}
        </Section>
      )}

      {traces.length > 0 && (
        <Section title="Agent traces">
          <div className="flex flex-col gap-3">
            {traces.map((t) => (
              <div key={`${t.agent}-${t.startedAt}`}>
                <div className="mb-1 font-mono text-xs">
                  {t.agent} · {t.model}
                </div>
                <MiniTrace steps={traceToSteps(t)} />
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 text-[10px] uppercase tracking-widest text-[color:var(--muted-foreground)]">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Grid({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-baseline gap-3">
      <span className="text-[10px] uppercase tracking-widest text-[color:var(--muted-foreground)]">
        {label}
      </span>
      <span>{children}</span>
    </div>
  );
}

function SkeletonBody() {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-3 w-32 animate-pulse rounded bg-[color:var(--muted)]" />
      <div className="h-20 w-full animate-pulse rounded bg-[color:var(--muted)]" />
      <div className="h-3 w-32 animate-pulse rounded bg-[color:var(--muted)]" />
      <div className="h-32 w-full animate-pulse rounded bg-[color:var(--muted)]" />
    </div>
  );
}

function buildOverlayMap(
  signal: StructuredSignal | null,
): Map<string, BboxOverlay[]> {
  const map = new Map<string, BboxOverlay[]>();
  if (!signal) return map;
  for (const channel of Object.values(signal.channels)) {
    const severity =
      channel.probability >= 0.8
        ? "high"
        : channel.probability >= 0.5
          ? "medium"
          : "low";
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
    if (s.kind === "thought") {
      return { type: "thought", label: s.content };
    }
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
