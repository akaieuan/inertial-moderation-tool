import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Bot,
  ChevronDown,
  Cpu,
  Eye,
  NotebookPen,
  Plus,
  Send,
  Sparkles,
} from "lucide-react";
import { cn } from "../lib/utils.js";
import { FlagLegend, FlagMap } from "./FlagMap.js";
import { PanelToggle } from "./PanelToggle.js";

export type RightPanelKind = "agent-activity" | "notes" | "chat";

export const RIGHT_PANEL_OPTIONS: ReadonlyArray<{
  key: RightPanelKind;
  label: string;
  Icon: typeof Activity;
  hint: string;
}> = [
  { key: "agent-activity", label: "Agent activity", Icon: Activity, hint: "Live inertial run trace" },
  { key: "notes", label: "Notes", Icon: NotebookPen, hint: "Per-case scratchpad" },
  { key: "chat", label: "Chat", Icon: Bot, hint: "Ask about a flag (preview)" },
];

interface RightPanelProps {
  kind: RightPanelKind;
  onChange: (next: RightPanelKind | null) => void;
}

export function RightPanel({ kind, onChange }: RightPanelProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onChange(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChange]);

  return (
    <aside className="relative flex h-full w-[340px] shrink-0 flex-col border-l border-border bg-card/40 backdrop-blur">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 z-10 h-11"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />
      <div className="absolute right-3 top-2 z-20">
        <PanelToggle value={kind} onChange={onChange} />
      </div>
      <div className="flex-1 overflow-y-auto">
        {kind === "agent-activity" && <AgentActivityPanel />}
        {kind === "notes" && <NotesPanel />}
        {kind === "chat" && <ChatPanel />}
      </div>
    </aside>
  );
}

