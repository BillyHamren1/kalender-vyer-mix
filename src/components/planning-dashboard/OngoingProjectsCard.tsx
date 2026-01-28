import { FolderKanban, Calendar, MapPin, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { OngoingProject } from "@/services/planningDashboardService";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { Button } from "@/components/ui/button";

interface OngoingProjectsCardProps {
  projects: OngoingProject[];
  isLoading: boolean;
}

const statusLabels: Record<string, string> = {
  planning: 'Planering',
  active: 'Aktiv',
  in_progress: 'Pågående',
  on_hold: 'Pausad'
};

const statusColors: Record<string, string> = {
  planning: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800',
  in_progress: 'bg-amber-100 text-amber-800',
  on_hold: 'bg-gray-100 text-gray-800'
};

const OngoingProjectsCard = ({ projects, isLoading }: OngoingProjectsCardProps) => {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-purple-600" />
            Pågående projekt
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-purple-600" />
            Pågående projekt ({projects.length})
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigate('/projects')}
            className="text-primary"
          >
            Alla projekt →
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px] px-6 pb-6">
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Inga pågående projekt
            </p>
          ) : (
            <div className="space-y-3">
              {projects.map((project) => (
                <div 
                  key={project.id}
                  className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/project/${project.id}`)}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-medium text-sm truncate">{project.name}</h4>
                      {project.bookingClient && (
                        <p className="text-xs text-muted-foreground">{project.bookingClient}</p>
                      )}
                    </div>
                    <Badge className={`text-xs shrink-0 ${statusColors[project.status] || 'bg-gray-100'}`}>
                      {statusLabels[project.status] || project.status}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {project.rigDate && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>Rigg: {format(new Date(project.rigDate), 'd MMM', { locale: sv })}</span>
                        </div>
                      )}
                      {project.eventDate && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>Event: {format(new Date(project.eventDate), 'd MMM', { locale: sv })}</span>
                        </div>
                      )}
                      {project.projectLeader && (
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          <span>{project.projectLeader}</span>
                        </div>
                      )}
                    </div>

                    {project.deliveryAddress && (
                      <div className="flex items-start gap-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
                        <span className="line-clamp-1">{project.deliveryAddress}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Progress value={project.progress} className="h-1.5 flex-1" />
                      <span className="text-xs text-muted-foreground shrink-0">
                        {project.completedTasks}/{project.totalTasks}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default OngoingProjectsCard;
