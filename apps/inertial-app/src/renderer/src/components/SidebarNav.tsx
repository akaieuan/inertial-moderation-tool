import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/utils.js";
import { Badge } from "./ui/badge.js";

export interface NavItem<T extends string> {
  key: T;
  label: string;
  Icon: LucideIcon;
  badge?: number;
}

interface SidebarNavProps<T extends string> {
  items: ReadonlyArray<NavItem<T>>;
  active: T;
  onChange: (key: T) => void;
  collapsed?: boolean;
}

export function SidebarNav<T extends string>({
  items,
  active,
  onChange,
  collapsed = false,
}: SidebarNavProps<T>) {
  return (
    <nav aria-label="Primary" className="flex flex-col gap-px px-1.5">
      {items.map(({ key, label, Icon, badge }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-current={isActive ? "page" : undefined}
            title={collapsed ? label : undefined}
            className={cn(
              "group flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-foreground/10 text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
              collapsed && "justify-center px-1",
            )}
          >
            <Icon
              className={cn("h-3.5 w-3.5 shrink-0", isActive && "text-foreground")}
              strokeWidth={1.5}
            />
            {!collapsed && (
              <>
                <span className="flex-1 truncate">{label}</span>
                {badge !== undefined && badge > 0 && (
                  <Badge
                    variant="secondary"
                    className="h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none tabular-nums"
                  >
                    {badge > 99 ? "99+" : badge}
                  </Badge>
                )}
              </>
            )}
          </button>
        );
      })}
    </nav>
  );
}
