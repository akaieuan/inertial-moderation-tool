import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Lock,
  RefreshCw,
  ScanSearch,
  Shield,
  ShieldCheck,
} from "lucide-react";
import type { AuditEntry } from "@inertial/schemas";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card.js";
import { Button } from "../components/ui/button.js";
import { ScrollArea } from "../components/ui/scroll-area.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { PageHeader } from "../components/PageHeader.js";
import { Stat } from "../components/Stat.js";
import {
  getShadowAgreement,
  listAudit,
  verifyAudit,
  type AuditChainVerification,
  type SkillAgreement,
} from "../lib/api.js";
import { cn } from "../lib/utils.js";

const INSTANCE = "smoke.local";
const REFRESH_MS = 6_000;

const KIND_COLORS: Record<string, string> = {
  "event-ingested": "text-sky-700 dark:text-sky-300",
  "signal-generated": "text-violet-700 dark:text-violet-300",
  "queue-routed": "text-amber-700 dark:text-amber-300",
  "decision-recorded": "text-emerald-700 dark:text-emerald-300",
  "policy-evaluated": "text-cyan-700 dark:text-cyan-300",
  "action-dispatched": "text-fuchsia-700 dark:text-fuchsia-300",
  "consensus-reached": "text-emerald-700 dark:text-emerald-300",
  "review-started": "text-muted-foreground",
  "policy-updated": "text-blue-700 dark:text-blue-300",
  "reviewer-overridden": "text-rose-700 dark:text-rose-300",
};

interface Props {
  onNavigate?: (section: "skills") => void;
}

