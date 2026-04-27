import { useEffect, useState } from "react";
import { Inbox, ShieldAlert, Sparkles, Zap } from "lucide-react";
import type { ContentEvent, ReviewItem, StructuredSignal } from "@inertial/schemas";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar.js";
import { RelativeTime } from "./RelativeTime.js";
import {
  SEVERITY_TEXT,
  severityFor,
  type Severity,
} from "./SeverityIndicator.js";
import { getEventDetail } from "../lib/api.js";
import { getDemoAvatar } from "../lib/demo-data.js";
import { cn } from "../lib/utils.js";

type Queue = ReviewItem["queue"];

const QUEUE_THEME: Record<
  Queue,
  { label: string; Icon: typeof Zap; text: string; dot: string }
> = {
  quick: {
    label: "Quick",
    Icon: Zap,
    text: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  deep: {
    label: "Deep",
    Icon: Sparkles,
    text: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  escalation: {
    label: "Escalation",
    Icon: ShieldAlert,
    text: "text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500",
  },
};

interface QueueDeckProps {
  queue: Queue;
  items: ReviewItem[];
  onOpen: (item: ReviewItem) => void;
}

export function QueueDeck({ queue, items, onOpen }: QueueDeckProps) {
  const theme = QUEUE_THEME[queue];
  const Icon = theme.Icon;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-3 w-3", theme.text)} strokeWidth={1.75} />
          <span className="text-[12px] font-medium tracking-tight">{theme.label}</span>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className={cn("h-1 w-1 rounded-full", theme.dot)} />
            {items.length}
          </span>
        </div>
        {items.length > 0 && (
          <button
            onClick={() => items[0] && onOpen(items[0])}
            className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Review all →
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyDeck queue={queue} />
      ) : (
        <ul className="flex flex-col">
          {items.map((item, i) => (
            <li key={item.id}>
              <DeckRow
                item={item}
                onOpen={() => onOpen(item)}
                showDivider={i > 0}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DeckRow({
  item,
  onOpen,
  showDivider,
}: {
  item: ReviewItem;
  onOpen: () => void;
  showDivider: boolean;
}) {
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
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [item.contentEventId]);

  const top = signal
    ? Object.values(signal.channels).sort((a, b) => b.probability - a.probability)[0]
    : null;
  const sev: Severity = top ? severityFor(top.probability) : "low";
  const handle = event?.author.handle ?? "loading";
  const name = event?.author.displayName ?? `@${handle}`;
  const text = event?.text ?? "(media post)";

  return (
    <button
      onClick={onOpen}
      className={cn(
        "group grid w-full grid-cols-[auto_1fr] items-start gap-3 rounded-md px-2 py-2.5 text-left transition-colors",
        "hover:bg-muted/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        showDivider && "border-t border-border/60",
      )}
    >
      <Avatar className="h-6 w-6">
        <AvatarImage src={getDemoAvatar(handle)} alt={handle} />
        <AvatarFallback className="text-[10px]">
          {name[0]?.toUpperCase() ?? "?"}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-medium text-foreground">
            {name}
          </span>
          {event && (
            <RelativeTime
              iso={event.postedAt}
              className="shrink-0 text-[10px] tabular-nums text-muted-foreground"
            />
          )}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
          {text}
        </p>
        {top && (
          <div className="mt-1 flex items-baseline gap-1.5 text-[11px]">
            <span className={cn("font-mono", SEVERITY_TEXT[sev])}>{top.channel}</span>
            <span className="font-mono tabular-nums text-muted-foreground/80">
              {top.probability.toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </button>
  );
}

function EmptyDeck({ queue }: { queue: Queue }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border/70 py-8 text-center">
      <Inbox className="h-4 w-4 text-muted-foreground/60" strokeWidth={1.5} />
      <div className="text-[11px] text-muted-foreground">All caught up</div>
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60">
        queue.{queue}
      </div>
    </div>
  );
}
