import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ReactNode } from "react";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

const ErrorState = ({
  title = "Något gick fel",
  message = "Det gick inte att hämta data. Försök igen.",
  onRetry,
  className,
}: ErrorStateProps) => {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 py-16 px-6 text-center",
        className
      )}
    >
      <div className="h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center mb-4">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <p className="text-sm font-medium text-foreground/90">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
          Försök igen
        </Button>
      )}
    </div>
  );
};

export default ErrorState;
