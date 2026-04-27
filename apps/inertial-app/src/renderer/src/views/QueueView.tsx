import { useCallback, useEffect, useMemo, useState } from "react";
import { Keyboard, RefreshCw } from "lucide-react";
import type { ReviewItem } from "@inertial/schemas";
import { listQueue } from "../lib/api.js";
import { Button } from "../components/ui/button.js";
import { Skeleton } from "../components/ui/skeleton.js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog.js";
import { QueueDeck } from "../components/QueueDeck.js";
import { QueueReviewSession } from "../components/QueueReviewSession.js";
import { PageHeader } from "../components/PageHeader.js";
import { useDemoMode } from "../lib/demo-mode.js";
import { cn } from "../lib/utils.js";

const INSTANCE = "smoke.local";
const REFRESH_MS = 4_000;

export function QueueView() {
  const { demo } = useDemoMode();
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const fetched = await listQueue(INSTANCE);
      setItems(fetched);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (demo) return;
    const handle = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(handle);
  }, [refresh, demo]);

  const grouped = useMemo(() => {
    const out = { quick: [] as ReviewItem[], deep: [] as ReviewItem[], escalation: [] as ReviewItem[] };
    if (!items) return out;
    for (const i of items) {
      if (i.state === "decided") continue;
      out[i.queue].push(i);
    }
    return out;
  }, [items]);

  const counts = useMemo(() => {
    const c = { quick: 0, deep: 0, escalation: 0, decided: 0, pending: 0 };
    for (const i of items ?? []) {
      if (i.state === "decided") c.decided += 1;
      else {
        c.pending += 1;
        c[i.queue] += 1;
      }
    }
    return c;
  }, [items]);

  const openItem = useMemo(
    () => items?.find((i) => i.id === openItemId) ?? null,
    [items, openItemId],
  );

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.key === "?") setHelpOpen((v) => !v);
      if (e.key === "Escape") setOpenItemId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Review queue"
        description={
          <>
            <span className="font-mono">{INSTANCE}</span>
            <CountChip label="pending" value={counts.pending} tone="default" />
            <CountChip label="quick" value={counts.quick} tone="good" />
            <CountChip label="deep" value={counts.deep} tone="warn" />
            <CountChip label="esc" value={counts.escalation} tone="danger" />
            <span className="text-muted-foreground/60">·</span>
            <span>{counts.decided} decided</span>
          </>
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHelpOpen(true)}
              className="h-7 px-2 text-[11px]"
            >
              <Keyboard className="mr-1 h-3 w-3" />
              Shortcuts
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              className="h-7 px-2 text-[11px]"
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              Refresh
            </Button>
          </>
        }
      />

      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-700 dark:text-rose-300">
          {error} — is the runciter running on :4001?
        </div>
      )}

      {items === null && !error ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[320px] w-full rounded-xl" />
          ))}
        </div>
      ) : openItem ? (
        <section className="rounded-xl border border-border bg-card/30">
          <QueueReviewSession
            queue={openItem.queue}
            items={grouped[openItem.queue]}
            startItemId={openItem.id}
            onCommit={refresh}
            onClose={() => setOpenItemId(null)}
          />
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <QueueDeck
            queue="quick"
            items={grouped.quick}
            onOpen={(item) => setOpenItemId(item.id)}
          />
          <QueueDeck
            queue="deep"
            items={grouped.deep}
            onOpen={(item) => setOpenItemId(item.id)}
          />
          <QueueDeck
            queue="escalation"
            items={grouped.escalation}
            onOpen={(item) => setOpenItemId(item.id)}
          />
        </div>
      )}

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-light uppercase tracking-widest">
              Keyboard shortcuts
            </DialogTitle>
          </DialogHeader>
          <ul className="mt-2 space-y-2 text-sm">
            <ShortcutRow keys={["esc"]} action="close detail" />
            <ShortcutRow keys={["?"]} action="toggle this help" />
          </ul>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Inside an open card, use <kbd className="rounded border border-border bg-muted px-1 font-mono">a</kbd> /{" "}
            <kbd className="rounded border border-border bg-muted px-1 font-mono">r</kbd> /{" "}
            <kbd className="rounded border border-border bg-muted px-1 font-mono">e</kbd> to commit.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ShortcutRow({ keys, action }: { keys: readonly string[]; action: string }) {
  return (
    <li className="flex items-center justify-between">
      <span className="flex gap-1">
        {keys.map((k) => (
          <kbd
            key={k}
            className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]"
          >
            {k}
          </kbd>
        ))}
      </span>
      <span className="text-muted-foreground">{action}</span>
    </li>
  );
}

function CountChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "default" | "good" | "warn" | "danger";
}) {
  const toneCls = {
    default: "text-foreground",
    good: "text-emerald-700 dark:text-emerald-300",
    warn: "text-amber-700 dark:text-amber-300",
    danger: "text-rose-700 dark:text-rose-300",
  }[tone];
  const dotCls = {
    default: "bg-muted-foreground/40",
    good: "bg-emerald-500",
    warn: "bg-amber-500",
    danger: "bg-rose-500",
  }[tone];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-1.5 w-1.5 rounded-full", dotCls)} />
      <span className={cn("font-medium tabular-nums", toneCls)}>{value}</span>
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </span>
  );
}
