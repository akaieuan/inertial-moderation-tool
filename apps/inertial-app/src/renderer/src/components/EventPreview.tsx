import { FileText, Image as ImageIcon, Link as LinkIcon, Mic, Video } from "lucide-react";
import type { ContentEvent } from "@inertial/schemas";
import { cn } from "../lib/utils.js";

interface EventPreviewProps {
  event: ContentEvent;
  density?: "compact" | "comfortable";
  className?: string;
}

export function EventPreview({ event, density = "compact", className }: EventPreviewProps) {
  const hasImage = event.media.some((m) => m.modality === "image");
  const hasVideo = event.media.some((m) => m.modality === "video");
  const hasAudio = event.media.some((m) => m.modality === "audio");
  const hasLinks = event.links.length > 0;
  const firstImage = event.media.find((m) => m.modality === "image");

  const textClamp = density === "compact" ? "line-clamp-2" : "line-clamp-4";

  return (
    <div className={cn("flex gap-3 min-w-0", className)}>
      {firstImage && (
        <div className="shrink-0">
          <img
            src={firstImage.url}
            alt=""
            className="h-14 w-14 rounded-md object-cover ring-1 ring-border"
            loading="lazy"
          />
        </div>
      )}
      <div className="flex-1 min-w-0 space-y-1">
        {event.text ? (
          <p className={cn("text-sm leading-snug text-foreground", textClamp)}>{event.text}</p>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            {hasImage ? "Image post" : hasVideo ? "Video post" : hasAudio ? "Audio post" : "Empty post"}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {event.text && (
            <span className="inline-flex items-center gap-1">
              <FileText className="h-3 w-3" strokeWidth={1.5} />
              text
            </span>
          )}
          {hasImage && (
            <span className="inline-flex items-center gap-1">
              <ImageIcon className="h-3 w-3" strokeWidth={1.5} />
              image
            </span>
          )}
          {hasVideo && (
            <span className="inline-flex items-center gap-1">
              <Video className="h-3 w-3" strokeWidth={1.5} />
              video
            </span>
          )}
          {hasAudio && (
            <span className="inline-flex items-center gap-1">
              <Mic className="h-3 w-3" strokeWidth={1.5} />
              audio
            </span>
          )}
          {hasLinks && (
            <span className="inline-flex items-center gap-1">
              <LinkIcon className="h-3 w-3" strokeWidth={1.5} />
              {event.links.length} link{event.links.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
