import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock,
  Cpu,
  Cloud,
  Flag,
  GaugeCircle,
  ListChecks,
  ScanSearch,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { AuditEntry, ReviewItem } from "@inertial/schemas";
import {
  getEventDetail,
  listAudit,
  listQueue,
  verifyAudit,
  type AuditChainVerification,
} from "../lib/api.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card.js";
import { Button } from "../components/ui/button.js";
import { Badge } from "../components/ui/badge.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { ScrollArea } from "../components/ui/scroll-area.js";
import { PageHeader } from "../components/PageHeader.js";
import { Stat } from "../components/Stat.js";
import { FlagLegend, FlagMap, generateFlagDataset } from "../components/FlagMap.js";
import { AuthorBadge } from "../components/AuthorBadge.js";
import { RelativeTime } from "../components/RelativeTime.js";
import {
  SEVERITY_TEXT,
  severityFor,
  type Severity,
} from "../components/SeverityIndicator.js";
import { cn } from "../lib/utils.js";
import type { Section } from "../components/Sidebar.js";

const INSTANCE = "smoke.local";
const REVIEWER = "ieuan@local";

interface Props {
  onNavigate: (s: Section) => void;
}

interface PreviewItem {
  item: ReviewItem;
  authorHandle: string;
  authorDisplay: string | null;
  text: string | null;
  postedAt: string;
  topChannel: { channel: string; probability: number } | null;
}

const KIND_LABEL: Record<string, string> = {
  "event-ingested": "Event ingested",
  "signal-generated": "Signal generated",
  "queue-routed": "Routed to queue",
  "decision-recorded": "Decision recorded",
  "policy-evaluated": "Policy evaluated",
  "action-dispatched": "Action dispatched",
  "review-started": "Review started",
};

const KIND_DOT: Record<string, string> = {
  "event-ingested": "bg-sky-500",
  "signal-generated": "bg-violet-500",
  "queue-routed": "bg-amber-500",
  "decision-recorded": "bg-emerald-500",
  "policy-evaluated": "bg-cyan-500",
  "action-dispatched": "bg-fuchsia-500",
};

