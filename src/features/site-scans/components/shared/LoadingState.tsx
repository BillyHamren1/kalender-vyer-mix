import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  message?: string;
  className?: string;
}

const LoadingState = ({
  message = "Laddar...",
  className,
}: LoadingStateProps) => {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-border bg-card/50 py-16 px-6",
        className
      )}
    >
      <Loader2 className="h-6 w-6 text-primary animate-spin mb-3" />
      <p className="text-sm text-muted-foreground font-mono">{message}</p>
    </div>
  );
};

export default LoadingState;
