import { useEffect, useMemo, useState } from "react";
import {
  Cloud,
  Cpu,
  Database,
  FlaskConical,
  Globe,
  HardDrive,
  MonitorCog,
  Plug,
  Trash2,
  Wrench,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteSkillRegistration,
  getSkillCatalog,
  getSkills,
  listSkillRegistrations,
  toggleSkillRegistration,
  type SkillCatalogEntry,
  type SkillRegistration,
  type SkillSummary,
  type SkillsResponse,
} from "../lib/api.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Switch } from "../components/ui/switch.js";
import { PageHeader } from "../components/PageHeader.js";
import { Stat } from "../components/Stat.js";
import { SkillCreateSheet } from "../components/SkillCreateSheet.js";
import { cn } from "../lib/utils.js";

const TOOL_ICON = {
  db: Database,
  http: Globe,
  fs: HardDrive,
  compute: Zap,
} as const;

interface SkillRow {
  /** Canonical skill family / meta name. */
  name: string;
  summary: SkillSummary;
  /** True iff this skill exists because of a SkillRegistration row (vs. an
   *  env-based default registered at runciter boot). */
  origin: "default" | "user";
  registration: SkillRegistration | null;
  /** Used by the `<Switch>` — defaults true for default-skills (hot session
   *  override only), reflects DB state for user skills. */
  enabled: boolean;
}

