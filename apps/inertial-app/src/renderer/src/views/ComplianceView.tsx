import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuditEntry } from "@inertial/schemas";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Pill,
} from "@eval-kit/ui";
import { Activity, Lock, ScanSearch, Shield } from "lucide-react";
import {
  getShadowAgreement,
  getSkills,
  listAudit,
  verifyAudit,
  type AuditChainVerification,
  type SkillAgreement,
  type SkillsResponse,
} from "../lib/api.js";

const INSTANCE = "smoke.local";
const REFRESH_MS = 6_000;

export function ComplianceView() {
  const [skills, setSkills] = useState<SkillsResponse | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [chain, setChain] = useState<AuditChainVerification | null>(null);
  const [agreement, setAgreement] = useState<SkillAgreement[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, a, v, ag] = await Promise.all([
        getSkills(),
        listAudit(INSTANCE, { limit: 50 }),
        verifyAudit(INSTANCE),
        getShadowAgreement(INSTANCE),
      ]);
      setSkills(s);
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

  const stats = useMemo(() => computeStats(auditEntries), [auditEntries]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-light tracking-tight">Compliance</h2>
          <p className="text-xs text-[color:var(--muted-foreground)]">
            instance · <span className="font-mono">{INSTANCE}</span> · what ran on what, and proof.
          </p>
        </div>
        <button
          onClick={refresh}
          className="rounded-md border border-[color:var(--border)] px-3 py-1 text-xs uppercase tracking-widest text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
        >
          Refresh
        </button>
      </header>

      {error && (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error} — is the runciter running on :4001?
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={<Activity className="h-4 w-4" />}
          label="Events processed"
          value={stats.eventsProcessed.toLocaleString()}
          sublabel={`${stats.queueRouted} routed to queue`}
        />
        <StatTile
          icon={<Lock className="h-4 w-4" />}
          label="Events touching cloud"
          value={stats.cloudTouched.toString()}
          sublabel={
            stats.eventsProcessed === 0
              ? "no events yet"
              : `${((stats.cloudTouched / stats.eventsProcessed) * 100).toFixed(1)}% of total`
          }
          accent={stats.cloudTouched === 0 ? "good" : "warn"}
        />
        <StatTile
          icon={<Shield className="h-4 w-4" />}
          label="Audit chain"
          value={chain?.valid ? "valid" : chain ? "broken" : "—"}
          sublabel={chain ? `${chain.inspected} entries inspected` : "verifying…"}
          accent={chain?.valid ? "good" : "danger"}
        />
        <StatTile
          icon={<ScanSearch className="h-4 w-4" />}
          label="Decisions recorded"
          value={stats.decisionsRecorded.toString()}
          sublabel={`${stats.shadowPredictions} shadow predictions`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-light">
            Active skills
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!skills ? (
            <p className="text-xs text-[color:var(--muted-foreground)]">loading…</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[color:var(--muted-foreground)]">
                <tr className="border-b border-[color:var(--border)]">
                  <th className="py-2 text-left font-normal">Name</th>
                  <th className="py-2 text-left font-normal">Provider</th>
                  <th className="py-2 text-left font-normal">Execution</th>
                  <th className="py-2 text-left font-normal">Privacy</th>
                  <th className="py-2 text-right font-normal">Cost / call</th>
                  <th className="py-2 text-right font-normal">Mode</th>
                </tr>
              </thead>
              <tbody>
                {skills.skills.map((s) => {
                  const isShadow = skills.shadow.includes(s.name);
                  return (
                    <tr
                      key={s.name}
                      className="border-b border-[color:var(--border)]/60"
                    >
                      <td className="py-2 font-mono text-xs">{s.name}</td>
                      <td className="py-2 text-xs">{s.provider}</td>
                      <td className="py-2 text-xs">{s.executionModel}</td>
                      <td className="py-2">
                        {s.dataLeavesMachine ? (
                          <Pill dot="warn">leaves machine</Pill>
                        ) : (
                          <Pill dot="good">local-only</Pill>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums text-xs">
                        {s.costEstimateUsd === null
                          ? "—"
                          : s.costEstimateUsd === 0
                            ? "free"
                            : `$${s.costEstimateUsd.toFixed(4)}`}
                      </td>
                      <td className="py-2 text-right">
                        {isShadow ? (
                          <Badge variant="info">shadow</Badge>
                        ) : (
                          <Badge variant="default">production</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-light">
            Shadow agreement (per skill)
          </CardTitle>
          <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
            How often each shadow skill agreed with the reviewer's verdict. Every
            review is a free gold-set entry.
          </p>
        </CardHeader>
        <CardContent>
          {agreement.length === 0 ? (
            <EmptyState
              icon={<ScanSearch className="h-6 w-6" />}
              title="No shadow data yet"
              description="Add a shadow skill to your policy and commit a few reviewer decisions, then come back."
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[color:var(--muted-foreground)]">
                <tr className="border-b border-[color:var(--border)]">
                  <th className="py-2 text-left font-normal">Skill</th>
                  <th className="py-2 text-right font-normal">Pairs</th>
                  <th className="py-2 text-right font-normal">Agreement</th>
                  <th className="py-2 text-right font-normal">Missed</th>
                  <th className="py-2 text-right font-normal">Over-flagged</th>
                </tr>
              </thead>
              <tbody>
                {agreement.map((a) => (
                  <tr
                    key={a.skillName}
                    className="border-b border-[color:var(--border)]/60"
                  >
                    <td className="py-2 font-mono text-xs">{a.skillName}</td>
                    <td className="py-2 text-right tabular-nums">{a.pairs}</td>
                    <td className="py-2 text-right tabular-nums">
                      {a.pairs === 0 ? "—" : `${(a.agreement * 100).toFixed(1)}%`}
                    </td>
                    <td className="py-2 text-right tabular-nums text-rose-300">
                      {a.shadowMissed}
                    </td>
                    <td className="py-2 text-right tabular-nums text-amber-300">
                      {a.shadowOverflagged}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-light">
            Audit feed (latest {auditEntries.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {auditEntries.length === 0 ? (
            <p className="text-xs text-[color:var(--muted-foreground)]">
              no entries yet
            </p>
          ) : (
            <ul className="flex flex-col gap-2 text-xs font-mono">
              {auditEntries
                .slice()
                .reverse()
                .slice(0, 30)
                .map((e) => (
                  <li
                    key={e.id}
                    className="grid grid-cols-[3rem_8rem_12rem_1fr] gap-3 border-b border-[color:var(--border)]/40 pb-1"
                  >
                    <span className="text-[color:var(--muted-foreground)]">
                      #{e.sequence}
                    </span>
                    <span className="text-[color:var(--accent-violet)]">
                      {e.kind}
                    </span>
                    <span className="text-[color:var(--muted-foreground)]">
                      {e.ref.type}:{e.ref.id.slice(0, 8)}
                    </span>
                    <span className="truncate text-[color:var(--muted-foreground)]">
                      {summarizePayload(e)}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
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

interface StatTileProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel?: string;
  accent?: "good" | "warn" | "danger";
}

function StatTile({ icon, label, value, sublabel, accent }: StatTileProps) {
  const accentColor =
    accent === "good"
      ? "text-emerald-300"
      : accent === "warn"
        ? "text-amber-300"
        : accent === "danger"
          ? "text-rose-300"
          : "text-[color:var(--foreground)]";
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[color:var(--muted-foreground)]">
          {icon}
          {label}
        </div>
        <div className={`text-2xl font-light ${accentColor}`}>{value}</div>
        {sublabel && (
          <div className="text-xs text-[color:var(--muted-foreground)]">
            {sublabel}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
