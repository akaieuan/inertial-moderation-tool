import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import type { Modality, ReviewerTag } from "@inertial/schemas";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.js";
import { Button } from "./ui/button.js";
import { Skeleton } from "./ui/skeleton.js";
import {
  getTagCatalog,
  type TagCatalogEntry,
  type TagModality,
} from "../lib/api.js";
import { cn } from "../lib/utils.js";

interface ReviewerTagPickerProps {
  /** Modalities the open event has — controls which tags surface. */
  eventModalities: readonly Modality[];
  /** Tags the reviewer has already staged (or that came from past reviews). */
  staged: ReviewerTag[];
  onPick: (tag: ReviewerTag) => void;
}

/**
 * Compact "+ Add tag" trigger + popover catalog. The picker filters the
 * TAG_CATALOG to entries whose `applicableModalities` overlap the event's
 * modalities (plus always showing `cross-modal` tags).
 *
 * Picking a tag fires `onPick` with a new ReviewerTag (no scope set — scope
 * picking is a follow-on UI). The picker stays open so multiple tags can be
 * added in one session.
 */
export function ReviewerTagPicker({
  eventModalities,
  staged,
  onPick,
}: ReviewerTagPickerProps) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<TagCatalogEntry[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open || catalog) return;
    let cancelled = false;
    getTagCatalog()
      .then((c) => !cancelled && setCatalog(c))
      .catch(() => !cancelled && setCatalog([]));
    return () => {
      cancelled = true;
    };
  }, [open, catalog]);

  const applicableModalities = useMemo<Set<TagModality>>(() => {
    const set = new Set<TagModality>(eventModalities as readonly TagModality[]);
    set.add("cross-modal");
    return set;
  }, [eventModalities]);

  const stagedIds = useMemo(() => new Set(staged.map((t) => t.tagId)), [staged]);

  const visible = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    return catalog.filter((c) => {
      const overlap = c.applicableModalities.some((m) => applicableModalities.has(m));
      if (!overlap) return false;
      if (q.length === 0) return true;
      return (
        c.tagId.toLowerCase().includes(q) ||
        c.displayName.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
      );
    });
  }, [catalog, query, applicableModalities]);

  // Group by `group` for nicer browse UX.
  const grouped = useMemo(() => {
    const m = new Map<string, TagCatalogEntry[]>();
    for (const e of visible) {
      const arr = m.get(e.group) ?? [];
      arr.push(e);
      m.set(e.group, arr);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [visible]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 px-2 text-[12px]">
          <Plus className="mr-1 h-3 w-3" />
          Add tag
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-[340px] p-0"
      >
        <div className="border-b border-border px-3 py-2">
          <div className="relative">
            <Search
              className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.5}
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search tags…"
              className="w-full rounded-md border border-input bg-background py-1 pl-7 pr-2 text-[12px] placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>
        <div className="max-h-[320px] overflow-y-auto p-2">
          {!catalog ? (
            <div className="space-y-1.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : grouped.length === 0 ? (
            <p className="px-2 py-1.5 text-[12px] text-muted-foreground">
              no matching tags
            </p>
          ) : (
            grouped.map(([group, entries]) => (
              <div key={group} className="mb-2 last:mb-0">
                <div className="px-2 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {group}
                </div>
                <ul className="flex flex-col">
                  {entries.map((entry) => {
                    const isStaged = stagedIds.has(entry.tagId);
                    return (
                      <li key={entry.tagId}>
                        <button
                          type="button"
                          disabled={isStaged}
                          onClick={() => onPick({ tagId: entry.tagId })}
                          className={cn(
                            "flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors",
                            isStaged
                              ? "cursor-not-allowed opacity-60"
                              : "hover:bg-muted/40",
                          )}
                        >
                          <div className="flex w-full items-center justify-between gap-2">
                            <span className="font-mono text-[12px] text-foreground">
                              {entry.displayName}
                            </span>
                            <SeverityChip severity={entry.severity} />
                          </div>
                          <span className="text-[11px] leading-snug text-muted-foreground">
                            {entry.description}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SeverityChip({ severity }: { severity: TagCatalogEntry["severity"] }) {
  const tone = {
    danger: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    info: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    neutral: "border-border bg-muted/40 text-muted-foreground",
  }[severity];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
        tone,
      )}
    >
      {severity}
    </span>
  );
}
