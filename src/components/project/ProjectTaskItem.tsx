import { Calendar, Trash2, User } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ProjectTask } from "@/types/project";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface ProjectTaskItemProps {
  task: ProjectTask;
  onToggle: () => void;
  onDelete: () => void;
}

const ProjectTaskItem = ({ task, onToggle, onDelete }: ProjectTaskItemProps) => {
  const isOverdue = task.deadline && !task.completed && new Date(task.deadline) < new Date();

  return (
    <div className={cn(
      "flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors group",
      task.completed && "opacity-60"
    )}>
      <Checkbox
        checked={task.completed}
        onCheckedChange={onToggle}
        className="mt-1"
      />
      
      <div className="flex-1 min-w-0">
        <p className={cn(
          "font-medium",
          task.completed && "line-through text-muted-foreground"
        )}>
          {task.title}
        </p>
        
        {task.description && (
          <p className="text-sm text-muted-foreground mt-1">
            {task.description}
          </p>
        )}

        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
          {task.assigned_to && (
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              <span>{task.assigned_to}</span>
            </div>
          )}
          {task.deadline && (
            <div className={cn(
              "flex items-center gap-1",
              isOverdue && "text-destructive"
            )}>
              <Calendar className="h-3 w-3" />
              <span>{format(new Date(task.deadline), 'd MMM', { locale: sv })}</span>
            </div>
          )}
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
};

export default ProjectTaskItem;
