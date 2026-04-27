import { useEffect, useState } from "react";
import {
  Home,
  LayoutGrid,
  LineChart,
  Monitor,
  Moon,
  Plug,
  Settings as SettingsIcon,
  Shield,
  Sun,
  ToggleLeft,
  Workflow,
} from "lucide-react";
import { SidebarNav, type NavItem } from "./SidebarNav.js";
import { SidebarHistory } from "./SidebarHistory.js";
import { Logo } from "./Logo.js";
import type { RightPanelKind } from "./RightPanel.js";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.js";
import { Switch } from "./ui/switch.js";
import { useDemoMode } from "../lib/demo-mode.js";
import { useTheme, type Theme } from "../lib/theme.js";
import { checkRunciterHealth } from "../lib/api.js";
import { cn } from "../lib/utils.js";
import { getDemoAvatar } from "../lib/demo-data.js";

export type Section =
  | "dashboard"
  | "queue"
  | "pipelines"
  | "skills"
  | "compliance"
  | "insights"
  | "settings";

interface SidebarProps {
  active: Section;
  onChange: (s: Section) => void;
  pendingCount: number;
  collapsed: boolean;
  onOpenPanel: (kind: RightPanelKind) => void;
}

const REVIEWER_HANDLE = "ieuan";
const REVIEWER_EMAIL = "ieuan@local";

export function Sidebar({
  active,
  onChange,
  pendingCount,
  collapsed,
  onOpenPanel,
}: SidebarProps) {
  const { demo, setDemo } = useDemoMode();
  const { theme, setTheme } = useTheme();
  const [healthy, setHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      const ok = await checkRunciterHealth();
      if (mounted) setHealthy(ok);
    };
    void tick();
    const handle = setInterval(tick, 8_000);
    return () => {
      mounted = false;
      clearInterval(handle);
    };
  }, []);

  const items: ReadonlyArray<NavItem<Section>> = [
    { key: "dashboard", label: "Dashboard", Icon: Home },
    { key: "queue", label: "Queue", Icon: LayoutGrid, badge: pendingCount },
    { key: "pipelines", label: "Pipelines", Icon: Workflow },
    { key: "skills", label: "Skills", Icon: Plug },
    { key: "compliance", label: "Compliance", Icon: Shield },
    { key: "insights", label: "Insights", Icon: LineChart },
  ];

  const themeOptions: ReadonlyArray<{ value: Theme; label: string; Icon: typeof Sun }> = [
    { value: "light", label: "Light", Icon: Sun },
    { value: "dark", label: "Dark", Icon: Moon },
    { value: "system", label: "System", Icon: Monitor },
  ];

  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-card/40 transition-[width] duration-200",
        collapsed ? "w-[52px]" : "w-[208px]",
      )}
    >
      <div className="flex-1 overflow-y-auto py-1">
        <SidebarNav<Section>
          items={items}
          active={active}
          onChange={onChange}
          collapsed={collapsed}
        />
        <SidebarHistory onOpenPanel={onOpenPanel} collapsed={collapsed} />
      </div>

      <div className="px-1.5 pb-2 pt-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                collapsed && "justify-center px-0.5",
              )}
            >
              <Logo size={20} className="shrink-0" />
              {!collapsed && (
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-[13px]">{REVIEWER_HANDLE}</div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        healthy === null
                          ? "bg-muted-foreground/40"
                          : healthy
                            ? "bg-emerald-500"
                            : "bg-rose-500",
                      )}
                    />
                    <span>
                      {healthy === null ? "checking…" : healthy ? "healthy" : "offline"}
                    </span>
                    {demo && <span className="ml-auto">DEMO</span>}
                  </div>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-60">
            <DropdownMenuLabel className="flex items-center gap-2 py-2">
              <Avatar className="h-7 w-7">
                <AvatarImage src={getDemoAvatar(REVIEWER_HANDLE)} alt={REVIEWER_HANDLE} />
                <AvatarFallback className="text-[10px]">IE</AvatarFallback>
              </Avatar>
              <div className="leading-tight">
                <div className="text-sm font-medium">{REVIEWER_HANDLE}</div>
                <div className="text-[11px] font-normal text-muted-foreground">
                  {REVIEWER_EMAIL}
                </div>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuLabel className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Theme
            </DropdownMenuLabel>
            <div className="grid grid-cols-3 gap-1 px-2 pb-2">
              {themeOptions.map(({ value, label, Icon }) => {
                const active = theme === value;
                return (
                  <button
                    key={value}
                    onClick={() => setTheme(value)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-md py-2 text-[10px] transition-colors",
                      active
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                    title={label}
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {label}
                  </button>
                );
              })}
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setDemo(!demo);
              }}
              className="flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <ToggleLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
                Demo mode
              </span>
              <Switch checked={demo} onCheckedChange={setDemo} />
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={() => onChange("settings")}>
              <SettingsIcon className="mr-2 h-3.5 w-3.5" strokeWidth={1.5} />
              Settings
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Runciter</span>
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      healthy === null
                        ? "bg-muted-foreground/40"
                        : healthy
                          ? "bg-emerald-500"
                          : "bg-rose-500",
                    )}
                  />
                  {healthy === null ? "checking…" : healthy ? "healthy" : "offline"}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span>Mode</span>
                <span>{demo ? "Demo" : "Live"}</span>
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
