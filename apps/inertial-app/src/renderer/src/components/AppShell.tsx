import { useEffect, useState } from "react";
import { AlignLeft, PanelLeft } from "lucide-react";
import { Sidebar, type Section } from "./Sidebar.js";
import { RightPanel, type RightPanelKind } from "./RightPanel.js";
import { PanelToggle } from "./PanelToggle.js";

interface AppShellProps {
  active: Section;
  onChange: (s: Section) => void;
  pendingCount: number;
  children: React.ReactNode;
}

const SIDEBAR_KEY = "inertial-sidebar-collapsed";
const RIGHT_PANEL_KEY = "inertial-right-panel";
const SIDEBAR_W_OPEN = 208;
const SIDEBAR_W_CLOSED = 52;

export function AppShell({ active, onChange, pendingCount, children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_KEY) === "1";
  });
  const [rightPanel, setRightPanel] = useState<RightPanelKind | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(RIGHT_PANEL_KEY);
    if (raw === "agent-activity" || raw === "notes" || raw === "chat") return raw;
    return null;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    try {
      if (rightPanel) window.localStorage.setItem(RIGHT_PANEL_KEY, rightPanel);
      else window.localStorage.removeItem(RIGHT_PANEL_KEY);
    } catch {
      // ignore
    }
  }, [rightPanel]);

  const sidebarWidth = sidebarCollapsed ? SIDEBAR_W_CLOSED : SIDEBAR_W_OPEN;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div
          className="relative flex h-11 shrink-0 items-center pr-3"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 bg-card/40 transition-[width] duration-200"
            style={{ width: sidebarWidth }}
          />
          <button
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="relative ml-[80px] inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            {sidebarCollapsed ? (
              <AlignLeft className="h-4 w-4" strokeWidth={1.5} />
            ) : (
              <PanelLeft className="h-4 w-4" strokeWidth={1.5} />
            )}
          </button>
          <div className="flex-1" />
          {!rightPanel && (
            <PanelToggle value={rightPanel} onChange={setRightPanel} />
          )}
        </div>

        <div className="flex flex-1 overflow-hidden">
          <Sidebar
            active={active}
            onChange={onChange}
            pendingCount={pendingCount}
            collapsed={sidebarCollapsed}
            onOpenPanel={(kind) => setRightPanel(kind)}
          />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1240px] px-10 pb-12 pt-3">{children}</div>
          </main>
        </div>
      </div>
      {rightPanel && <RightPanel kind={rightPanel} onChange={setRightPanel} />}
    </div>
  );
}
