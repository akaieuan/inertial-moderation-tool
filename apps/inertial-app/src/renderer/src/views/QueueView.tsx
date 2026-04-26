import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReviewItem, ReviewVerdict } from "@inertial/schemas";
import { commitDecision, listQueue } from "../lib/api.js";
import { cn } from "../lib/utils.js";
import { QueueDetailPanel } from "./QueueDetailPanel.js";

const INSTANCE = "smoke.local";
const REVIEWER = "ieuan@local";
const REFRESH_MS = 4_000;

const QUEUE_BADGE: Record<ReviewItem["queue"], string> = {
  quick: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  deep: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  escalation: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

export function QueueView() {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
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
    const handle = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(handle);
  }, [refresh]);

  const selectedItem = useMemo(
    () => items?.find((i) => i.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );

  // Keyboard shortcuts. Active when an item is selected (or `?` for help).
  // Ignored when focus is in an editable element so reviewers can type rationale.
  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
    }

    async function quickDecide(verdict: ReviewVerdict) {
      if (!selectedItem || selectedItem.state === "decided") return;
      try {
        await commitDecision({
          reviewItemId: selectedItem.id,
          reviewerId: REVIEWER,
          verdict,
          durationMs: 1,
        });
        await refresh();
        // Auto-advance to the next pending item.
        const next = pendingNeighbor(items, selectedItem.id, +1);
        setSelectedItemId(next?.id ?? null);
      } catch {
        // surfaced in panel error state on next refresh
      }
    }

    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.key === "?") {
        setHelpOpen((v) => !v);
        return;
      }
      if (!selectedItem) return;
      if (e.key === "Escape") {
        setSelectedItemId(null);
        return;
      }
      if (e.key === "j" || e.key === "ArrowDown") {
        const next = neighbor(items, selectedItem.id, +1);
        if (next) setSelectedItemId(next.id);
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        const prev = neighbor(items, selectedItem.id, -1);
        if (prev) setSelectedItemId(prev.id);
        return;
      }
      if (e.key === "a") void quickDecide("approve");
      if (e.key === "r") void quickDecide("remove");
      if (e.key === "e") void quickDecide("escalate");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, refresh, selectedItem]);

  const splitView = selectedItemId !== null;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-light tracking-tight">Review queue</h2>
          <p className="text-xs text-[color:var(--muted-foreground)]">
            instance · <span className="font-mono">{INSTANCE}</span> ·{" "}
            {items === null
              ? "loading…"
              : `${items.filter((i) => i.state !== "decided").length} pending · ${items.filter((i) => i.state === "decided").length} decided`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHelpOpen(true)}
            className="rounded-md border border-[color:var(--border)] px-3 py-1 text-xs uppercase tracking-widest text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
          >
            ? shortcuts
          </button>
          <button
            onClick={refresh}
            className="rounded-md border border-[color:var(--border)] px-3 py-1 text-xs uppercase tracking-widest text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
          >
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error} — is the runciter running on :4001?
        </p>
      )}

      {items && items.length === 0 && !error && (
        <p className="rounded-md border border-[color:var(--border)] p-6 text-center text-sm text-[color:var(--muted-foreground)]">
          Queue is empty. Run <code className="font-mono">pnpm seed</code> to
          populate it.
        </p>
      )}

      {items === null && !error && (
        <ul className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <li
              key={i}
              className="h-12 animate-pulse rounded-lg border border-[color:var(--border)] bg-[color:var(--card)]"
            />
          ))}
        </ul>
      )}

      {items && items.length > 0 && (
        <div
          className={cn(
            "grid gap-4",
            splitView
              ? "grid-cols-[18rem_1fr] h-[calc(100vh-12rem)]"
              : "grid-cols-1",
          )}
        >
          <ul
            className={cn(
              "flex flex-col gap-2 overflow-y-auto",
              splitView && "pr-2",
            )}
          >
            {items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() =>
                    setSelectedItemId((cur) => (cur === item.id ? null : item.id))
                  }
                  className={cn(
                    "block w-full rounded-lg border p-3 text-left transition-colors",
                    item.id === selectedItemId
                      ? "border-[color:var(--accent-blue)] bg-[color:var(--card)]"
                      : "border-[color:var(--border)] bg-[color:var(--card)] hover:border-[color:var(--border-strong)]",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset",
                        QUEUE_BADGE[item.queue],
                      )}
                    >
                      {item.queue}
                    </span>
                    {item.state === "decided" && (
                      <span className="text-[10px] uppercase tracking-widest text-[color:var(--muted-foreground)]">
                        {item.finalVerdict}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 truncate font-mono text-[10px] text-[color:var(--muted-foreground)]">
                    {item.contentEventId.slice(0, 8)}
                  </div>
                  <div
                    className={cn(
                      "mt-0.5 truncate text-xs",
                      splitView ? "text-[color:var(--muted-foreground)]" : "",
                    )}
                  >
                    {item.recommendedAction.reason}
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {splitView && selectedItem && (
            <QueueDetailPanel
              item={selectedItem}
              onCommit={async () => {
                await refresh();
              }}
              onClose={() => setSelectedItemId(null)}
            />
          )}
        </div>
      )}

      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

function neighbor(
  items: readonly ReviewItem[] | null,
  fromId: string,
  delta: 1 | -1,
): ReviewItem | null {
  if (!items) return null;
  const idx = items.findIndex((i) => i.id === fromId);
  if (idx === -1) return null;
  const next = items[idx + delta];
  return next ?? null;
}

function pendingNeighbor(
  items: readonly ReviewItem[] | null,
  fromId: string,
  delta: 1 | -1,
): ReviewItem | null {
  if (!items) return null;
  let idx = items.findIndex((i) => i.id === fromId);
  if (idx === -1) return null;
  while (true) {
    idx += delta;
    const next = items[idx];
    if (!next) return null;
    if (next.state !== "decided") return next;
  }
}

function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[28rem] rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-6 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-xs uppercase tracking-widest text-[color:var(--muted-foreground)]">
          Keyboard shortcuts
        </h3>
        <ul className="space-y-2 font-mono text-xs">
          <ShortcutRow keys={["j", "↓"]} action="next item" />
          <ShortcutRow keys={["k", "↑"]} action="previous item" />
          <ShortcutRow keys={["a"]} action="approve" />
          <ShortcutRow keys={["r"]} action="remove" />
          <ShortcutRow keys={["e"]} action="escalate" />
          <ShortcutRow keys={["esc"]} action="back to list" />
          <ShortcutRow keys={["?"]} action="toggle this help" />
        </ul>
        <div className="mt-4 text-[10px] text-[color:var(--muted-foreground)]">
          Shortcuts ignore inputs/textareas — type rationale freely. Quick keys
          (a/r/e) skip the rationale field; click the buttons to require one.
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full rounded-md border border-[color:var(--border)] py-1 text-xs uppercase tracking-widest hover:bg-[color:var(--muted)]"
        >
          close
        </button>
      </div>
    </div>
  );
}

function ShortcutRow({
  keys,
  action,
}: {
  keys: readonly string[];
  action: string;
}) {
  return (
    <li className="flex items-center justify-between">
      <span className="flex gap-1">
        {keys.map((k) => (
          <kbd
            key={k}
            className="rounded border border-[color:var(--border)] bg-[color:var(--muted)] px-1.5 py-0.5"
          >
            {k}
          </kbd>
        ))}
      </span>
      <span className="text-[color:var(--muted-foreground)]">{action}</span>
    </li>
  );
}
