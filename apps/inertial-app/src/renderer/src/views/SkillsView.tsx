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
  Wrench,
  Zap,
} from "lucide-react";
import { getSkills, type SkillSummary, type SkillsResponse } from "../lib/api.js";
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

export function SkillsView() {
  const [data, setData] = useState<SkillsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extra, setExtra] = useState<SkillSummary[]>([]);
  const [disabled, setDisabled] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    getSkills()
      .then((s) => !cancelled && setData(s))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  const skills = useMemo(() => {
    if (!data) return [];
    return [...data.skills, ...extra];
  }, [data, extra]);

  const counts = useMemo(() => {
    const c = { active: 0, local: 0, remote: 0, shadow: 0 };
    if (!data) return c;
    for (const s of skills) {
      if (!disabled.has(s.name)) c.active += 1;
      if (s.dataLeavesMachine) c.remote += 1;
      else c.local += 1;
      if (data.shadow.includes(s.name)) c.shadow += 1;
    }
    return c;
  }, [data, skills, disabled]);

  const toggleSkill = (name: string) => {
    setDisabled((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Skills"
        description="Active classifiers and tools dispatched by the runciter. Disable to drop a skill from this instance's policy."
        actions={<SkillCreateSheet onCreated={(s) => setExtra((p) => [...p, s])} />}
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
          hint={`${skills.length} registered`}
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
          <CardDescription>Toggle to drop a skill from this instance's policy.</CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          {!data ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {skills.map((s) => {
                const isShadow = data.shadow.includes(s.name);
                const enabled = !disabled.has(s.name);
                return (
                  <li
                    key={s.name}
                    className={cn(
                      "grid grid-cols-[1fr_auto] items-center gap-4 py-3 transition-opacity",
                      !enabled && "opacity-50",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-mono text-[13px] text-foreground">
                          {s.name}
                        </span>
                        <SkillBadge model={s.executionModel} />
                        <PrivacyBadge leaves={s.dataLeavesMachine} />
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
                        checked={enabled}
                        onCheckedChange={() => toggleSkill(s.name)}
                        aria-label={`Toggle ${s.name}`}
                      />
                    </div>
                  </li>
                );
              })}
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
