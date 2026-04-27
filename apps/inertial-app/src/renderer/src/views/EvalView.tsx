import { useMemo } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Download,
  ScanSearch,
  Sparkles,
  Target,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card.js";
import { Button } from "../components/ui/button.js";
import { Badge } from "../components/ui/badge.js";
import { PageHeader } from "../components/PageHeader.js";
import { Stat } from "../components/Stat.js";
import { cn } from "../lib/utils.js";

const SPARK_TEXT = [0.31, 0.34, 0.38, 0.42, 0.39, 0.44, 0.48, 0.51, 0.56, 0.6, 0.62, 0.66];
const SPARK_AGGREGATE = [0.18, 0.2, 0.22, 0.24, 0.22, 0.25, 0.27, 0.28, 0.31, 0.34, 0.34, 0.36];

interface AgentRow {
  agent: string;
  brier: number | null;
  ece: number | null;
  runs: number;
  trend?: number[];
}

const AGENT_BRIER: AgentRow[] = [
  { agent: "text-agent", brier: 0.118, ece: 0.041, runs: 824, trend: SPARK_TEXT },
  { agent: "vision-agent", brier: null, ece: null, runs: 0 },
  { agent: "video-agent", brier: null, ece: null, runs: 0 },
  { agent: "audio-agent", brier: null, ece: null, runs: 0 },
  {
    agent: "identity-agent",
    brier: 0.221,
    ece: 0.087,
    runs: 412,
    trend: [0.27, 0.26, 0.24, 0.25, 0.24, 0.23, 0.23, 0.22, 0.22, 0.22, 0.22, 0.221],
  },
  {
    agent: "context-agent",
    brier: 0.198,
    ece: 0.073,
    runs: 412,
    trend: [0.24, 0.23, 0.22, 0.22, 0.21, 0.21, 0.2, 0.2, 0.2, 0.2, 0.2, 0.198],
  },
];

const CHANNELS: Array<{ name: string; tone: "good" | "warn" | "danger" | "info" | "muted" }> = [
  { name: "spam-link-presence", tone: "good" },
  { name: "nsfw", tone: "warn" },
  { name: "minor-adjacent", tone: "danger" },
  { name: "brigading", tone: "info" },
  { name: "pii-redaction", tone: "muted" },
];

const CHANNEL_TONE: Record<string, string> = {
  good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  danger: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  muted: "border-border bg-muted/30 text-muted-foreground",
};

export function EvalView() {
  const goldCoverage = 0.43;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Insights"
        description="Calibration, agreement, and drift across inertials over the last 7 days."
        actions={
          <Button size="sm" variant="outline">
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export run
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Events processed (7d)"
          value="12,438"
          hint="+18.4% wow"
          icon={<Activity className="h-3 w-3" />}
          delta={{ value: 18.4, suffix: "%" }}
          tone="info"
        />
        <Stat
          label="Avg agent latency"
          value="284 ms"
          hint="p95 612 ms"
          icon={<BarChart3 className="h-3 w-3" />}
          delta={{ value: -12, suffix: " ms" }}
          tone="good"
        />
        <Stat
          label="Calibration (Brier)"
          value="0.146"
          hint="text-agent · 824 runs"
          icon={<Target className="h-3 w-3" />}
          delta={{ value: -0.012 }}
          tone="good"
        />
        <Stat
          label="Reviewer agreement"
          value="91.2%"
          hint="signalFeedback.agreed"
          icon={<Sparkles className="h-3 w-3" />}
          delta={{ value: 1.1, suffix: "%" }}
          tone="good"
        />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="gap-4 py-5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-5 pb-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <BarChart3 className="h-4 w-4" />
                Per-agent calibration
              </CardTitle>
              <CardDescription>Brier + ECE per inertial · latest run.</CardDescription>
            </div>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              latest
            </Badge>
          </CardHeader>
          <CardContent className="px-5">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Agent</th>
                  <th className="pb-2 text-right font-medium">Brier</th>
                  <th className="pb-2 text-right font-medium">ECE</th>
                  <th className="pb-2 text-right font-medium">Runs</th>
                  <th className="pb-2 pr-1 text-right font-medium">Trend</th>
                </tr>
              </thead>
              <tbody>
                {AGENT_BRIER.map((row) => (
                  <tr
                    key={row.agent}
                    className="border-t border-border/60 first:border-t-0"
                  >
                    <td className="py-2.5 font-mono text-xs">{row.agent}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      {row.brier === null ? (
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                          no data
                        </span>
                      ) : (
                        row.brier.toFixed(3)
                      )}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                      {row.ece === null ? "—" : row.ece.toFixed(3)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                      {row.runs || "—"}
                    </td>
                    <td className="py-2.5 pr-1 text-right">
                      {row.trend ? (
                        <div className="ml-auto inline-block">
                          <BarSparkline values={row.trend} />
                        </div>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="gap-4 py-5">
          <CardHeader className="px-5 pb-0">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <Target className="h-4 w-4" />
              Gold-set coverage
            </CardTitle>
            <CardDescription>Channels with eval gold sets.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3 px-5 py-2">
            <CoverageRing value={goldCoverage} />
            <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
              43 / 100 channels have gold-set entries. Add more under{" "}
              <code className="font-mono text-foreground/80">config/evals/</code>.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="gap-4 py-5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-5 pb-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <ScanSearch className="h-4 w-4" />
                Recent regressions
              </CardTitle>
              <CardDescription>
                Step-level diffs across two scored runs.
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" disabled>
              Compare
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="px-5">
            <div className="flex items-center gap-3 rounded-md border border-dashed border-border bg-muted/20 p-4">
              <span className="text-muted-foreground">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <div className="text-sm font-medium">No regressions detected</div>
                <div className="text-xs text-muted-foreground">
                  Wire <span className="font-mono">@eval-kit/core</span>'s parseScoredRun to enable.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="gap-4 py-5">
          <CardHeader className="px-5 pb-0">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <Activity className="h-4 w-4" />
              Live signal channels
            </CardTitle>
            <CardDescription>Channels currently emitting.</CardDescription>
          </CardHeader>
          <CardContent className="px-5">
            <ul className="flex flex-wrap gap-1.5">
              {CHANNELS.map((c) => (
                <li key={c.name}>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11px]",
                      CHANNEL_TONE[c.tone],
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        c.tone === "good" && "bg-emerald-500",
                        c.tone === "warn" && "bg-amber-500",
                        c.tone === "danger" && "bg-rose-500",
                        c.tone === "info" && "bg-sky-500",
                        c.tone === "muted" && "bg-muted-foreground/50",
                      )}
                    />
                    {c.name}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function BarSparkline({ values }: { values: number[] }) {
  const max = useMemo(() => Math.max(...values, 0.01), [values]);
  return (
    <div className="flex h-4 items-end gap-[2px]">
      {values.map((v, i) => (
        <span
          key={i}
          className="w-[3px] rounded-sm bg-foreground/40"
          style={{ height: `${Math.max(10, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function CoverageRing({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="relative h-[120px] w-[120px]">
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(var(--accent-emerald) ${pct}%, var(--border) ${pct}% 100%)`,
        }}
      />
      <div className="absolute inset-[10px] flex items-center justify-center rounded-full bg-card">
        <div className="text-center">
          <div className="text-2xl font-light tabular-nums leading-none">{pct}%</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            covered
          </div>
        </div>
      </div>
    </div>
  );
}
