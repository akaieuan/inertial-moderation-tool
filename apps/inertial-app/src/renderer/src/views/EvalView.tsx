import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  Loader2,
  PlayCircle,
  ScanSearch,
  Sparkles,
  Tag,
  Target,
} from "lucide-react";
import { toast } from "sonner";
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
import { PageHeader } from "../components/PageHeader.js";
import { Stat } from "../components/Stat.js";
import {
  getEvalRun,
  getLatestEvalRun,
  getTagCatalog,
  getTagFrequencies,
  listEvalRuns,
  startEvalRun,
  type EvalRun,
  type TagCatalogEntry,
  type TagFrequencyRow,
} from "../lib/api.js";
import { cn } from "../lib/utils.js";

const INSTANCE = "default";
const POLL_MS = 750;
const POLL_BACKOFF_AFTER = 8;
const POLL_BACKOFF_MS = 2_000;
const POLL_TIMEOUT_MS = 90_000;

interface AggregatedSkillRow {
  skillName: string;
  brierMean: number;
  eceMean: number;
  agreementMean: number;
  samplesTotal: number;
  channels: number;
}

export function EvalView() {
  const [latest, setLatest] = useState<EvalRun | null | "loading">("loading");
  const [history, setHistory] = useState<EvalRun[] | "loading">("loading");
  const [tagCatalog, setTagCatalog] = useState<TagCatalogEntry[] | "loading">("loading");
  const [tagStats, setTagStats] = useState<{ frequencies: TagFrequencyRow[]; total: number } | "loading">("loading");
  const [running, setRunning] = useState<{ runId: string; progressLabel: string } | null>(null);
  const stopPollRef = useRef<{ stop: boolean }>({ stop: false });

  useEffect(() => {
    stopPollRef.current = { stop: false };
    void Promise.all([
      getLatestEvalRun(INSTANCE).catch(() => null).then(setLatest),
      listEvalRuns(INSTANCE).catch(() => []).then(setHistory),
      getTagCatalog().catch(() => []).then(setTagCatalog),
      getTagFrequencies(INSTANCE)
        .catch(() => ({ frequencies: [], total: 0 }))
        .then(setTagStats),
    ]);
    return () => {
      stopPollRef.current.stop = true;
    };
  }, []);

  // Aggregate per-(skill, channel) calibration into one row per skill for the
  // primary table; the channel breakdown shows on hover.
  const aggregated = useMemo<AggregatedSkillRow[]>(() => {
    if (latest === "loading" || latest === null) return [];
    const groups = new Map<string, AggregatedSkillRow>();
    for (const c of latest.skillCalibrations) {
      const existing = groups.get(c.skillName);
      if (existing) {
        const n = existing.channels + 1;
        existing.brierMean = (existing.brierMean * existing.channels + c.brierScore) / n;
        existing.eceMean = (existing.eceMean * existing.channels + c.ece) / n;
        existing.agreementMean = (existing.agreementMean * existing.channels + c.agreement) / n;
        existing.samplesTotal += c.samples;
        existing.channels = n;
      } else {
        groups.set(c.skillName, {
          skillName: c.skillName,
          brierMean: c.brierScore,
          eceMean: c.ece,
          agreementMean: c.agreement,
          samplesTotal: c.samples,
          channels: 1,
        });
      }
    }
    return Array.from(groups.values()).sort((a, b) => a.brierMean - b.brierMean);
  }, [latest]);

  const headlineStat = useMemo(() => {
    if (latest === "loading" || latest === null) {
      return { brier: null as number | null, agreement: null as number | null };
    }
    const cals = latest.skillCalibrations;
    if (cals.length === 0) return { brier: null, agreement: null };
    const brier = cals.reduce((acc, c) => acc + c.brierScore, 0) / cals.length;
    const agreement = cals.reduce((acc, c) => acc + c.agreement, 0) / cals.length;
    return { brier, agreement };
  }, [latest]);

  const tagCoverage = useMemo(() => {
    if (tagStats === "loading" || tagCatalog === "loading") {
      return { covered: 0, total: 0 };
    }
    const used = new Set(tagStats.frequencies.map((f) => f.tagId));
    return { covered: used.size, total: tagCatalog.length };
  }, [tagStats, tagCatalog]);

  const handleRunEval = async () => {
    if (running) return;
    try {
      const { runId } = await startEvalRun({ instanceId: INSTANCE, triggeredBy: "dashboard" });
      setRunning({ runId, progressLabel: "starting…" });
      await pollUntilDone(runId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setRunning(null);
    }
  };

  const pollUntilDone = async (runId: string) => {
    const start = Date.now();
    let polls = 0;
    while (!stopPollRef.current.stop) {
      polls += 1;
      const interval = polls > POLL_BACKOFF_AFTER ? POLL_BACKOFF_MS : POLL_MS;
      await new Promise((r) => setTimeout(r, interval));
      const run = await getEvalRun(runId).catch(() => null);
      if (!run) {
        setRunning((prev) =>
          prev ? { ...prev, progressLabel: "waiting on runciter…" } : prev,
        );
        continue;
      }
      if (run.status === "completed") {
        setLatest(run);
        // Refresh the history table too — the new run goes on top.
        listEvalRuns(INSTANCE).catch(() => []).then(setHistory);
        toast.success(
          `Eval complete · ${run.skillCalibrations.length} (skill, channel) row(s)`,
        );
        setRunning(null);
        return;
      }
      if (run.status === "failed") {
        toast.error("Eval run failed — check runciter logs");
        setRunning(null);
        return;
      }
      setRunning({ runId, progressLabel: "running…" });
      if (Date.now() - start > POLL_TIMEOUT_MS) {
        toast.error("Eval run timed out — still running on the runciter");
        setRunning(null);
        return;
      }
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Insights"
        description="Calibration + reviewer-tagged corpus per inertial. Run the gold set against the live skill registry to refresh."
        actions={
          <Button size="sm" onClick={handleRunEval} disabled={!!running}>
            {running ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {running.progressLabel}
              </>
            ) : (
              <>
                <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
                Run eval
              </>
            )}
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Latest run"
          value={
            latest === "loading"
              ? "—"
              : latest === null
                ? "no runs yet"
                : new Date(latest.startedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
          }
          hint={latest && latest !== "loading" ? `${latest.goldSetSize} gold events` : undefined}
          icon={<Activity className="h-3 w-3" />}
        />
        <Stat
          label="Mean Brier"
          value={headlineStat.brier === null ? "—" : headlineStat.brier.toFixed(3)}
          hint={
            latest === "loading" || latest === null
              ? undefined
              : `across ${latest.skillCalibrations.length} (skill, channel) rows`
          }
          icon={<Target className="h-3 w-3" />}
          tone={
            headlineStat.brier === null
              ? "default"
              : headlineStat.brier < 0.1
                ? "good"
                : headlineStat.brier < 0.2
                  ? "warn"
                  : "danger"
          }
        />
        <Stat
          label="Mean agreement"
          value={
            headlineStat.agreement === null
              ? "—"
              : `${(headlineStat.agreement * 100).toFixed(1)}%`
          }
          hint="threshold ≥ 0.5"
          icon={<Sparkles className="h-3 w-3" />}
          tone={headlineStat.agreement === null ? "default" : "good"}
        />
        <Stat
          label="Tag corpus"
          value={
            tagStats === "loading" ? "—" : (tagStats.total ?? 0).toLocaleString()
          }
          hint={
            tagStats === "loading"
              ? undefined
              : `${tagCoverage.covered}/${tagCoverage.total} catalog entries used`
          }
          icon={<Tag className="h-3 w-3" />}
          tone="info"
        />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="gap-4 py-5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-5 pb-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <BarChart3 className="h-4 w-4" />
                Per-skill calibration
              </CardTitle>
              <CardDescription>
                Brier + ECE + agreement averaged across emitted channels for the latest run.
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              {latest === "loading" || latest === null ? "—" : "latest"}
            </Badge>
          </CardHeader>
          <CardContent className="px-5">
            {latest === "loading" ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : latest === null ? (
              <EmptyState
                title="No eval runs yet"
                hint="Click 'Run eval' to score the live skill registry against the gold set."
              />
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Skill</th>
                    <th className="pb-2 text-right font-medium">Brier</th>
                    <th className="pb-2 text-right font-medium">ECE</th>
                    <th className="pb-2 text-right font-medium">Agreement</th>
                    <th className="pb-2 text-right font-medium">Samples</th>
                    <th className="pb-2 pr-1 text-right font-medium">Channels</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregated.map((row) => (
                    <tr key={row.skillName} className="border-t border-border/60 first:border-t-0">
                      <td className="py-2.5 font-mono text-xs">{row.skillName}</td>
                      <td className="py-2.5 text-right tabular-nums">{row.brierMean.toFixed(3)}</td>
                      <td className="py-2.5 text-right tabular-nums text-muted-foreground">{row.eceMean.toFixed(3)}</td>
                      <td className="py-2.5 text-right tabular-nums text-muted-foreground">{(row.agreementMean * 100).toFixed(0)}%</td>
                      <td className="py-2.5 text-right tabular-nums text-muted-foreground">{row.samplesTotal}</td>
                      <td className="py-2.5 pr-1 text-right tabular-nums text-muted-foreground">{row.channels}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card className="gap-4 py-5">
          <CardHeader className="px-5 pb-0">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <Tag className="h-4 w-4" />
              Tag corpus
            </CardTitle>
            <CardDescription>
              Top reviewer-applied tags across this instance. Grows on every commit.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-5">
            {tagStats === "loading" || tagCatalog === "loading" ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : tagStats.total === 0 ? (
              <EmptyState
                title="No reviewer tags yet"
                hint="Open a queue item, click 'Add tag', and the corpus starts here."
              />
            ) : (
              <TagFrequencyList
                frequencies={tagStats.frequencies.slice(0, 8)}
                catalog={tagCatalog}
                total={tagStats.total}
              />
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="gap-4 py-5">
        <CardHeader className="px-5 pb-0">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <ScanSearch className="h-4 w-4" />
            Eval runs history
          </CardTitle>
          <CardDescription>Recent runs against this instance. Older first.</CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          {history === "loading" ? (
            <Skeleton className="h-24 w-full" />
          ) : history.length === 0 ? (
            <EmptyState title="No history" hint="Eval runs will appear here once you run one." />
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="pb-2 text-left font-medium">When</th>
                  <th className="pb-2 text-left font-medium">Version</th>
                  <th className="pb-2 text-right font-medium">Events</th>
                  <th className="pb-2 text-right font-medium">Mean Brier</th>
                  <th className="pb-2 text-right font-medium">Latency</th>
                  <th className="pb-2 pr-1 text-right font-medium">Triggered by</th>
                </tr>
              </thead>
              <tbody>
                {history.map((run) => {
                  const meanBrier =
                    run.skillCalibrations.length === 0
                      ? null
                      : run.skillCalibrations.reduce((acc, c) => acc + c.brierScore, 0) /
                        run.skillCalibrations.length;
                  return (
                    <tr key={run.id} className="border-t border-border/60 first:border-t-0">
                      <td className="py-2.5 text-xs text-muted-foreground">
                        {new Date(run.startedAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-2.5 font-mono text-xs">{run.goldSetVersion}</td>
                      <td className="py-2.5 text-right tabular-nums text-muted-foreground">{run.goldSetSize}</td>
                      <td className="py-2.5 text-right tabular-nums">
                        {meanBrier === null ? "—" : meanBrier.toFixed(3)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                        {run.meanLatencyMs ? `${run.meanLatencyMs}ms` : "—"}
                      </td>
                      <td className="py-2.5 pr-1 text-right text-muted-foreground">
                        {run.triggeredBy ?? "system"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TagFrequencyList({
  frequencies,
  catalog,
  total,
}: {
  frequencies: TagFrequencyRow[];
  catalog: TagCatalogEntry[];
  total: number;
}) {
  const max = Math.max(...frequencies.map((f) => f.count), 1);
  const byTagId = new Map(catalog.map((e) => [e.tagId, e]));
  return (
    <ul className="flex flex-col gap-2">
      {frequencies.map((f) => {
        const entry = byTagId.get(f.tagId);
        const pct = (f.count / max) * 100;
        const sharePct = ((f.count / total) * 100).toFixed(1);
        return (
          <li key={f.tagId} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-[12px]">
              <span className="truncate font-mono">{entry?.displayName ?? f.tagId}</span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {f.count} <span className="text-muted-foreground/60">({sharePct}%)</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full",
                  entry?.severity === "danger" && "bg-rose-500/80",
                  entry?.severity === "warn" && "bg-amber-500/80",
                  entry?.severity === "info" && "bg-sky-500/80",
                  (!entry || entry.severity === "neutral") && "bg-muted-foreground/60",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-dashed border-border bg-muted/20 p-4">
      <span className="text-muted-foreground">
        <Sparkles className="h-5 w-5" />
      </span>
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
    </div>
  );
}
