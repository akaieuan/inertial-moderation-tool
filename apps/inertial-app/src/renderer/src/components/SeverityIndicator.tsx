import { cn } from "../lib/utils.js";

export type Severity = "low" | "medium" | "high";

export function severityFor(maxProbability: number): Severity {
  if (maxProbability >= 0.8) return "high";
  if (maxProbability >= 0.5) return "medium";
  return "low";
}

const STRIPE: Record<Severity, string> = {
  low: "bg-emerald-500",
  medium: "bg-amber-500",
  high: "bg-rose-500",
};

export function SeverityIndicator({
  severity,
  className,
}: {
  severity: Severity;
  className?: string;
}) {
  return <span aria-hidden className={cn("block h-full w-1 rounded-l-lg", STRIPE[severity], className)} />;
}

export const SEVERITY_TEXT: Record<Severity, string> = {
  low: "text-emerald-700 dark:text-emerald-300",
  medium: "text-amber-700 dark:text-amber-300",
  high: "text-rose-700 dark:text-rose-300",
};

export const SEVERITY_BG_SOFT: Record<Severity, string> = {
  low: "bg-emerald-500/10 dark:bg-emerald-500/15",
  medium: "bg-amber-500/10 dark:bg-amber-500/15",
  high: "bg-rose-500/10 dark:bg-rose-500/15",
};

export const SEVERITY_BORDER_SOFT: Record<Severity, string> = {
  low: "border-emerald-500/30 dark:border-emerald-500/40",
  medium: "border-amber-500/30 dark:border-amber-500/40",
  high: "border-rose-500/30 dark:border-rose-500/40",
};

export const SEVERITY_BAR: Record<Severity, string> = {
  low: "bg-emerald-500/80",
  medium: "bg-amber-500/85",
  high: "bg-rose-500/90",
};
