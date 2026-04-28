import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronUp, Film, X as CloseIcon, Tag } from "lucide-react";
import type {
  AgentTrace,
  ReviewerTag,
  ReviewItem,
  ReviewVerdict,
  SignalChannel,
  StructuredSignal,
} from "@inertial/schemas";
import { MiniTrace, type TraceStep } from "../components/hitl/MiniTrace.js";
import { ChannelChip } from "../components/ChannelChip.js";
import { ImageEvidence, type BboxOverlay } from "../components/ImageEvidence.js";
import { AuthorBadge } from "../components/AuthorBadge.js";
import { RelativeTime } from "../components/RelativeTime.js";
import { ReviewerTagPicker } from "../components/ReviewerTagPicker.js";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card.js";
import { Button } from "../components/ui/button.js";
import { Separator } from "../components/ui/separator.js";
import { Skeleton } from "../components/ui/skeleton.js";
import {
  commitDecision,
  getEventDetail,
  getTagCatalog,
  listReviewerTagsForEvent,
  type EventDetail,
  type PersistedReviewerTag,
  type TagCatalogEntry,
} from "../lib/api.js";
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
  /** Tags persisted from past reviews of this same event. Read-only. */
  const [persistedTags, setPersistedTags] = useState<PersistedReviewerTag[]>([]);
  /** Tags the reviewer is staging during THIS review session. Sent on commit. */
  const [stagedTags, setStagedTags] = useState<ReviewerTag[]>([]);
  const [tagCatalog, setTagCatalog] = useState<TagCatalogEntry[]>([]);
  const openedAt = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    setRationale("");
    setStagedTags([]);
    setPersistedTags([]);
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
    // Tag catalog (cached after first load) + persisted tags for this event.
    getTagCatalog()
      .then((c) => !cancelled && setTagCatalog(c))
      .catch(() => {});
    listReviewerTagsForEvent(item.contentEventId)
      .then((t) => !cancelled && setPersistedTags(t))
      .catch(() => {});
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
        reviewerTags: stagedTags,
      });
      await onCommit();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCommitting(false);
    }
  };

  const tagsByCatalog = useMemo(
    () => new Map(tagCatalog.map((c) => [c.tagId, c])),
    [tagCatalog],
  );

  const eventModalities = detail?.event.modalities ?? ["text"];

  const handlePickTag = (tag: ReviewerTag) => {
    setStagedTags((prev) =>
      prev.some((t) => t.tagId === tag.tagId) ? prev : [...prev, tag],
    );
  };

  const handleUnstageTag = (tagId: string) => {
    setStagedTags((prev) => prev.filter((t) => t.tagId !== tagId));
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
        {detail && !loading && (
          <DetailBody
            detail={detail}
            persistedTags={persistedTags}
            stagedTags={stagedTags}
            tagsByCatalog={tagsByCatalog}
            eventModalities={eventModalities}
            decided={decided}
            onPickTag={handlePickTag}
            onUnstageTag={handleUnstageTag}
          />
        )}
      </div>
    </Card>
  );
}

interface DetailBodyProps {
  detail: EventDetail;
  persistedTags: PersistedReviewerTag[];
  stagedTags: ReviewerTag[];
  tagsByCatalog: Map<string, TagCatalogEntry>;
  eventModalities: readonly EventDetail["event"]["modalities"][number][];
  decided: boolean;
  onPickTag: (tag: ReviewerTag) => void;
  onUnstageTag: (tagId: string) => void;
}

