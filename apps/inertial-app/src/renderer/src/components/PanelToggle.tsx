import { PanelRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.js";
import {
  RIGHT_PANEL_OPTIONS,
  type RightPanelKind,
} from "./RightPanel.js";
import { cn } from "../lib/utils.js";

interface PanelToggleProps {
  value: RightPanelKind | null;
  onChange: (next: RightPanelKind | null) => void;
  className?: string;
}

export function PanelToggle({ value, onChange, className }: PanelToggleProps) {
  return (
    <div
      className={cn("relative", className)}
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs",
              value
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            title="Side panel"
          >
            <PanelRight className="h-4 w-4" strokeWidth={1.5} />
            {value && (
              <span className="hidden sm:inline">
                {RIGHT_PANEL_OPTIONS.find((o) => o.key === value)?.label}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[140px] p-1">
          {RIGHT_PANEL_OPTIONS.map(({ key, label }) => (
            <DropdownMenuItem
              key={key}
              onClick={() => onChange(value === key ? null : key)}
              className="px-2 py-1.5 text-[13px]"
            >
              {label === "Agent activity" ? "Agent" : label}
            </DropdownMenuItem>
          ))}
          {value && (
            <DropdownMenuItem
              onClick={() => onChange(null)}
              className="px-2 py-1.5 text-[13px] text-muted-foreground"
            >
              Close
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
