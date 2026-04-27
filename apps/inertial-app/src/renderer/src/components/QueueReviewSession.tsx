import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Sparkles,
  X as CloseIcon,
  Zap,
} from "lucide-react";
import type { ReviewItem } from "@inertial/schemas";
import { Button } from "./ui/button.js";
import { QueueDetailPanel } from "../views/QueueDetailPanel.js";
import { cn } from "../lib/utils.js";

type Queue = ReviewItem["queue"];

const QUEUE_TONE: Record<
  Queue,
  { label: string; Icon: typeof Zap; bg: string; text: string; bar: string }
> = {
  quick: {
    label: "Quick",
    Icon: Zap,
    bg: "bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-300",
    bar: "bg-emerald-500",
  },
  deep: {
    label: "Deep",
    Icon: Sparkles,
    bg: "bg-amber-500/10",
    text: "text-amber-700 dark:text-amber-300",
    bar: "bg-amber-500",
  },
  escalation: {
    label: "Escalation",
    Icon: ShieldAlert,
    bg: "bg-rose-500/10",
    text: "text-rose-700 dark:text-rose-300",
    bar: "bg-rose-500",
  },
};

interface QueueReviewSessionProps {
  queue: Queue;
  items: ReviewItem[];
  startItemId: string;
  onCommit: () => Promise<void> | void;
  onClose: () => void;
}

export function QueueReviewSession({
  queue,
  items,
  startItemId,
  onCommit,
  onClose,
}: QueueReviewSessionProps) {
  const initialIndex = Math.max(
    0,
    items.findIndex((i) => i.id === startItemId),
  );
  const [cursor, setCursor] = useState(initialIndex);
  const [decidedIds, setDecidedIds] = useState<Set<string>>(new Set());

  const total = items.length;
  const current = items[cursor] ?? null;
  const decidedCount = decidedIds.size;
  const remaining = total - decidedCount;
  const allDone = remaining === 0;
  const theme = QUEUE_TONE[queue];

  const findNextPending = useCallback(
    (from: number, dir: 1 | -1): number | null => {
      for (let step = 1; step <= total; step++) {
        const idx = (from + step * dir + total) % total;
        const it = items[idx];
        if (it && !decidedIds.has(it.id)) return idx;
      }
      return null;
    },
    [items, decidedIds, total],
  );

  const goToOffset = (delta: 1 | -1) => {
    if (total === 0) return;
    const next = (cursor + delta + total) % total;
    setCursor(next);
  };

  const handleCommit = useCallback(async () => {
    const id = current?.id;
    await onCommit();
    if (!id) return;
    const updated = new Set(decidedIds);
    updated.add(id);
    setDecidedIds(updated);
    if (updated.size >= total) return;
    const next = findNextPendingWith(updated, cursor, +1);
    if (next !== null) setCursor(next);

    function findNextPendingWith(
      decided: Set<string>,
      from: number,
      dir: 1 | -1,
    ): number | null {
      for (let step = 1; step <= total; step++) {
        const idx = (from + step * dir + total) % total;
        const it = items[idx];
        if (it && !decided.has(it.id)) return idx;
      }
      return null;
    }
  }, [current?.id, onCommit, decidedIds, cursor, items, total]);

  useEffect(() => {
    function isTypingTarget(t: EventTarget | null) {
      if (!(t instanceof HTMLElement)) return false;
      return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.key === "ArrowLeft" || e.key === "j") {
        e.preventDefault();
        const prev = findNextPending(cursor, -1);
        if (prev !== null) setCursor(prev);
        else goToOffset(-1);
      }
      if (e.key === "ArrowRight" || e.key === "k") {
        e.preventDefault();
        const next = findNextPending(cursor, +1);
        if (next !== null) setCursor(next);
        else goToOffset(+1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor, findNextPending]);

  if (allDone) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-8 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
          <CheckCircle2
            className="h-6 w-6 text-emerald-600 dark:text-emerald-400"
            strokeWidth={1.5}
          />
        </div>
        <div>
          <div className="text-[16px] font-medium tracking-tight">
            Deck cleared
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {decidedCount} {decidedCount === 1 ? "item" : "items"} decided ·{" "}
            <span className="font-mono">queue.{queue}</span>
          </p>
        </div>
        <Button size="sm" onClick={onClose}>
          Done
        </Button>
      </div>
    );
  }

  if (!current) return null;

  return (
    <div className="flex flex-col">
      <DeckNav
        queue={queue}
        cursor={cursor}
        total={total}
        decided={decidedCount}
        onPrev={() => {
          const prev = findNextPending(cursor, -1);
          if (prev !== null) setCursor(prev);
          else goToOffset(-1);
        }}
        onNext={() => {
          const next = findNextPending(cursor, +1);
          if (next !== null) setCursor(next);
          else goToOffset(+1);
        }}
        onClose={onClose}
        currentDecided={decidedIds.has(current.id)}
        theme={theme}
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        <QueueDetailPanel
          key={current.id}
          item={current}
          onCommit={handleCommit}
          onClose={onClose}
        />
      </div>
    </div>
  );
}

interface DeckNavProps {
  queue: Queue;
  cursor: number;
  total: number;
  decided: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  currentDecided: boolean;
  theme: (typeof QUEUE_TONE)[Queue];
}

function DeckNav({
  cursor,
  total,
  decided,
  onPrev,
  onNext,
  onClose,
  currentDecided,
  theme,
}: DeckNavProps) {
  const Icon = theme.Icon;
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4 py-2">
      <div className="flex items-center gap-2">
        <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-md", theme.bg)}>
          <Icon className={cn("h-3.5 w-3.5", theme.text)} strokeWidth={1.5} />
        </span>
        <span className="text-[13px] font-medium tracking-tight">{theme.label}</span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          deck
        </span>
        {currentDecided && (
          <span className="ml-1 inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-2.5 w-2.5" />
            done
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <ProgressDots cursor={cursor} total={total} accent={theme.bar} />
        <span className="ml-2 text-[11px] tabular-nums text-muted-foreground">
          {cursor + 1} / {total}
        </span>
        <span className="mx-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          ·
        </span>
        <span className="text-[11px] tabular-nums text-emerald-700 dark:text-emerald-300">
          {decided} decided
        </span>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onPrev}
          aria-label="Previous"
          className="h-7 w-7"
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onNext}
          aria-label="Next"
          className="h-7 w-7"
        >
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close deck"
          className="ml-1 h-7 w-7"
        >
          <CloseIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  );
}

function ProgressDots({
  cursor,
  total,
  accent,
}: {
  cursor: number;
  total: number;
  accent: string;
}) {
  const max = Math.min(total, 12);
  const dots = Array.from({ length: max });
  return (
    <div className="flex items-center gap-1">
      {dots.map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-1 w-1 rounded-full transition-colors",
            i === cursor ? accent : "bg-muted-foreground/25",
          )}
        />
      ))}
      {total > max && (
        <span className="ml-1 text-[10px] text-muted-foreground/70">+{total - max}</span>
      )}
    </div>
  );
}
