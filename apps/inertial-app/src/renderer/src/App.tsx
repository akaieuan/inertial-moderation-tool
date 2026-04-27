import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell.js";
import type { Section } from "./components/Sidebar.js";
import { DashboardView } from "./views/DashboardView.js";
import { QueueView } from "./views/QueueView.js";
import { PipelinesView } from "./views/PipelinesView.js";
import { ComplianceView } from "./views/ComplianceView.js";
import { EvalView } from "./views/EvalView.js";
import { SkillsView } from "./views/SkillsView.js";
import { SettingsView } from "./views/SettingsView.js";
import { listQueue } from "./lib/api.js";
import { useDemoMode } from "./lib/demo-mode.js";

const INSTANCE = "smoke.local";

export function App() {
  const [section, setSection] = useState<Section>("dashboard");
  const [pendingCount, setPendingCount] = useState(0);
  const { demo } = useDemoMode();

  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      try {
        const items = await listQueue(INSTANCE);
        if (mounted) setPendingCount(items.filter((i) => i.state !== "decided").length);
      } catch {
        if (mounted) setPendingCount(0);
      }
    };
    void tick();
    if (demo) return;
    const handle = setInterval(tick, 6_000);
    return () => {
      mounted = false;
      clearInterval(handle);
    };
  }, [demo]);

  return (
    <AppShell active={section} onChange={setSection} pendingCount={pendingCount}>
      {section === "dashboard" && <DashboardView onNavigate={setSection} />}
      {section === "queue" && <QueueView />}
      {section === "pipelines" && <PipelinesView onNavigate={setSection} />}
      {section === "skills" && <SkillsView />}
      {section === "compliance" && <ComplianceView onNavigate={setSection} />}
      {section === "insights" && <EvalView />}
      {section === "settings" && <SettingsView />}
    </AppShell>
  );
}
