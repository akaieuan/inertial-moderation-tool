import { AlertTriangle } from "lucide-react";
import type { Author } from "@inertial/schemas";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar.js";
import { cn } from "../lib/utils.js";
import { getDemoAvatar } from "../lib/demo-data.js";

interface AuthorBadgeProps {
  author: Author;
  size?: "sm" | "md";
  className?: string;
}

export function AuthorBadge({ author, size = "sm", className }: AuthorBadgeProps) {
  const dim = size === "md" ? "h-8 w-8" : "h-6 w-6";
  const initials = (author.displayName ?? author.handle)
    .split(/[\s_.-]+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className={cn("flex items-center gap-2 min-w-0", className)}>
      <Avatar className={dim}>
        <AvatarImage src={getDemoAvatar(author.handle)} alt={author.handle} />
        <AvatarFallback className="text-[10px] font-medium">{initials || "?"}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 leading-tight">
        <div className="truncate text-sm font-medium text-foreground">
          {author.displayName ?? `@${author.handle}`}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground truncate">
          <span className="truncate">@{author.handle}</span>
          {author.priorActionCount > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-400"
              title={`${author.priorActionCount} prior moderation actions`}
            >
              <AlertTriangle className="h-3 w-3" strokeWidth={1.75} />
              {author.priorActionCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