function DetailBody({
  detail,
  persistedTags,
  stagedTags,
  tagsByCatalog,
  eventModalities,
  decided,
  onPickTag,
  onUnstageTag,
}: DetailBodyProps) {
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

      {signal && <VideoFramesSection signal={signal} />}

      <ReviewerTagsSection
        persisted={persistedTags}
        staged={stagedTags}
        tagsByCatalog={tagsByCatalog}
        eventModalities={eventModalities}
        decided={decided}
        onPickTag={onPickTag}
        onUnstageTag={onUnstageTag}
      />

      {detail.authorHistory && detail.authorHistory.recent.length > 0 && (
        <AuthorHistorySection history={detail.authorHistory} />
      )}

      {detail.similarEvents && detail.similarEvents.length > 0 && (
        <SimilarEventsSection neighbors={detail.similarEvents} />
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

function ReviewerTagsSection({
  persisted,
  staged,
  tagsByCatalog,
  eventModalities,
  decided,
  onPickTag,
  onUnstageTag,
}: {
  persisted: PersistedReviewerTag[];
  staged: ReviewerTag[];
  tagsByCatalog: Map<string, TagCatalogEntry>;
  eventModalities: readonly EventDetail["event"]["modalities"][number][];
  decided: boolean;
  onPickTag: (tag: ReviewerTag) => void;
  onUnstageTag: (tagId: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Tag className="h-3 w-3 text-muted-foreground" strokeWidth={1.75} />
          <SectionLabel>Reviewer tags</SectionLabel>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {persisted.length + staged.length}
          </span>
        </div>
        {!decided && (
          <ReviewerTagPicker
            eventModalities={eventModalities}
            staged={[
              ...staged,
              ...persisted.map((p) => ({ tagId: p.tagId, scope: p.scope, note: p.note })),
            ]}
            onPick={onPickTag}
          />
        )}
      </div>

      {persisted.length === 0 && staged.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          no tags yet — use Add tag to label this event for the reviewer corpus
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {persisted.map((p) => (
            <TagChip
              key={p.id}
              entry={tagsByCatalog.get(p.tagId)}
              fallbackId={p.tagId}
              persisted
              note={p.note}
            />
          ))}
          {staged.map((t) => (
            <TagChip
              key={`staged-${t.tagId}`}
              entry={tagsByCatalog.get(t.tagId)}
              fallbackId={t.tagId}
              note={t.note}
              onRemove={!decided ? () => onUnstageTag(t.tagId) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TagChip({
  entry,
  fallbackId,
  note,
  persisted,
  onRemove,
}: {
  entry: TagCatalogEntry | undefined;
  fallbackId: string;
  note?: string;
  persisted?: boolean;
  onRemove?: () => void;
}) {
  const tone = entry
    ? {
        danger: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
        warn: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        info: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
        neutral: "border-border bg-muted/40 text-muted-foreground",
      }[entry.severity]
    : "border-border bg-muted/40 text-muted-foreground";
  const label = entry?.displayName ?? fallbackId;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px]",
        tone,
        persisted && "ring-1 ring-inset ring-foreground/5",
      )}
      title={note ? `${fallbackId} — ${note}` : fallbackId}
    >
      <span className="font-mono">{label}</span>
      {persisted ? (
        <span className="font-mono text-[9px] uppercase tracking-wider opacity-70">
          saved
        </span>
      ) : (
        <span className="font-mono text-[9px] uppercase tracking-wider opacity-70">
          staged
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove tag ${label}`}
          className="ml-0.5 inline-flex h-3 w-3 items-center justify-center rounded text-current opacity-60 transition-opacity hover:opacity-100"
        >
          <CloseIcon className="h-2.5 w-2.5" strokeWidth={2} />
        </button>
      )}
    </span>
  );
}

function AuthorHistorySection({
  history,
}: {
  history: NonNullable<EventDetail["authorHistory"]>;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <SectionLabel>Author history</SectionLabel>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {history.count} prior · {history.totalPriorActions} action
          {history.totalPriorActions === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="mt-2 flex flex-col gap-2">
        {history.recent.map((e) => (
          <li
            key={e.id}
            className="rounded-md border border-border bg-card/40 px-3 py-2"
          >
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="font-mono">{e.id.slice(0, 8)}</span>
              <RelativeTime iso={e.postedAt} className="tabular-nums" />
            </div>
            <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-foreground">
              {e.excerpt || "(media post)"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SimilarEventsSection({
  neighbors,
}: {
  neighbors: NonNullable<EventDetail["similarEvents"]>;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <SectionLabel>Similar events</SectionLabel>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          top {neighbors.length}
        </span>
      </div>
      <ul className="mt-2 flex flex-col gap-2">
        {neighbors.map((n) => (
          <li
            key={n.contentEventId}
            className="rounded-md border border-border bg-card/40 px-3 py-2"
          >
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-mono text-muted-foreground">
                @{n.authorHandle || n.contentEventId.slice(0, 8)}
              </span>
              <SimilarityBar similarity={n.similarity} />
            </div>
            <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-foreground">
              {n.excerpt || "(media post)"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SimilarityBar({ similarity }: { similarity: number }) {
  const pct = Math.max(0, Math.min(100, similarity * 100));
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-[color:var(--accent-violet)]/80"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono tabular-nums text-muted-foreground">
        {similarity.toFixed(2)}
      </span>
    </div>
  );
}

interface FrameWithChannels {
  /** keyframeUrl from the video-segment evidence — also the dedupe key. */
  url: string;
  timestampSec: number;
  /** Channels whose evidence pointed at this frame. The metadata-only
   *  `video.frames-extracted` channel is filtered out so the chip list
   *  only shows actual classifier scores. */
  channels: SignalChannel[];
}

interface FrameStrip {
  /** Source video MediaAsset id — one strip per video. */
  mediaAssetId: string;
  frames: FrameWithChannels[];
}

/**
 * Pull every video-segment evidence pointer out of the signal, group by
 * source video + dedupe by keyframe URL, and pair each frame with the
 * channels that referenced it.
 */
function collectFrameStrips(signal: StructuredSignal): FrameStrip[] {
  const byVideo = new Map<string, Map<string, FrameWithChannels>>();

  for (const channel of Object.values(signal.channels)) {
    for (const ev of channel.evidence) {
      if (ev.kind !== "video-segment" || !ev.keyframeUrl) continue;
      const videoMap = byVideo.get(ev.mediaAssetId) ?? new Map<string, FrameWithChannels>();
      const existing = videoMap.get(ev.keyframeUrl);
      if (existing) {
        // The metadata-only "video.frames-extracted" channel attaches every
        // frame; we don't list it as an actual classifier hit on the frame.
        if (channel.channel !== "video.frames-extracted") {
          existing.channels.push(channel);
        }
      } else {
        videoMap.set(ev.keyframeUrl, {
          url: ev.keyframeUrl,
          timestampSec: ev.startSec,
          channels:
            channel.channel === "video.frames-extracted" ? [] : [channel],
        });
      }
      byVideo.set(ev.mediaAssetId, videoMap);
    }
  }

  const strips: FrameStrip[] = [];
  for (const [mediaAssetId, frames] of byVideo) {
    const sorted = Array.from(frames.values()).sort(
      (a, b) => a.timestampSec - b.timestampSec,
    );
    strips.push({ mediaAssetId, frames: sorted });
  }
  return strips;
}

function VideoFramesSection({ signal }: { signal: StructuredSignal }) {
  const strips = useMemo(() => collectFrameStrips(signal), [signal]);
  if (strips.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Film className="h-3 w-3 text-muted-foreground" strokeWidth={1.75} />
          <SectionLabel>Video frames</SectionLabel>
        </div>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {strips.reduce((acc, s) => acc + s.frames.length, 0)} frame
          {strips.reduce((acc, s) => acc + s.frames.length, 0) === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mt-2 flex flex-col gap-3">
        {strips.map((strip) => (
          <FrameStripView key={strip.mediaAssetId} strip={strip} />
        ))}
      </div>
    </div>
  );
}

function FrameStripView({ strip }: { strip: FrameStrip }) {
  return (
    <div>
      <div className="mb-1.5 font-mono text-[10px] text-muted-foreground">
        video {strip.mediaAssetId.slice(0, 8)} · {strip.frames.length} keyframes
      </div>
      <div className="-mx-1 overflow-x-auto">
        <div className="flex gap-2 px-1 pb-1">
          {strip.frames.map((frame) => (
            <FrameThumb key={frame.url} frame={frame} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FrameThumb({ frame }: { frame: FrameWithChannels }) {
  const topChannel = frame.channels.sort(
    (a, b) => b.probability - a.probability,
  )[0];
  return (
    <div className="flex w-32 shrink-0 flex-col gap-1">
      <div className="relative h-20 w-32 overflow-hidden rounded-md border border-border bg-muted/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={frame.url}
          alt={`frame at ${frame.timestampSec.toFixed(1)}s`}
          className="h-full w-full object-cover"
          // file:// URLs from the local frame-extract skill won't load in a
          // standard browser; Electron renderer with webSecurity off does.
          // Rather than blocking demo mode, we let the broken-image fallback
          // do the right thing and the timestamp + channel chips still render.
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.opacity = "0.2";
          }}
        />
        <span className="absolute right-1 top-1 rounded bg-background/80 px-1 font-mono text-[9px] tabular-nums">
          {frame.timestampSec.toFixed(1)}s
        </span>
      </div>
      {topChannel && (
        <div className="flex items-baseline gap-1.5 text-[10px]">
          <span className="truncate font-mono">{topChannel.channel}</span>
          <span className="font-mono tabular-nums text-muted-foreground">
            {topChannel.probability.toFixed(2)}
          </span>
        </div>
      )}
      {frame.channels.length === 0 && (
        <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60">
          no scores
        </div>
      )}
    </div>
  );
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
