import { useEffect, useState } from "react";
import type { ContentEvent, ReviewItem, StructuredSignal } from "@inertial/schemas";
import { Card } from "./ui/card.js";
import { Badge } from "./ui/badge.js";
import { AuthorBadge } from "./AuthorBadge.js";
import { EventPreview } from "./EventPreview.js";
import { RelativeTime } from "./RelativeTime.js";
import {
  SEVERITY_BAR,
  SEVERITY_BG_SOFT,
  SEVERITY_BORDER_SOFT,
  SEVERITY_TEXT,
  severityFor,
  type Severity,
} from "./SeverityIndicator.js";
import { getEventDetail } from "../lib/api.js";
import { cn } from "../lib/utils.js";

interface QueueListItemProps {
  item: ReviewItem;
  selected: boolean;
  onSelect: () => void;
}

const QUEUE_STYLE: Record<ReviewItem["queue"], { label: string; cls: string }> = {
  quick: {
    label: "Quick",
    cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  deep: {
    label: "Deep",
    cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  escalation: {
    label: "Escalation",
    cls: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
};

export function QueueListItem({ item, selected, onSelect }: QueueListItemProps) {
  const [event, setEvent] = useState<ContentEvent | null>(null);
  const [signal, setSignal] = useState<StructuredSignal | null>(null);

  useEffect(() => {
    let cancelled = false;
    getEventDetail(item.contentEventId)
      .then((d) => {
        if (cancelled) return;
        setEvent(d.event);
        setSignal(d.signal);
      })
      .catch(() => {
        // surfaced in detail panel; list item just degrades gracefully
      });
    return () => {
      cancelled = true;
    };
  }, [item.contentEventId]);

  const topChannels = signal
    ? Object.values(signal.channels)
        .sort((a, b) => b.probability - a.probability)
        .slice(0, 3)
    : [];

  const maxProb = topChannels[0]?.probability ?? 0;
  const severity: Severity = severityFor(maxProb);
  const queueStyle = QUEUE_STYLE[item.queue];

  return (
    <Card
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group relative flex cursor-pointer flex-row gap-0 overflow-hidden p-0 transition-all",
        "hover:border-foreground/20 hover:shadow-md",
        selected && "border-foreground/40 shadow-md ring-1 ring-foreground/10",
      )}
    >
      <span aria-hidden className={cn("w-1 shrink-0", SEVERITY_BAR[severity])} />

      <div className="flex-1 min-w-0 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          {event ? (
            <AuthorBadge author={event.author} />
          ) : (
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 animate-pulse rounded-full bg-muted" />
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            </div>
          )}
          <div className="flex items-center gap-2 shrink-0 pt-0.5">
            <Badge variant="outline" className={cn("text-[10px] uppercase tracking-wide", queueStyle.cls)}>
              {queueStyle.label}
            </Badge>
            {item.state === "decided" ? (
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px] uppercase tracking-wide",
                  item.finalVerdict === "remove"
                    ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                    : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                )}
              >
                {item.finalVerdict ?? "decided"}
              </Badge>
            ) : (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Pending
              </span>
            )}
          </div>
        </div>

        {event ? (
          <EventPreview event={event} />
        ) : (
          <div className="space-y-2">
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap gap-1.5">
            {topChannels.map((ch) => {
              const sev = severityFor(ch.probability);
              return (
                <span
                  key={ch.channel}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md border px-2 py-0.5 text-[11px] font-mono",
                    SEVERITY_BG_SOFT[sev],
                    SEVERITY_BORDER_SOFT[sev],
                    SEVERITY_TEXT[sev],
                  )}
                >
                  <span>{ch.channel}</span>
                  <span className="tabular-nums opacity-80">{ch.probability.toFixed(2)}</span>
                </span>
              );
            })}
            {!signal && (
              <div className="h-5 w-20 animate-pulse rounded bg-muted" />
            )}
          </div>
          {event && (
            <RelativeTime
              iso={event.postedAt}
              className="text-[11px] text-muted-foreground tabular-nums shrink-0"
            />
          )}
        </div>
      </div>
    </Card>
  );
}