export function ComplianceView({ onNavigate }: Props) {
  const [auditEntries, setAuditEntries] = useState<AuditEntry[] | null>(null);
  const [chain, setChain] = useState<AuditChainVerification | null>(null);
  const [agreement, setAgreement] = useState<SkillAgreement[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [a, v, ag] = await Promise.all([
        listAudit(INSTANCE, { limit: 50 }),
        verifyAudit(INSTANCE),
        getShadowAgreement(INSTANCE),
      ]);
      setAuditEntries(a);
      setChain(v);
      setAgreement(ag);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const handle = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(handle);
  }, [refresh]);

  const stats = useMemo(() => computeStats(auditEntries ?? []), [auditEntries]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Compliance"
        description={`What ran on what, and proof. ${INSTANCE}`}
        actions={
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
          </Button>
        }
      />

      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Events processed"
          value={stats.eventsProcessed.toLocaleString()}
          hint={`${stats.queueRouted} routed to queue`}
          icon={<Activity className="h-3 w-3" />}
        />
        <Stat
          label="Touched cloud"
          value={stats.cloudTouched.toString()}
          hint={
            stats.eventsProcessed === 0
              ? "no events yet"
              : `${((stats.cloudTouched / stats.eventsProcessed) * 100).toFixed(1)}% of total`
          }
          icon={<Lock className="h-3 w-3" />}
          tone={stats.cloudTouched === 0 ? "good" : "warn"}
        />
        <Stat
          label="Audit chain"
          value={chain?.valid ? "valid" : chain ? "broken" : "—"}
          hint={chain ? `${chain.inspected} entries inspected` : "verifying…"}
          icon={<Shield className="h-3 w-3" />}
          tone={chain?.valid ? "good" : chain ? "danger" : "default"}
        />
        <Stat
          label="Decisions recorded"
          value={stats.decisionsRecorded.toString()}
          hint={`${stats.shadowPredictions} shadow predictions`}
          icon={<ScanSearch className="h-3 w-3" />}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base font-medium">Skills overview</CardTitle>
            <CardDescription>
              Active classifiers and tools live on a dedicated page.
            </CardDescription>
          </div>
          {onNavigate && (
            <Button variant="outline" size="sm" onClick={() => onNavigate("skills")}>
              Manage skills
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          )}
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <ShieldCheck className="h-4 w-4" />
            Shadow agreement (per skill)
          </CardTitle>
          <CardDescription>
            How often each shadow skill agreed with the reviewer's verdict. Every review is a free gold-set entry.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {agreement.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border p-8 text-center">
              <ScanSearch className="h-6 w-6 text-muted-foreground" />
              <div className="text-sm font-medium">No shadow data yet</div>
              <div className="text-xs text-muted-foreground">
                Add a shadow skill to your policy and commit a few reviewer decisions.
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-normal">Skill</th>
                    <th className="px-4 py-2 text-right font-normal">Pairs</th>
                    <th className="px-4 py-2 text-right font-normal">Agreement</th>
                    <th className="px-4 py-2 text-right font-normal">Missed</th>
                    <th className="px-4 py-2 text-right font-normal">Over-flagged</th>
                  </tr>
                </thead>
                <tbody>
                  {agreement.map((a) => (
                    <tr key={a.skillName} className="border-t border-border">
                      <td className="px-4 py-2 font-mono text-xs">{a.skillName}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{a.pairs}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {a.pairs === 0 ? "—" : `${(a.agreement * 100).toFixed(1)}%`}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-rose-700 dark:text-rose-300">
                        {a.shadowMissed}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-amber-700 dark:text-amber-300">
                        {a.shadowOverflagged}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Audit feed{auditEntries && ` (latest ${Math.min(50, auditEntries.length)})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {auditEntries === null ? (
            <Skeleton className="h-48 w-full" />
          ) : auditEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries yet.</p>
          ) : (
            <ScrollArea className="h-[28rem]">
              <ul className="divide-y divide-border">
                {auditEntries
                  .slice()
                  .reverse()
                  .slice(0, 50)
                  .map((e) => (
                    <li
                      key={e.id}
                      className="grid grid-cols-[3rem_10rem_1fr] items-center gap-3 py-2 font-mono text-xs"
                    >
                      <span className="tabular-nums text-muted-foreground">#{e.sequence}</span>
                      <span className={cn(KIND_COLORS[e.kind] ?? "text-foreground")}>
                        {e.kind}
                      </span>
                      <span className="truncate text-muted-foreground">
                        {e.ref.type}:{e.ref.id.slice(0, 8)} · {summarizePayload(e)}
                      </span>
                    </li>
                  ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface ComplianceStats {
  eventsProcessed: number;
  cloudTouched: number;
  queueRouted: number;
  decisionsRecorded: number;
  shadowPredictions: number;
}

function computeStats(entries: readonly AuditEntry[]): ComplianceStats {
  const stats: ComplianceStats = {
    eventsProcessed: 0,
    cloudTouched: 0,
    queueRouted: 0,
    decisionsRecorded: 0,
    shadowPredictions: 0,
  };
  for (const e of entries) {
    const p = e.payload as Record<string, unknown>;
    if (e.kind === "event-ingested") stats.eventsProcessed += 1;
    if (e.kind === "queue-routed") stats.queueRouted += 1;
    if (e.kind === "decision-recorded") stats.decisionsRecorded += 1;
    if (e.kind === "signal-generated") {
      if (p["mode"] === "shadow") stats.shadowPredictions += 1;
      if (p["dataLeavesMachine"] === true) stats.cloudTouched += 1;
    }
  }
  return stats;
}

function summarizePayload(e: AuditEntry): string {
  const p = e.payload as Record<string, unknown>;
  const skill = p["skill"];
  const mode = p["mode"];
  const action = p["action"] as { kind?: string } | undefined;
  const queue = p["queue"];
  const verdict = p["verdict"];
  const channels = p["channels"] as unknown[] | undefined;
  if (mode === "shadow" && skill) return `mode=shadow skill=${skill}`;
  if (skill) return `skill=${skill}`;
  if (action?.kind) return `action=${action.kind}`;
  if (queue) return `queue=${queue}`;
  if (verdict) return `verdict=${verdict}`;
  if (channels) return `channels=[${channels.join(", ")}]`;
  return "";
}

