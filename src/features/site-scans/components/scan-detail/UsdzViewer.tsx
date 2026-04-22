// Stub viewer — `three` is not installed in the host project.
// Original 3D OBJ viewer is preserved in version history; this placeholder
// renders a download link so the module compiles until `three` is added.

import { cn } from "@/lib/utils";

type RoomModelViewerProps = {
  url: string;
  alt?: string;
  className?: string;
  height?: number;
};

export default function UsdzViewer({ url, alt, className, height = 320 }: RoomModelViewerProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-md border border-border bg-muted/30 text-sm text-muted-foreground",
        className,
      )}
      style={{ height }}
    >
      <span>{alt ?? "3D model preview unavailable"}</span>
      <a href={url} target="_blank" rel="noreferrer" className="text-primary underline">
        Open model
      </a>
    </div>
  );
}
