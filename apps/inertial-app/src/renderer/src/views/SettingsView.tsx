import { Database, KeyRound, Monitor, Moon, Sun, ToggleRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card.js";
import { Switch } from "../components/ui/switch.js";
import { Button } from "../components/ui/button.js";
import { Badge } from "../components/ui/badge.js";
import { PageHeader } from "../components/PageHeader.js";
import { useTheme, type Theme } from "../lib/theme.js";
import { useDemoMode } from "../lib/demo-mode.js";
import { cn } from "../lib/utils.js";

const THEME_OPTIONS: ReadonlyArray<{ value: Theme; label: string; Icon: typeof Sun }> = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

export function SettingsView() {
  const { theme, setTheme } = useTheme();
  const { demo, setDemo } = useDemoMode();

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <PageHeader
        title="Settings"
        description="Workspace preferences. Stored locally on this machine."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Appearance</CardTitle>
          <CardDescription>Choose how the dashboard looks. System matches your OS.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {THEME_OPTIONS.map(({ value, label, Icon }) => {
              const active = theme === value;
              return (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border p-4 transition-all",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "border-foreground/40 bg-muted/50 ring-1 ring-foreground/10"
                      : "border-border hover:border-foreground/20 hover:bg-muted/30",
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.5} />
                  <span className="text-sm">{label}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <ToggleRight className="h-4 w-4" />
            Demo mode
          </CardTitle>
          <CardDescription>
            Show curated example posts instead of live runciter data. Useful for screenshots, demos, and onboarding.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-4">
            <div>
              <div className="text-sm font-medium">
                {demo ? "Demo data is active" : "Live runciter data"}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {demo
                  ? "The queue is rendering 15 curated cases from lib/demo-data.ts."
                  : "The dashboard is hitting http://localhost:4001."}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {demo && <Badge variant="outline">Demo</Badge>}
              <Switch checked={demo} onCheckedChange={setDemo} aria-label="Toggle demo mode" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Database className="h-4 w-4" />
            Instance
          </CardTitle>
          <CardDescription>
            Which moderation instance this dashboard talks to. Multi-instance picker arrives in a later release.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-4">
            <div>
              <div className="font-mono text-sm">smoke.local</div>
              <div className="mt-0.5 text-xs text-muted-foreground">Default development instance</div>
            </div>
            <Badge variant="secondary">Active</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <KeyRound className="h-4 w-4" />
            API keys
          </CardTitle>
          <CardDescription>
            Anthropic and other provider keys live in the runciter's environment, not the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
            <div className="font-medium text-amber-700 dark:text-amber-300">Rotate quarterly</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Edit <code className="font-mono">.env</code> in the runciter package and restart with <code className="font-mono">pnpm demo</code>.
            </p>
            <Button variant="outline" size="sm" className="mt-3" disabled>
              Open .env (coming soon)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
