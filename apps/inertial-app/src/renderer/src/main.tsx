import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { ThemeProvider } from "./lib/theme.js";
import { DemoModeProvider } from "./lib/demo-mode.js";
import { HistoryProvider } from "./lib/history.js";
import { TooltipProvider } from "./components/ui/tooltip.js";
import { Toaster } from "./components/ui/sonner.js";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("missing #root");

createRoot(rootEl).render(
  <StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="inertial-theme">
      <DemoModeProvider defaultValue={true}>
        <HistoryProvider>
          <TooltipProvider delayDuration={80}>
            <App />
            <Toaster />
          </TooltipProvider>
        </HistoryProvider>
      </DemoModeProvider>
    </ThemeProvider>
  </StrictMode>,
);
