import { CalendarRange, CheckCircle2, CircleDot, Users, Rows3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ProjectPlanningHeaderProps {
  title?: string;
  description?: string;
  bookingCount?: number;
  taskCount?: number;
  completedCount?: number;
  modeLabel?: string;
}

const ProjectPlanningHeader = ({
  title = "Planering",
  description = "Planera projektets aktiviteter, tider, ansvar och genomförande i en sammanhållen arbetsyta.",
  bookingCount,
  taskCount,
  completedCount,
  modeLabel,
}: ProjectPlanningHeaderProps) => {
  const progress = taskCount && taskCount > 0 ? Math.round(((completedCount || 0) / taskCount) * 100) : null;
  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <CalendarRange className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
                {modeLabel && <Badge variant="outline" className="font-normal">{modeLabel}</Badge>}
              </div>
              <p className="text-sm text-muted-foreground mt-1 max-w-3xl">{description}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {bookingCount !== undefined && (
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 flex items-center gap-2">
                <Rows3 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Leveranser</span>
                <strong>{bookingCount}</strong>
              </div>
            )}
            {taskCount !== undefined && (
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Aktiviteter</span>
                <strong>{completedCount || 0}/{taskCount}</strong>
              </div>
            )}
            {progress !== null && (
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 flex items-center gap-2">
                <CircleDot className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Klart</span>
                <strong>{progress}%</strong>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ProjectPlanningHeader;
