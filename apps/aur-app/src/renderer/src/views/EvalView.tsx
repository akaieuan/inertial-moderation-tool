import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Pill,
  ProgressRing,
  Sparkline,
  StatCard,
} from "@eval-kit/ui";
import { Activity, BarChart3, ScanSearch, Sparkles, Target } from "lucide-react";

const SPARK_TEXT = [0.31, 0.34, 0.38, 0.42, 0.39, 0.44, 0.48, 0.51, 0.56, 0.6, 0.62, 0.66];
const SPARK_VISION = [0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05];
const SPARK_AGGREGATE = [0.18, 0.2, 0.22, 0.24, 0.22, 0.25, 0.27, 0.28, 0.31, 0.34, 0.34, 0.36];

const AGENT_BRIER = [
  { agent: "text-agent", brier: 0.118, ece: 0.041, runs: 824 },
  { agent: "vision-agent", brier: null, ece: null, runs: 0 },
  { agent: "video-agent", brier: null, ece: null, runs: 0 },
  { agent: "audio-agent", brier: null, ece: null, runs: 0 },
  { agent: "identity-agent", brier: 0.221, ece: 0.087, runs: 412 },
  { agent: "context-agent", brier: 0.198, ece: 0.073, runs: 412 },
];

export function EvalView() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h2 className="text-lg font-light tracking-tight">Eval cockpit</h2>
        <p className="text-xs text-[color:var(--muted-foreground)]">
          Calibration vs gold sets · Brier score &amp; ECE per agent · powered by @eval-kit/ui
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Events processed (7d)"
          value="12,438"
          sublabel="+18.4% wow"
          delta={{ value: 18.4, suffix: "%" }}
          sparkline={SPARK_AGGREGATE}
          sparklineMax={1}
        />
        <StatCard
          label="Avg agent latency"
          value="284 ms"
          sublabel="p95 612 ms"
          delta={{ value: -12, suffix: " ms" }}
        />
        <StatCard
          label="Calibration (Brier)"
          value="0.146"
          sublabel="text-agent · 824 runs"
          delta={{ value: -0.012 }}
          sparkline={SPARK_TEXT}
          sparklineMax={1}
        />
        <StatCard
          label="Reviewer agreement"
          value="91.2%"
          sublabel="signalFeedback.agreed"
          delta={{ value: 1.1, suffix: "%" }}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-light">
                <BarChart3 className="h-4 w-4" />
                Per-agent calibration
              </CardTitle>
              <Pill dot="muted">latest run</Pill>
            </div>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--border)] text-[color:var(--muted-foreground)]">
                  <th className="py-2 text-left font-normal">Agent</th>
                  <th className="py-2 text-right font-normal">Brier</th>
                  <th className="py-2 text-right font-normal">ECE</th>
                  <th className="py-2 text-right font-normal">Runs</th>
                  <th className="py-2 text-right font-normal">Trend</th>
                </tr>
              </thead>
              <tbody>
                {AGENT_BRIER.map((row) => (
                  <tr key={row.agent} className="border-b border-[color:var(--border)]/60">
                    <td className="py-2 font-mono text-xs">{row.agent}</td>
                    <td className="py-2 text-right tabular-nums">
                      {row.brier === null ? <Badge variant="outline">no data</Badge> : row.brier.toFixed(3)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-[color:var(--muted-foreground)]">
                      {row.ece === null ? "—" : row.ece.toFixed(3)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-[color:var(--muted-foreground)]">
                      {row.runs}
                    </td>
                    <td className="py-2 text-right">
                      {row.brier === null ? (
                        "—"
                      ) : (
                        <div className="flex justify-end">
                          <Sparkline values={row.agent === "text-agent" ? SPARK_TEXT : SPARK_VISION} width={64} height={20} />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-light">
              <Target className="h-4 w-4" />
              Gold-set coverage
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3 py-6">
            <ProgressRing value={0.43} size={120} strokeWidth={10} label="43%" showLabel />
            <p className="text-center text-xs text-[color:var(--muted-foreground)]">
              43 / 100 channels have gold-set entries.
              <br />
              Add more under <code className="font-mono">config/evals/</code>.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-light">
            <ScanSearch className="h-4 w-4" />
            Recent regressions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<Sparkles className="h-6 w-6" />}
            title="No regressions detected"
            description="Compare two scored runs to surface step-level diffs. Wire @eval-kit/core's parseScoredRun to enable."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-light">
            <Activity className="h-4 w-4" />
            Live signal channels
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Pill dot="good">spam-link-presence</Pill>
            <Pill dot="warn">nsfw</Pill>
            <Pill dot="danger">minor-adjacent</Pill>
            <Pill dot="info">brigading</Pill>
            <Pill dot="muted">pii-redaction</Pill>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
