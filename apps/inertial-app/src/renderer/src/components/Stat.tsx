import { cn } from "../lib/utils.js";

type Tone = "default" | "good" | "warn" | "danger" | "info";

interface StatProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ReactNode;
  tone?: Tone;
  delta?: { value: number; suffix?: string };
  className?: string;
}

const TONE: Record<Tone, string> = {
  default: "text-foreground",
  good: "text-emerald-700 dark:text-emerald-300",
  warn: "text-amber-700 dark:text-amber-300",
  danger: "text-rose-700 dark:text-rose-300",
  info: "text-sky-700 dark:text-sky-300",
};

export function Stat({ label, value, hint, icon, tone = "default", delta, className }: StatProps) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between rounded-lg border border-border bg-card px-4 py-3.5",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={cn("text-xl font-light tabular-nums leading-none", TONE[tone])}>
          {value}
        </span>
        {delta && (
          <span
            className={cn(
              "text-[11px] tabular-nums",
              delta.value > 0
                ? "text-emerald-700 dark:text-emerald-300"
                : delta.value < 0
                  ? "text-rose-700 dark:text-rose-300"
                  : "text-muted-foreground",
            )}
          >
            {delta.value > 0 ? "↑" : delta.value < 0 ? "↓" : "·"} {Math.abs(delta.value)}
            {delta.suffix ?? ""}
          </span>
        )}
      </div>
      {hint && <div className="mt-1 truncate text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