export function SkillsView() {
  const [data, setData] = useState<SkillsResponse | null>(null);
  const [catalog, setCatalog] = useState<SkillCatalogEntry[] | null>(null);
  const [registrations, setRegistrations] = useState<SkillRegistration[]>([]);
  const [defaultDisabled, setDefaultDisabled] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const loadAll = () => {
    Promise.all([getSkills(), getSkillCatalog(), listSkillRegistrations("default")])
      .then(([s, c, regs]) => {
        setData(s);
        setCatalog(c);
        setRegistrations(regs);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build the unified row model: every active skill, annotated with
  // origin + linked registration row (when present).
  const rows = useMemo<SkillRow[]>(() => {
    if (!data || !catalog) return [];
    const familyToCatalog = new Map(catalog.map((c) => [c.family, c]));
    const familyToReg = new Map(registrations.map((r) => {
      const entry = catalog.find((c) => c.catalogId === r.catalogId);
      return [entry?.family ?? r.catalogId, r] as const;
    }));
    return data.skills.map((s) => {
      const entry = familyToCatalog.get(s.name);
      const registration = familyToReg.get(s.name) ?? null;
      const origin: SkillRow["origin"] = registration ? "user" : "default";
      const enabled =
        origin === "user"
          ? (registration?.enabled ?? true)
          : !defaultDisabled.has(s.name);
      void entry;
      return { name: s.name, summary: s, origin, registration, enabled };
    });
  }, [data, catalog, registrations, defaultDisabled]);

  const counts = useMemo(() => {
    const c = { active: 0, local: 0, remote: 0, shadow: 0 };
    if (!data) return c;
    for (const r of rows) {
      if (r.enabled) c.active += 1;
      if (r.summary.dataLeavesMachine) c.remote += 1;
      else c.local += 1;
      if (data.shadow.includes(r.summary.name)) c.shadow += 1;
    }
    return c;
  }, [data, rows]);

  const handleToggle = async (row: SkillRow) => {
    if (row.origin === "default") {
      setDefaultDisabled((prev) => {
        const next = new Set(prev);
        if (next.has(row.name)) next.delete(row.name);
        else next.add(row.name);
        return next;
      });
      return;
    }
    if (!row.registration) return;
    const next = !row.registration.enabled;
    // Optimistic update.
    setRegistrations((prev) =>
      prev.map((r) =>
        r.id === row.registration!.id ? { ...r, enabled: next } : r,
      ),
    );
    try {
      await toggleSkillRegistration(row.registration.id, next);
    } catch (err) {
      // Roll back on failure.
      setRegistrations((prev) =>
        prev.map((r) =>
          r.id === row.registration!.id ? { ...r, enabled: !next } : r,
        ),
      );
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (row: SkillRow) => {
    if (row.origin !== "user" || !row.registration) return;
    if (!confirm(`Remove "${row.registration.displayName}"?`)) return;
    try {
      await deleteSkillRegistration(row.registration.id);
      setRegistrations((prev) => prev.filter((r) => r.id !== row.registration!.id));
      // Refetch active skill list so the row disappears immediately.
      getSkills()
        .then(setData)
        .catch(() => {});
      toast.success(`Removed ${row.registration.displayName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Skills"
        description="Active classifiers and tools dispatched by the runciter. Toggle a default skill for the current session, or add a new skill to persist across restarts."
        actions={
          <SkillCreateSheet
            onCreated={(reg) => {
              setRegistrations((prev) => [reg, ...prev]);
              // Refetch active skills so the newly-wired one shows up.
              getSkills().then(setData).catch(() => {});
            }}
          />
        }
      />

      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Active"
          value={counts.active}
          hint={`${rows.length} registered`}
          icon={<Plug className="h-3 w-3" />}
        />
        <Stat
          label="Local-only"
          value={counts.local}
          hint="never leaves machine"
          icon={<Cpu className="h-3 w-3" />}
          tone="good"
        />
        <Stat
          label="Remote"
          value={counts.remote}
          hint="hits external API"
          icon={<Cloud className="h-3 w-3" />}
          tone="warn"
        />
        <Stat
          label="Shadow"
          value={counts.shadow}
          hint="silent agreement runs"
          icon={<FlaskConical className="h-3 w-3" />}
          tone="info"
        />
      </section>

      <Card className="gap-4 py-5">
        <CardHeader className="px-5 pb-0">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Plug className="h-4 w-4" />
            Active skills
          </CardTitle>
          <CardDescription>
            Toggle to disable. Default skills reset on restart; user-added skills persist.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          {!data || !catalog ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((row) => (
                <SkillListRow
                  key={row.name}
                  row={row}
                  isShadow={data.shadow.includes(row.name)}
                  onToggle={() => handleToggle(row)}
                  onDelete={() => handleDelete(row)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="gap-4 py-5">
        <CardHeader className="px-5 pb-0">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Wrench className="h-4 w-4" />
            Registered tools
          </CardTitle>
          <CardDescription>Side-effects and lookups available to skills.</CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          {!data ? (
            <Skeleton className="h-20 w-full" />
          ) : data.tools.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tools registered.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.tools.map((t) => {
                const Icon = TOOL_ICON[t.kind];
                return (
                  <li
                    key={t.name}
                    className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-3"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card/40 text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-mono text-[13px]">{t.name}</div>
                      <div className="mt-0.5 text-[12px] text-muted-foreground">
                        {t.description}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
                        t.mutates
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                          : "border-border bg-muted/40 text-muted-foreground",
                      )}
                    >
                      {t.mutates ? "mutates" : "read-only"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SkillListRow({
  row,
  isShadow,
  onToggle,
  onDelete,
}: {
  row: SkillRow;
  isShadow: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const s = row.summary;
  return (
    <li
      className={cn(
        "grid grid-cols-[1fr_auto] items-center gap-4 py-3 transition-opacity",
        !row.enabled && "opacity-50",
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-[13px] text-foreground">
            {s.name}
          </span>
          <SkillBadge model={s.executionModel} />
          <PrivacyBadge leaves={s.dataLeavesMachine} />
          <OriginChip origin={row.origin} />
          {isShadow && (
            <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-sky-700 dark:text-sky-300">
              <FlaskConical className="h-2.5 w-2.5" />
              shadow
            </span>
          )}
        </div>
        {s.description && (
          <div className="mt-1 truncate text-[12px] text-muted-foreground">
            {s.description}
          </div>
        )}
        {row.origin === "default" && !row.enabled && (
          <div className="mt-1 font-mono text-[10px] text-muted-foreground/70">
            session-only — edit config/policies/default.yaml to persist
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {s.costEstimateUsd === null
            ? "—"
            : s.costEstimateUsd === 0
              ? "free"
              : `$${s.costEstimateUsd.toFixed(4)}/call`}
        </span>
        <Switch
          checked={row.enabled}
          onCheckedChange={onToggle}
          aria-label={`Toggle ${s.name}`}
        />
        {row.origin === "user" && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Remove ${s.name}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        )}
      </div>
    </li>
  );
}

function SkillBadge({ model }: { model: SkillSummary["executionModel"] }) {
  const Icon = model === "in-process" ? Cpu : model === "remote-api" ? Cloud : MonitorCog;
  const tone =
    model === "remote-api"
      ? "border-[color:var(--accent-blue)]/30 bg-[color:var(--accent-blue)]/10 text-[color:var(--accent-blue)]"
      : "border-border bg-muted/40 text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
        tone,
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {model}
    </span>
  );
}

function PrivacyBadge({ leaves }: { leaves: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
        leaves
          ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      )}
    >
      {leaves ? "leaves machine" : "local-only"}
    </span>
  );
}

function OriginChip({ origin }: { origin: SkillRow["origin"] }) {
  if (origin === "default") {
    return (
      <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        default
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-violet-700 dark:text-violet-300">
      user
    </span>
  );
}
