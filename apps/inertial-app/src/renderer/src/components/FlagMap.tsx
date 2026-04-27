import { cn } from "../lib/utils.js";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./ui/tooltip.js";

export interface FlagDayMeta {
  date: string;
  topChannel?: string;
  topProb?: number;
}

export interface FlagMapProps {
  data: number[];
  dayMeta?: FlagDayMeta[];
  cellSize?: number;
  gap?: number;
  className?: string;
}

export function FlagMap({
  data,
  dayMeta,
  cellSize = 12,
  gap = 3,
  className,
}: FlagMapProps) {
  return (
    <div
      className={cn("grid grid-flow-col", className)}
      style={{
        gridTemplateRows: "repeat(7, minmax(0, 1fr))",
        gap: `${gap}px`,
      }}
    >
      {data.map((count, i) => {
        const meta = dayMeta?.[i];
        return (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "rounded-[3px] cursor-default transition-colors",
                  flagHeatColor(count),
                )}
                style={{ width: `${cellSize}px`, height: `${cellSize}px` }}
              />
            </TooltipTrigger>
            <TooltipContent
              side="top"
              sideOffset={6}
              className="!bg-popover !text-popover-foreground border border-border px-3 py-2 shadow-lg [&>svg]:!fill-popover [&>svg]:!bg-popover [&>svg]:border [&>svg]:border-border"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-2 w-2 rounded-[2px]",
                    flagHeatColor(count === 0 ? 0 : Math.max(count, 1)),
                  )}
                />
                <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {meta?.date ?? "—"}
                </span>
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-base font-medium tabular-nums text-foreground">
                  {count}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {count === 1 ? "flag" : "flags"}
                </span>
              </div>
              {meta?.topChannel ? (
                <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-1.5">
                  <span className="font-mono text-[11px] text-foreground/90">
                    {meta.topChannel}
                  </span>
                  {typeof meta.topProb === "number" && (
                    <span className="tabular-nums text-[11px] text-muted-foreground">
                      {meta.topProb.toFixed(2)}
                    </span>
                  )}
                </div>
              ) : count === 0 ? (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  no activity
                </div>
              ) : null}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function FlagLegend({ cellSize = 8 }: { cellSize?: number }) {
  const steps = [0, 1, 4, 8, 12];
  return (
    <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
      <span>less</span>
      <div className="flex items-center gap-[2px]">
        {steps.map((n) => (
          <span
            key={n}
            className={cn("rounded-[2px]", flagHeatColor(n))}
            style={{ width: `${cellSize}px`, height: `${cellSize}px` }}
          />
        ))}
      </div>
      <span>more</span>
    </div>
  );
}

export function flagHeatColor(count: number): string {
  if (count === 0) return "bg-foreground/[0.06]";
  if (count <= 2) return "bg-rose-500/15";
  if (count <= 5) return "bg-rose-500/30";
  if (count <= 10) return "bg-rose-500/45";
  return "bg-rose-500/60";
}

export interface FlagDataset {
  data: number[];
  meta: FlagDayMeta[];
}

const DEMO_CHANNELS = [
  "toxic",
  "spam-link-presence",
  "nsfw",
  "threat",
  "identity-hate",
  "promotional",
  "obscene",
];

export function generateFlagDataset(weeks: number, seed = 42): FlagDataset {
  const data: number[] = [];
  const meta: FlagDayMeta[] = [];
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const totalDays = weeks * 7;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let w = 0; w < weeks; w++) {
    const t = w / Math.max(1, weeks - 1);
    const intensity = 0.35 + t * 0.85;
    for (let d = 0; d < 7; d++) {
      const r = rand();
      const isWeekend = d === 0 || d === 6;
      const dayMul = isWeekend ? 0.55 : 1.0;
      const cellIdx = w * 7 + d;
      const dayOffset = totalDays - 1 - cellIdx;
      const date = new Date(today);
      date.setDate(date.getDate() - dayOffset);
      const dateLabel = date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });

      let count: number;
      if (r < 0.32) {
        count = 0;
      } else {
        count = Math.floor(r * 16 * intensity * dayMul);
      }
      data.push(count);

      if (count === 0) {
        meta.push({ date: dateLabel });
      } else {
        const channelPick = Math.floor(rand() * DEMO_CHANNELS.length);
        const topChannel = DEMO_CHANNELS[channelPick]!;
        const topProb = 0.55 + rand() * 0.43;
        meta.push({ date: dateLabel, topChannel, topProb });
      }
    }
  }
  return { data, meta };
}

export function generateFlagData(weeks: number, seed = 42): number[] {
  return generateFlagDataset(weeks, seed).data;
}
