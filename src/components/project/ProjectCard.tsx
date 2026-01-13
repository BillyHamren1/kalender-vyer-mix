import { Calendar, Trash2, CheckSquare } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProjectWithBooking, PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS } from "@/types/project";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

interface ProjectCardProps {
  project: ProjectWithBooking;
  onClick: () => void;
  onDelete: () => void;
}

const ProjectCard = ({ project, onClick, onDelete }: ProjectCardProps) => {
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow group"
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg truncate">{project.name}</h3>
            {project.booking && (
              <p className="text-sm text-muted-foreground truncate">
                {project.booking.client}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="opacity-0 group-hover:opacity-100 transition-opacity -mt-1 -mr-2"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge className={PROJECT_STATUS_COLORS[project.status]}>
            {PROJECT_STATUS_LABELS[project.status]}
          </Badge>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {project.booking?.eventdate && (
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {format(new Date(project.booking.eventdate), 'd MMM yyyy', { locale: sv })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <CheckSquare className="h-4 w-4" />
          <span>Skapad {format(new Date(project.created_at), 'd MMM yyyy', { locale: sv })}</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default ProjectCard;
