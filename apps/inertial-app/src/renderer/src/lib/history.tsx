import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { RightPanelKind } from "../components/RightPanel.js";

export interface HistoryEntry {
  id: string;
  kind: RightPanelKind;
  label: string;
  /** ISO timestamp. */
  at: string;
  /** Optional secondary line — e.g. the case the activity was about. */
  context?: string;
}

interface HistoryContextValue {
  entries: HistoryEntry[];
  recordEntry: (entry: Omit<HistoryEntry, "id" | "at">) => void;
  clearEntries: () => void;
}

const HistoryContext = createContext<HistoryContextValue | null>(null);

const STORAGE_KEY = "inertial-history";
const MAX_ENTRIES = 30;

const SEED: HistoryEntry[] = [
  {
    id: "h-1",
    kind: "agent-activity",
    label: "Marcus Lee · toxic 0.98",
    at: minutesAgo(3),
    context: "queue.quick",
  },
  {
    id: "h-2",
    kind: "chat",
    label: "Why was this post flagged?",
    at: minutesAgo(11),
    context: "@anon_throwaway",
  },
  {
    id: "h-3",
    kind: "notes",
    label: "spam-link false positive patterns",
    at: minutesAgo(22),
  },
  {
    id: "h-4",
    kind: "agent-activity",
    label: "@anon_throwaway · threat 0.95",
    at: minutesAgo(34),
    context: "queue.deep",
  },
  {
    id: "h-5",
    kind: "chat",
    label: "Summarize thread context",
    at: hoursAgo(1.2),
    context: "Alt Account",
  },
  {
    id: "h-6",
    kind: "notes",
    label: "Brigading checklist",
    at: hoursAgo(3),
  },
  {
    id: "h-7",
    kind: "agent-activity",
    label: "art_alt_account · nsfw 0.91",
    at: hoursAgo(5.5),
    context: "queue.deep",
  },
];

function minutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60_000).toISOString();
}

function readStored(): HistoryEntry[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED;
    const parsed = JSON.parse(raw) as HistoryEntry[];
    if (!Array.isArray(parsed) || parsed.length === 0) return SEED;
    return parsed;
  } catch {
    return SEED;
  }
}

export function HistoryProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<HistoryEntry[]>(() => readStored());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // ignore
    }
  }, [entries]);

  const recordEntry = useCallback((entry: Omit<HistoryEntry, "id" | "at">) => {
    setEntries((cur) => {
      const next: HistoryEntry = {
        ...entry,
        id: `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        at: new Date().toISOString(),
      };
      return [next, ...cur].slice(0, MAX_ENTRIES);
    });
  }, []);

  const clearEntries = useCallback(() => setEntries([]), []);

  const value = useMemo<HistoryContextValue>(
    () => ({ entries, recordEntry, clearEntries }),
    [entries, recordEntry, clearEntries],
  );

  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export function useHistory(): HistoryContextValue {
  const ctx = useContext(HistoryContext);
  if (!ctx) throw new Error("useHistory must be used inside <HistoryProvider>");
  return ctx;
}
