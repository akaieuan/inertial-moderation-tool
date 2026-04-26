import { useState } from "react";
import { cn } from "../lib/utils.js";

export interface BboxOverlay {
  /** Normalized 0..1 coordinates (x, y from top-left). */
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  severity?: "low" | "medium" | "high";
}

interface ImageEvidenceProps {
  src: string;
  alt?: string;
  bboxes: ReadonlyArray<BboxOverlay>;
  className?: string;
}

/**
 * Renders a media image with per-channel evidence regions overlaid as
 * normalized bounding boxes. Severity colors the rect outline and the label
 * chip. When the upstream skill produces a whole-image bbox (`{0,0,1,1}` —
 * which is what current classifiers do), the overlay is essentially a
 * caption tag in the corner; future detector-style skills emitting tighter
 * boxes will render naturally without code changes.
 */
export function ImageEvidence({
  src,
  alt,
  bboxes,
  className,
}: ImageEvidenceProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    <div
      className={cn(
        "relative inline-block overflow-hidden rounded-md border border-[color:var(--border)] bg-[color:var(--muted)]",
        className,
      )}
    >
      {!loaded && !errored && (
        <div className="flex h-48 w-full items-center justify-center text-xs text-[color:var(--muted-foreground)]">
          loading…
        </div>
      )}
      {errored && (
        <div className="flex h-48 w-full items-center justify-center px-4 text-center text-xs text-rose-300">
          could not load image
        </div>
      )}
      <img
        src={src}
        alt={alt ?? ""}
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        className={cn(
          "block max-h-[480px] w-auto",
          loaded ? "opacity-100" : "h-0 w-0 opacity-0",
        )}
      />
      {loaded &&
        bboxes.map((b, i) => {
          const severity = b.severity ?? "medium";
          return (
            <div
              key={i}
              className={cn(
                "absolute pointer-events-none border-2",
                SEVERITY_BORDER[severity],
              )}
              style={{
                left: `${b.x * 100}%`,
                top: `${b.y * 100}%`,
                width: `${b.w * 100}%`,
                height: `${b.h * 100}%`,
              }}
            >
              {b.label && (
                <span
                  className={cn(
                    "absolute left-0 top-0 -translate-y-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                    SEVERITY_LABEL[severity],
                  )}
                >
                  {b.label}
                </span>
              )}
            </div>
          );
        })}
    </div>
  );
}

const SEVERITY_BORDER: Record<NonNullable<BboxOverlay["severity"]>, string> = {
  low: "border-emerald-400/70",
  medium: "border-amber-400/80",
  high: "border-rose-400/90",
};

const SEVERITY_LABEL: Record<NonNullable<BboxOverlay["severity"]>, string> = {
  low: "bg-emerald-500/90 text-white",
  medium: "bg-amber-500/90 text-black",
  high: "bg-rose-500/95 text-white",
};
