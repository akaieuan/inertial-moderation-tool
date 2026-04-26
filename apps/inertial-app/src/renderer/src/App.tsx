import { useState } from "react";
import { QueueView } from "./views/QueueView.js";
import { EvalView } from "./views/EvalView.js";
import { ComplianceView } from "./views/ComplianceView.js";
import { cn } from "./lib/utils.js";

type Tab = "queue" | "compliance" | "eval";

export function App() {
  const [tab, setTab] = useState<Tab>("queue");

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[color:var(--border)] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-light tracking-tight">inertial</h1>
            <p className="text-xs uppercase tracking-widest text-[color:var(--muted-foreground)]">
              moderator dashboard · pre-alpha
            </p>
          </div>
          <nav className="flex gap-1 rounded-md border border-[color:var(--border)] bg-[color:var(--muted)] p-0.5">
            <TabButton active={tab === "queue"} onClick={() => setTab("queue")}>
              Queue
            </TabButton>
            <TabButton
              active={tab === "compliance"}
              onClick={() => setTab("compliance")}
            >
              Compliance
            </TabButton>
            <TabButton active={tab === "eval"} onClick={() => setTab("eval")}>
              Eval
            </TabButton>
          </nav>
        </div>
      </header>
      <main className="flex-1 overflow-auto p-6">
        {tab === "queue" ? (
          <QueueView />
        ) : tab === "compliance" ? (
          <ComplianceView />
        ) : (
          <EvalView />
        )}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-sm px-3 py-1 text-sm transition-colors",
        active
          ? "bg-[color:var(--card)] text-[color:var(--foreground)]"
          : "text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]",
      )}
    >
      {children}
    </button>
  );
}