function PanelSection({
  label,
  children,
  className,
  action,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={cn("px-4 py-3", className)}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ───────────────────────── Agent Activity ───────────────────────── */

type Stage = {
  name: string;
  kind: "in-process" | "remote-api";
  ms: number;
  status: "ok" | "warn" | "fail";
  output: string;
};

const DEMO_STAGES: Stage[] = [
  {
    name: "text-detect-spam-link",
    kind: "in-process",
    ms: 8,
    status: "ok",
    output: "spam-link-presence=0.04",
  },
  {
    name: "text-classify-toxicity@local",
    kind: "in-process",
    ms: 142,
    status: "ok",
    output: "toxic=0.62 insult=0.55",
  },
  {
    name: "text-classify-toxicity@anthropic",
    kind: "remote-api",
    ms: 412,
    status: "ok",
    output: "shadow: agreed",
  },
  {
    name: "policy-engine",
    kind: "in-process",
    ms: 4,
    status: "ok",
    output: "→ queue.quick (toxicity > 0.6)",
  },
];

function AgentActivityPanel() {
  const stages = DEMO_STAGES;
  const total = stages.reduce((acc, s) => acc + s.ms, 0);
  const remote = stages.filter((s) => s.kind === "remote-api").length;

  return (
    <div className="divide-y divide-border">
      <PanelSection label="Last dispatch">
        <div className="flex items-end justify-between gap-3">
          <div className="leading-none">
            <span className="text-2xl font-light tabular-nums tracking-tight">
              {total}
              <span className="ml-0.5 text-sm text-muted-foreground">ms</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 pb-1 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>all green</span>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border">
          <Stat label="skills" value={stages.length} />
          <Stat label="local" value={stages.length - remote} />
          <Stat label="remote" value={remote} />
        </div>
      </PanelSection>

      <PanelSection
        label={`Trace · ${stages.length} steps`}
        action={
          <button className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground">
            full
            <ArrowUpRight className="h-2.5 w-2.5" strokeWidth={2} />
          </button>
        }
      >
        <ol className="relative space-y-0">
          <span
            aria-hidden
            className="absolute left-[5px] top-2 bottom-2 w-px bg-border"
          />
          {stages.map((s) => (
            <li key={s.name} className="relative pl-5 py-1.5">
              <span
                className={cn(
                  "absolute left-0 top-2.5 h-[11px] w-[11px] rounded-full border-2 border-background",
                  STAGE_DOT[s.status],
                )}
              />
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-mono text-[11px] text-foreground">
                  {s.name}
                </span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                  {s.ms}ms
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span className="truncate font-mono">{s.output}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-sm px-1 py-px font-mono uppercase tracking-wider",
                    s.kind === "remote-api"
                      ? "bg-[color:var(--accent-blue)]/10 text-[color:var(--accent-blue)]"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {s.kind === "remote-api" ? "remote" : "local"}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </PanelSection>

      <div className="px-4 py-3">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Live trace appears here while the runciter dispatches inertials. Currently
          showing the last review.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center bg-card/60 py-2">
      <span className="text-sm font-medium tabular-nums leading-none">{value}</span>
      <span className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

const STAGE_DOT: Record<Stage["status"], string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  fail: "bg-rose-500",
};

/* ───────────────────────── Notes ───────────────────────── */

function NotesPanel() {
  const [draft, setDraft] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("inertial-notes");
      if (raw) setDraft(raw);
    } catch {
      // ignore
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem("inertial-notes", draft);
        setSavedAt(Date.now());
      } catch {
        // ignore
      }
    }, 500);
    return () => clearTimeout(t);
  }, [draft, hydrated]);

  const wordCount = useMemo(() => {
    const trimmed = draft.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }, [draft]);

  return (
    <div className="flex h-full flex-col">
      <textarea
        ref={taRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Scratchpad — saves locally, not shared.

e.g. flagged user has 3 prior actions; recheck identity-hate threshold next week…"
        className={cn(
          "flex-1 min-h-[18rem] resize-none border-0 bg-transparent px-4 py-3 text-[13px] leading-relaxed",
          "placeholder:text-muted-foreground/70 placeholder:whitespace-pre-line",
          "focus-visible:outline-none focus-visible:ring-0",
        )}
      />
      <footer className="flex items-center justify-between border-t border-border px-4 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full transition-colors",
              savedAt ? "bg-emerald-500" : "bg-muted-foreground/40",
            )}
          />
          <span className="tabular-nums normal-case tracking-normal">
            {savedAt
              ? `Saved ${new Date(savedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : "Auto-save"}
          </span>
        </div>
        <span className="tabular-nums">
          {wordCount} {wordCount === 1 ? "word" : "words"}
        </span>
      </footer>
    </div>
  );
}

/* ───────────────────────── Chat ───────────────────────── */

const CHAT_SUGGESTIONS = [
  "Why was this post flagged?",
  "Summarize the thread context",
  "Draft policy language for this case",
];

function ChatPanel() {
  const reviewer = "ieuan";
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 pt-4">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles
            className="h-4 w-4 text-[color:var(--accent-rose)]"
            strokeWidth={1.5}
          />
          <h2 className="text-[14px] font-medium tracking-tight text-foreground">
            What's up next, {reviewer}?
          </h2>
        </div>

        <OverviewCard />

        <div className="mt-4 mb-1 flex flex-col gap-0.5">
          {CHAT_SUGGESTIONS.map((q) => (
            <button
              key={q}
              disabled
              className={cn(
                "group flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                "text-[12px] text-muted-foreground",
                "hover:bg-card/60 hover:text-foreground",
                "disabled:cursor-not-allowed",
              )}
            >
              <span className="truncate">{q}</span>
              <ArrowUpRight
                className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60"
                strokeWidth={1.5}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 pb-3 pt-3">
        <form onSubmit={(e) => e.preventDefault()}>
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-2xl border border-border/80 bg-card/60 px-3.5 py-2.5 transition-colors",
              "focus-within:border-foreground/20 focus-within:bg-card",
            )}
          >
            <input
              type="text"
              placeholder="Ask anything…"
              disabled
              className={cn(
                "flex-1 bg-transparent text-[13px] leading-none",
                "placeholder:text-muted-foreground/70",
                "focus-visible:outline-none",
                "disabled:cursor-not-allowed",
              )}
            />
            <button
              type="submit"
              disabled
              aria-label="Send"
              className={cn(
                "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-foreground/60 transition-colors",
                "hover:bg-foreground/15 hover:text-foreground",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <Send className="h-3 w-3" strokeWidth={2} />
            </button>
          </div>
        </form>
        <div className="mt-2 flex items-center gap-0.5">
          <ToolChip icon={Cpu} label="Sonnet 4.6" hasChevron />
          <ToolChip icon={Eye} label="Vision" />
          <ToolChip icon={Plus} srLabel="Add context" />
          <span className="ml-auto pr-1 text-[10px] text-muted-foreground/70">
            Preview · disabled
          </span>
        </div>
      </div>
    </div>
  );
}

function ToolChip({
  icon: Icon,
  label,
  hasChevron,
  srLabel,
}: {
  icon: typeof Sparkles;
  label?: string;
  hasChevron?: boolean;
  srLabel?: string;
}) {
  return (
    <button
      disabled
      aria-label={srLabel}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-colors",
        "hover:bg-card hover:text-foreground",
        "disabled:cursor-not-allowed",
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={1.5} />
      {label && <span className="leading-none">{label}</span>}
      {hasChevron && (
        <ChevronDown className="h-2.5 w-2.5 opacity-60" strokeWidth={1.5} />
      )}
    </button>
  );
}

function OverviewCard() {
  return (
    <div className="rounded-xl border border-border bg-card/30 p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-0.5">
          <button className="rounded-md bg-foreground/[0.08] px-2 py-0.5 text-[11px] font-medium text-foreground">
            Overview
          </button>
          <button
            disabled
            className="cursor-not-allowed rounded-md px-2 py-0.5 text-[11px] text-muted-foreground/60"
          >
            Skills
          </button>
        </div>
        <div className="flex items-center gap-0.5">
          <button className="rounded-md bg-foreground/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-foreground">
            All
          </button>
          <button
            disabled
            className="cursor-not-allowed rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground/60"
          >
            30d
          </button>
          <button
            disabled
            className="cursor-not-allowed rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground/60"
          >
            7d
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Stat2 label="Pending" value="13" />
        <Stat2 label="Decided today" value="4" />
        <Stat2 label="Avg decision" value="47s" />
        <Stat2 label="Active days" value="15" />
        <Stat2 label="Current streak" value="3d" />
        <Stat2 label="Longest streak" value="9d" />
        <Stat2 label="Peak hour" value="9 PM" />
        <Stat2 label="Top channel" value="toxic" mono />
      </div>

      <div className="mt-4">
        <FlagMap data={FLAG_DATA} />
        <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground/80">
          <span>15 weeks</span>
          <FlagLegend />
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        47 flags this week — mostly{" "}
        <span className="font-mono text-foreground/80">toxic</span> +{" "}
        <span className="font-mono text-foreground/80">spam-link-presence</span>.
      </p>
    </div>
  );
}

function Stat2({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] leading-none text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1.5 text-[15px] font-medium leading-none tracking-tight text-foreground tabular-nums",
          mono && "font-mono text-[13px]",
        )}
      >
        {value}
      </div>
    </div>
  );
}

const FLAG_DATA: number[] = [
  0, 0, 0, 0, 0, 0, 0,
  0, 0, 1, 0, 0, 0, 0,
  0, 0, 0, 0, 1, 0, 0,
  0, 0, 0, 0, 0, 0, 0,
  0, 1, 0, 0, 0, 0, 0,
  0, 0, 0, 1, 0, 0, 0,
  0, 0, 0, 0, 0, 2, 0,
  0, 0, 1, 0, 0, 0, 0,
  0, 2, 0, 0, 0, 0, 1,
  0, 0, 0, 3, 0, 0, 0,
  0, 0, 4, 0, 5, 0, 2,
  0, 6, 0, 0, 8, 4, 0,
  3, 0, 7, 9, 0, 6, 5,
  0, 8, 11, 7, 0, 12, 9,
  10, 13, 0, 14, 11, 8, 15,
];