export function DashboardView({ onNavigate }: Props) {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [previews, setPreviews] = useState<PreviewItem[]>([]);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [chain, setChain] = useState<AuditChainVerification | null>(null);

  const refresh = useCallback(async () => {
    const [q, a, v] = await Promise.all([
      listQueue(INSTANCE).catch(() => null),
      listAudit(INSTANCE, { limit: 50 }).catch(() => [] as AuditEntry[]),
      verifyAudit(INSTANCE).catch(() => null),
    ]);
    setItems(q);
    setAudit(a);
    setChain(v);
    if (q) {
      const top5 = q.filter((i) => i.state !== "decided").slice(0, 5);
      const details = await Promise.all(
        top5.map(async (item) => {
          const d = await getEventDetail(item.contentEventId).catch(() => null);
          if (!d) {
            return {
              item,
              authorHandle: "unknown",
              authorDisplay: null,
              text: null,
              postedAt: item.createdAt,
              topChannel: null,
            } satisfies PreviewItem;
          }
          const top = d.signal
            ? Object.values(d.signal.channels).sort((a, b) => b.probability - a.probability)[0]
            : null;
          return {
            item,
            authorHandle: d.event.author.handle,
            authorDisplay: d.event.author.displayName ?? null,
            text: d.event.text,
            postedAt: d.event.postedAt,
            topChannel: top ? { channel: top.channel, probability: top.probability } : null,
          } satisfies PreviewItem;
        }),
      );
      setPreviews(details);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  const auditStats = useMemo(() => computeAuditStats(audit ?? []), [audit]);

  const flagDataset = useMemo(() => generateFlagDataset(52, 137), []);
  const flagTotal = useMemo(
    () => flagDataset.data.reduce((a, b) => a + b, 0),
    [flagDataset],
  );
  const flagThisWeek = useMemo(
    () => flagDataset.data.slice(-7).reduce((a, b) => a + b, 0),
    [flagDataset],
  );

  const channelMix = useMemo(() => {
    const tally = new Map<string, { sum: number; count: number; max: number }>();
    for (const p of previews) {
      if (!p.topChannel) continue;
      const cur = tally.get(p.topChannel.channel) ?? { sum: 0, count: 0, max: 0 };
      cur.sum += p.topChannel.probability;
      cur.count += 1;
      cur.max = Math.max(cur.max, p.topChannel.probability);
      tally.set(p.topChannel.channel, cur);
    }
    return Array.from(tally.entries())
      .map(([channel, v]) => ({ channel, count: v.count, avg: v.sum / v.count, max: v.max }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [previews]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={`Good evening, ${REVIEWER.split("@")[0]}`}
        description={
          items === null
            ? "Loading workspace…"
            : counts.pending === 0
              ? "All caught up. Nothing waiting on you."
              : `${counts.pending} item${counts.pending === 1 ? "" : "s"} pending across ${counts.quick} quick · ${counts.deep} deep · ${counts.escalation} escalation.`
        }
      />

      <section>
        <Card className="gap-4 py-5">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 px-5 pb-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <Flag className="h-4 w-4" />
                Flag activity
              </CardTitle>
              <CardDescription>
                Daily flag volume across the last 52 weeks.
              </CardDescription>
            </div>
            <div className="flex items-baseline gap-4 text-right">
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  This week
                </div>
                <div className="mt-0.5 text-lg font-medium tabular-nums leading-none">
                  {flagThisWeek}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  52w total
                </div>
                <div className="mt-0.5 text-lg font-medium tabular-nums leading-none">
                  {flagTotal}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-5">
            <div className="overflow-x-auto">
              <FlagMap
                data={flagDataset.data}
                dayMeta={flagDataset.meta}
                cellSize={13}
                gap={3}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground/80">
              <span>52 weeks</span>
              <FlagLegend />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat
          label="Pending review"
          value={counts.pending}
          hint={`${counts.escalation} escalation`}
          icon={<ListChecks className="h-3 w-3" />}
        />
        <Stat
          label="Decided today"
          value={counts.decided + auditStats.decisionsRecorded}
          hint={`${auditStats.decisionsRecorded} via dashboard`}
          icon={<CheckCircle2 className="h-3 w-3" />}
          tone="good"
        />
        <Stat
          label="Auto-allowed"
          value={Math.max(0, auditStats.eventsProcessed - auditStats.queueRouted)}
          hint={`${auditStats.eventsProcessed} ingested`}
          icon={<Sparkles className="h-3 w-3" />}
          tone="info"
        />
        <Stat
          label="Touched cloud"
          value={auditStats.cloudTouched}
          hint={
            auditStats.eventsProcessed === 0
              ? "no events"
              : `${((auditStats.cloudTouched / auditStats.eventsProcessed) * 100).toFixed(0)}% of total`
          }
          icon={<Cloud className="h-3 w-3" />}
          tone="warn"
        />
        <Stat
          label="Audit chain"
          value={chain?.valid ? "valid" : chain ? "broken" : "—"}
          hint={chain ? `${chain.inspected} entries` : "verifying…"}
          icon={<ShieldCheck className="h-3 w-3" />}
          tone={chain?.valid ? "good" : chain ? "danger" : "default"}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="gap-4 py-5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-5 pb-0">
            <div>
              <CardTitle className="text-base font-medium">Top of queue</CardTitle>
              <CardDescription>Next items waiting on a moderator.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => onNavigate("queue")}>
              Open queue
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="px-5">
            {items === null ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : previews.length === 0 ? (
              <EmptyRow
                icon={<CheckCircle2 className="h-5 w-5" />}
                title="All caught up"
                description="Nothing pending review."
              />
            ) : (
              <ul className="divide-y divide-border">
                {previews.map((p) => (
                  <li key={p.item.id}>
                    <button
                      onClick={() => onNavigate("queue")}
                      className="grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-3 py-2.5 text-left transition-colors hover:bg-muted/40 -mx-2 px-2 rounded-md"
                    >
                      <AuthorBadge
                        author={{
                          id: p.authorHandle,
                          handle: p.authorHandle,
                          displayName: p.authorDisplay,
                          priorActionCount: 0,
                        }}
                      />
                      <span className="truncate text-sm text-muted-foreground">
                        {p.text ?? "(media post)"}
                      </span>
                      {p.topChannel && (
                        <span
                          className={cn(
                            "shrink-0 font-mono text-[11px] tabular-nums",
                            SEVERITY_TEXT[severityFor(p.topChannel.probability) as Severity],
                          )}
                        >
                          {p.topChannel.channel} {p.topChannel.probability.toFixed(2)}
                        </span>
                      )}
                      <RelativeTime
                        iso={p.postedAt}
                        className="shrink-0 text-[11px] text-muted-foreground tabular-nums"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="gap-4 py-5">
          <CardHeader className="px-5 pb-0">
            <CardTitle className="text-base font-medium">Queue mix</CardTitle>
            <CardDescription>Pending split by routing decision.</CardDescription>
          </CardHeader>
          <CardContent className="px-5">
            <QueueMixBar quick={counts.quick} deep={counts.deep} escalation={counts.escalation} />
            <ul className="mt-4 space-y-2 text-sm">
              <QueueMixRow
                label="Quick"
                count={counts.quick}
                tone="emerald"
                onClick={() => onNavigate("queue")}
              />
              <QueueMixRow
                label="Deep"
                count={counts.deep}
                tone="amber"
                onClick={() => onNavigate("queue")}
              />
              <QueueMixRow
                label="Escalation"
                count={counts.escalation}
                tone="rose"
                onClick={() => onNavigate("queue")}
              />
              <QueueMixRow
                label="Decided"
                count={counts.decided}
                tone="muted"
                onClick={() => onNavigate("queue")}
              />
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card className="gap-4 py-5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-5 pb-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <Activity className="h-4 w-4" />
                Recent activity
              </CardTitle>
              <CardDescription>Last 8 audit entries from the runciter.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate("compliance")}>
              View all
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="px-5">
            {audit === null ? (
              <Skeleton className="h-40 w-full" />
            ) : audit.length === 0 ? (
              <EmptyRow
                icon={<Clock className="h-5 w-5" />}
                title="No activity yet"
                description="Waiting for the first event."
              />
            ) : (
              <ScrollArea className="max-h-[16rem]">
                <ul className="space-y-2.5">
                  {audit
                    .slice()
                    .reverse()
                    .slice(0, 8)
                    .map((e) => (
                      <li key={e.id} className="flex items-center gap-3 text-xs">
                        <span
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            KIND_DOT[e.kind] ?? "bg-muted-foreground",
                          )}
                        />
                        <span className="w-36 shrink-0 text-muted-foreground">
                          {KIND_LABEL[e.kind] ?? e.kind}
                        </span>
                        <span className="truncate font-mono text-muted-foreground">
                          {e.ref.type}:{e.ref.id.slice(0, 8)}
                        </span>
                      </li>
                    ))}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card className="gap-4 py-5">
          <CardHeader className="px-5 pb-0">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <GaugeCircle className="h-4 w-4" />
              Top channels firing
            </CardTitle>
            <CardDescription>Where the most signal is coming from.</CardDescription>
          </CardHeader>
          <CardContent className="px-5">
            {channelMix.length === 0 ? (
              <EmptyRow
                icon={<ScanSearch className="h-5 w-5" />}
                title="No signal yet"
                description="Nothing firing across pending review."
              />
            ) : (
              <ul className="space-y-2.5">
                {channelMix.map((c) => {
                  const sev = severityFor(c.max) as Severity;
                  return (
                    <li key={c.channel} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono">{c.channel}</span>
                        <span className={cn("tabular-nums", SEVERITY_TEXT[sev])}>
                          {c.count} · max {c.max.toFixed(2)}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            sev === "high"
                              ? "bg-rose-500/80"
                              : sev === "medium"
                                ? "bg-amber-500/80"
                                : "bg-emerald-500/80",
                          )}
                          style={{ width: `${Math.min(100, c.max * 100)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="gap-4 py-5">
          <CardHeader className="px-5 pb-0">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <Cpu className="h-4 w-4" />
              Pipeline at a glance
            </CardTitle>
            <CardDescription>
              How an event flows through the runciter for this instance.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-5">
            <PipelineSummary onNavigate={onNavigate} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function QueueMixBar({
  quick,
  deep,
  escalation,
}: {
  quick: number;
  deep: number;
  escalation: number;
}) {
  const total = quick + deep + escalation;
  if (total === 0) {
    return <div className="h-2 rounded-full bg-muted" />;
  }
  const q = (quick / total) * 100;
  const d = (deep / total) * 100;
  const e = (escalation / total) * 100;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-muted">
      <div className="bg-emerald-500/80" style={{ width: `${q}%` }} />
      <div className="bg-amber-500/85" style={{ width: `${d}%` }} />
      <div className="bg-rose-500/90" style={{ width: `${e}%` }} />
    </div>
  );
}

function QueueMixRow({
  label,
  count,
  tone,
  onClick,
}: {
  label: string;
  count: number;
  tone: "emerald" | "amber" | "rose" | "muted";
  onClick: () => void;
}) {
  const dot =
    tone === "emerald"
      ? "bg-emerald-500"
      : tone === "amber"
        ? "bg-amber-500"
        : tone === "rose"
          ? "bg-rose-500"
          : "bg-muted-foreground";
  return (
    <li>
      <button
        onClick={onClick}
        className="flex w-full items-center justify-between rounded-md px-2 py-1 text-sm hover:bg-muted/40 -mx-2"
      >
        <span className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", dot)} />
          {label}
        </span>
        <span className="tabular-nums text-muted-foreground">{count}</span>
      </button>
    </li>
  );
}

function PipelineSummary({ onNavigate }: { onNavigate: (s: Section) => void }) {
  const stages = [
    { key: "ingest", label: "Ingest", hint: "Gateway normalizes events" },
    { key: "dispatch", label: "Dispatch", hint: "Runciter fans out to inertials" },
    { key: "signal", label: "Signal", hint: "Aggregator merges channels" },
    { key: "policy", label: "Policy", hint: "Rules route to queue" },
    { key: "review", label: "Review", hint: "Human moderator decides" },
  ];
  return (
    <div className="space-y-4">
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-5">
        {stages.map((s, i) => (
          <li
            key={s.key}
            className="flex flex-col gap-1 rounded-md border border-border bg-muted/30 p-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <Badge variant="outline" className="text-[10px]">
                ok
              </Badge>
            </div>
            <div className="text-sm font-medium">{s.label}</div>
            <div className="text-[11px] text-muted-foreground">{s.hint}</div>
          </li>
        ))}
      </ol>
      <div className="flex items-center justify-between rounded-md border border-dashed border-border bg-muted/20 px-4 py-3 text-sm">
        <div>
          <div className="font-medium">Custom pipelines</div>
          <div className="text-xs text-muted-foreground">
            Build your own dispatch + policy flow from the Pipelines page.
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => onNavigate("pipelines")}>
          Open Pipelines
          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function EmptyRow({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-dashed border-border bg-muted/20 p-4">
      <span className="text-muted-foreground">{icon}</span>
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </div>
  );
}

interface AuditStats {
  eventsProcessed: number;
  queueRouted: number;
  cloudTouched: number;
  decisionsRecorded: number;
}

function computeAuditStats(entries: readonly AuditEntry[]): AuditStats {
  const out: AuditStats = {
    eventsProcessed: 0,
    queueRouted: 0,
    cloudTouched: 0,
    decisionsRecorded: 0,
  };
  for (const e of entries) {
    const p = e.payload as Record<string, unknown>;
    if (e.kind === "event-ingested") out.eventsProcessed += 1;
    if (e.kind === "queue-routed") out.queueRouted += 1;
    if (e.kind === "decision-recorded") out.decisionsRecorded += 1;
    if (e.kind === "signal-generated" && p["dataLeavesMachine"] === true) out.cloudTouched += 1;
  }
  return out;
}
