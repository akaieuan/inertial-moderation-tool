import { Activity, Bot, NotebookPen } from "lucide-react";
import { useHistory, type HistoryEntry } from "../lib/history.js";
import type { RightPanelKind } from "./RightPanel.js";
import { RelativeTime } from "./RelativeTime.js";
import { cn } from "../lib/utils.js";

const ICON_FOR: Record<RightPanelKind, typeof Activity> = {
  "agent-activity": Activity,
  notes: NotebookPen,
  chat: Bot,
};

const SECTIONS: ReadonlyArray<{
  kind: RightPanelKind;
  label: string;
  empty: string;
  limit: number;
}> = [
  { kind: "chat", label: "Chats", empty: "No chats yet", limit: 4 },
  { kind: "agent-activity", label: "Agent runs", empty: "No runs yet", limit: 4 },
  { kind: "notes", label: "Notes", empty: "No notes yet", limit: 4 },
];

interface SidebarHistoryProps {
  onOpenPanel: (kind: RightPanelKind) => void;
  collapsed?: boolean;
}

export function SidebarHistory({ onOpenPanel, collapsed = false }: SidebarHistoryProps) {
  const { entries } = useHistory();

  if (collapsed) return null;

  const grouped: Record<RightPanelKind, HistoryEntry[]> = {
    chat: [],
    "agent-activity": [],
    notes: [],
  };
  for (const e of entries) grouped[e.kind].push(e);

  const hasAny = entries.length > 0;
  if (!hasAny) return null;

  return (
    <div className="mt-4 px-1.5">
      {SECTIONS.map(({ kind, label, empty, limit }) => {
        const items = grouped[kind].slice(0, limit);
        return (
          <section key={kind} className="mt-3 first:mt-0">
            <div className="flex items-center justify-between px-2 pb-1">
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                {label}
              </span>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenPanel(kind)}
                  className="text-[10px] text-muted-foreground/60 transition-colors hover:text-foreground"
                  title={`Open ${label.toLowerCase()} panel`}
                >
                  {items.length}
                </button>
              )}
            </div>
            {items.length === 0 ? (
              <div className="px-2 pb-1 text-[11px] text-muted-foreground/60">{empty}</div>
            ) : (
              <ul className="flex flex-col gap-px">
                {items.map((entry) => (
                  <HistoryRow key={entry.id} entry={entry} onOpen={onOpenPanel} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function HistoryRow({
  entry,
  onOpen,
}: {
  entry: HistoryEntry;
  onOpen: (kind: RightPanelKind) => void;
}) {
  const Icon = ICON_FOR[entry.kind];
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(entry.kind)}
        title={entry.context ? `${entry.label} — ${entry.context}` : entry.label}
        className={cn(
          "group flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Icon className="h-3 w-3 shrink-0" strokeWidth={1.5} />
        <span className="flex-1 truncate">{entry.label}</span>
        <RelativeTime
          iso={entry.at}
          className="shrink-0 text-[10px] tabular-nums opacity-60"
        />
      </button>
    </li>
  );
}
