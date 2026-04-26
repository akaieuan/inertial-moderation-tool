import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentTrace, ReviewItem, ReviewVerdict } from "@aur/schemas";
import { commitDecision, getEventDetail, listQueue } from "../lib/api.js";
import { cn } from "../lib/utils.js";
import { MiniTrace, type TraceStep } from "../components/hitl/MiniTrace.js";
import { ApproveRejectRow } from "../components/hitl/ApproveRejectRow.js";

const INSTANCE = "smoke.local";
const REVIEWER = "ieuan@local";
const REFRESH_MS = 4_000;

const QUEUE_BADGE: Record<ReviewItem["queue"], string> = {
  quick: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  deep: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  escalation: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

interface QueueRowProps {
  item: ReviewItem;
  onDecide: (
    reviewItemId: string,
    verdict: ReviewVerdict,
    durationMs: number,
  ) => Promise<void>;
}

function QueueRow({ item, onDecide }: QueueRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [traces, setTraces] = useState<AgentTrace[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const openedAt = useRef<number | null>(null);

  const channels = useMemo(() => {
    const s = item.recommendedAction;
    return `${s.kind} · ${s.reason}`;
  }, [item.recommendedAction]);

  const expand = useCallback(async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    openedAt.current = Date.now();
    if (!text || !traces) {
      setLoading(true);
      try {
        const detail = await getEventDetail(item.contentEventId);
        setText(detail.event.text ?? "(no text)");
        setTraces(detail.traces);
      } catch (err) {
        console.error("getEventDetail failed", err);
      } finally {
        setLoading(false);
      }
    }
  }, [expanded, item.contentEventId, text, traces]);

  const decide = useCallback(
    async (verdict: ReviewVerdict) => {
      const durationMs = openedAt.current
        ? Math.max(1, Date.now() - openedAt.current)
        : 1;
      setCommitting(true);
      try {
        await onDecide(item.id, verdict, durationMs);
      } finally {
        setCommitting(false);
      }
    },
    [item.id, onDecide],
  );

  return (
    <li className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-4">
      <button
        onClick={expand}
        className="grid w-full grid-cols-[8rem_1fr_auto] items-center gap-4 text-left"
      >
        <span
          className={cn(
            "inline-flex w-fit items-center rounded-md px-2 py-0.5 text-xs font-medium uppercase tracking-wide ring-1 ring-inset",
            QUEUE_BADGE[item.queue],
          )}
        >
          {item.queue}
        </span>
        <div className="min-w-0">
          <div className="truncate font-mono text-xs text-[color:var(--muted-foreground)]">
            {item.contentEventId}
          </div>
          <div className="truncate text-sm">{channels}</div>
        </div>
        <span className="text-xs text-[color:var(--muted-foreground)]">
          {expanded ? "−" : "+"}
        </span>
      </button>

      {expanded && (
        <div className="mt-4 flex flex-col gap-4 border-t border-[color:var(--border)] pt-4">
          <div>
            <h4 className="mb-1 text-xs uppercase tracking-widest text-[color:var(--muted-foreground)]">
              Content
            </h4>
            <p className="rounded-md bg-[color:var(--muted)] p-3 font-mono text-xs leading-relaxed">
              {loading ? "loading…" : text ?? "(loading)"}
            </p>
          </div>

          {traces && traces.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs uppercase tracking-widest text-[color:var(--muted-foreground)]">
                Agent traces
              </h4>
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
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
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
            <button
              onClick={() => decide("escalate")}
              disabled={committing || item.state === "decided"}
              className="rounded-md border border-[color:var(--border)] px-3 py-1 text-xs uppercase tracking-widest text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)] disabled:opacity-50"
            >
              Escalate
            </button>
          </div>
        </div>
      )}
    </li>
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
    if (s.kind === "thought") {
      return { type: "thought", label: s.content };
    }
    if (s.kind === "tool-call") {
      return { type: "action", label: s.tool, detail: JSON.stringify(s.args) };
    }
    if (s.kind === "tool-result") {
      return {
        type: "result",
        label: `${s.tool} (${s.durationMs}ms)`,
        detail:
          typeof s.result === "string" ? s.result : JSON.stringify(s.result).slice(0, 200),
      };
    }
    // error
    return { type: "result", label: `error: ${s.message}` };
  });
}

export function QueueView() {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const onDecide = useCallback(
    async (reviewItemId: string, verdict: ReviewVerdict, durationMs: number) => {
      await commitDecision({
        reviewItemId,
        reviewerId: REVIEWER,
        verdict,
        durationMs,
      });
      await refresh();
    },
    [refresh],
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-light tracking-tight">Review queue</h2>
          <p className="text-xs text-[color:var(--muted-foreground)]">
            instance · <span className="font-mono">{INSTANCE}</span> ·{" "}
            {items === null ? "loading…" : `${items.length} pending`}
          </p>
        </div>
        <button
          onClick={refresh}
          className="rounded-md border border-[color:var(--border)] px-3 py-1 text-xs uppercase tracking-widest text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
        >
          Refresh
        </button>
      </header>

      {error && (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error} — is the worker running on :4001?
        </p>
      )}

      {items && items.length === 0 && !error && (
        <p className="rounded-md border border-[color:var(--border)] p-6 text-center text-sm text-[color:var(--muted-foreground)]">
          Queue is empty. Run <code className="font-mono">pnpm seed</code> to
          populate it.
        </p>
      )}

      {items && items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <QueueRow key={item.id} item={item} onDecide={onDecide} />
          ))}
        </ul>
      )}
    </div>
  );
}
