import {
  ArrowRight,
  Cpu,
  GitBranch,
  PencilLine,
  Plus,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card.js";
import { Button } from "../components/ui/button.js";
import { PageHeader } from "../components/PageHeader.js";
import { cn } from "../lib/utils.js";

interface Props {
  onNavigate?: (s: "skills" | "compliance") => void;
}

type RouteKind = "quick" | "deep" | "escalation";

interface Preset {
  name: string;
  description: string;
  skills: string[];
  routes: Array<{ name: string; kind: RouteKind }>;
  status: "active" | "draft";
}

const PRESETS: Preset[] = [
  {
    name: "Standard text moderation",
    description: "Spam-link → toxicity (local) → ambiguous escalation to Claude.",
    skills: [
      "text-detect-spam-link",
      "text-classify-toxicity@local",
      "text-classify-toxicity@anthropic",
    ],
    routes: [
      { name: "queue.quick", kind: "quick" },
      { name: "queue.deep", kind: "deep" },
    ],
    status: "active",
  },
  {
    name: "Image safety (vision)",
    description: "Claude Vision for nsfw / minor-presence / weapons on every image post.",
    skills: ["image-classify@anthropic"],
    routes: [
      { name: "queue.deep", kind: "deep" },
      { name: "escalate.mandatory", kind: "escalation" },
    ],
    status: "active",
  },
  {
    name: "Brigading detector (preview)",
    description: "pgvector similarity + new-account heuristic to surface coordinated reports.",
    skills: ["context-agent"],
    routes: [{ name: "escalate.mandatory", kind: "escalation" }],
    status: "draft",
  },
];

const ROUTE_TONE: Record<RouteKind, string> = {
  quick: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  deep: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  escalation: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

const STATUS_TONE: Record<Preset["status"], string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  draft: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

export function PipelinesView({ onNavigate }: Props) {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Pipelines"
        description="Compose dispatch + policy flows. Pick which inertials run for which modalities, then route signals to queues."
        actions={
          <>
            <Button variant="outline" size="sm" disabled>
              <PencilLine className="mr-1.5 h-3.5 w-3.5" />
              Edit YAML
            </Button>
            <Button size="sm" disabled>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New pipeline
            </Button>
          </>
        }
      />

      <section>
        <Card className="gap-4 py-5">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 px-5 pb-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <Workflow className="h-4 w-4" />
                Visual pipeline editor
              </CardTitle>
              <CardDescription>
                Drag inertials onto a canvas, wire signals to queues, attach policy rules.
                Until then, pipelines live in{" "}
                <code className="font-mono text-foreground/80">config/policies/*.yaml</code>.
              </CardDescription>
            </div>
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-2.5 w-2.5" />
              soon
            </span>
          </CardHeader>
          <CardContent className="px-5">
            <CanvasPreview />
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <FeatureRow
                icon={<Cpu className="h-3.5 w-3.5" strokeWidth={1.5} />}
                title="Skill picker"
                description="Choose classifiers, order, shadow/production split."
              />
              <FeatureRow
                icon={<GitBranch className="h-3.5 w-3.5" strokeWidth={1.5} />}
                title="Conditional routes"
                description="If toxicity > 0.7 ∧ confidence > 0.8 → queue.deep."
              />
              <FeatureRow
                icon={<Zap className="h-3.5 w-3.5" strokeWidth={1.5} />}
                title="Live preview"
                description="Replay recent events through the pipeline."
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Active configurations
            </div>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Read-only summaries of the YAML pipelines this instance has loaded.
            </p>
          </div>
          {onNavigate && (
            <Button variant="ghost" size="sm" onClick={() => onNavigate("skills")}>
              Browse skills
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {PRESETS.map((p) => (
            <Card key={p.name} className="gap-3 py-4">
              <CardHeader className="px-4 pb-0">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-[14px] font-medium leading-tight">
                    {p.name}
                  </CardTitle>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
                      STATUS_TONE[p.status],
                    )}
                  >
                    {p.status}
                  </span>
                </div>
                <CardDescription className="text-[12px] leading-relaxed">
                  {p.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 px-4">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Skills
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {p.skills.map((s) => (
                      <span
                        key={s}
                        className="rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[11px]"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Routes
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {p.routes.map((r) => (
                      <span
                        key={r.name}
                        className={cn(
                          "rounded-md border px-1.5 py-0.5 font-mono text-[11px]",
                          ROUTE_TONE[r.kind],
                        )}
                      >
                        {r.name}
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function FeatureRow({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-card/40 p-2.5">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <div className="text-[12px] font-medium leading-tight">{title}</div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

function CanvasPreview() {
  const nodes = [
    { label: "ingest", tone: "muted" },
    { label: "text-detect-spam-link", tone: "local" },
    { label: "text-classify-toxicity", tone: "local" },
    { label: "shadow:claude", tone: "remote" },
    { label: "policy", tone: "muted" },
    { label: "queue.deep", tone: "deep" },
  ] as const;

  return (
    <div
      className="relative flex items-center gap-3 overflow-x-auto rounded-lg border border-dashed border-border bg-card/30 p-4"
      style={{
        backgroundImage:
          "radial-gradient(circle, var(--border) 1px, transparent 1px)",
        backgroundSize: "12px 12px",
      }}
    >
      {nodes.map((n, i) => (
        <div key={n.label} className="flex shrink-0 items-center gap-3">
          <span
            className={cn(
              "rounded-md border bg-background px-2.5 py-1.5 font-mono text-[11px] shadow-sm",
              n.tone === "muted" && "border-border text-muted-foreground",
              n.tone === "local" && "border-emerald-500/30 text-foreground",
              n.tone === "remote" &&
                "border-[color:var(--accent-blue)]/30 text-[color:var(--accent-blue)]",
              n.tone === "deep" && "border-amber-500/30 text-amber-700 dark:text-amber-300",
            )}
          >
            {n.label}
          </span>
          {i < nodes.length - 1 && (
            <ArrowRight
              className="h-3 w-3 shrink-0 text-muted-foreground/60"
              strokeWidth={1.5}
            />
          )}
        </div>
      ))}
    </div>
  );
}
