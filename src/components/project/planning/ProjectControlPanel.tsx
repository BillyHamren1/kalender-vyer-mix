import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Users, CheckCircle2, AlertTriangle } from "lucide-react";

const ProjectControlPanel = () => {
  return (
    <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border/40 pb-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Aktiviteter</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold tracking-tight">0 / 0</span>
              </div>
              <p className="text-[11px] text-muted-foreground">klara</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-blue-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Personal</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold tracking-tight">—</span>
              </div>
              <p className="text-[11px] text-muted-foreground">tilldelade</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
              <CalendarDays className="h-5 w-5 text-amber-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Projektperiod</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-semibold tracking-tight">— dagar</span>
              </div>
              <p className="text-[11px] text-muted-foreground">kvar</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Avvikelser</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold tracking-tight">0</span>
              </div>
              <p className="text-[11px] text-muted-foreground">att hantera</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ProjectControlPanel;
