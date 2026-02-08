import { Calendar, User, MessageSquare } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ProjectTask } from "@/types/project";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ProjectTaskItemProps {
  task: ProjectTask;
  onToggle: () => void;
  onClick: () => void;
  commentCount?: number;
}

const ProjectTaskItem = ({ task, onToggle, onClick, commentCount = 0 }: ProjectTaskItemProps) => {
  const isOverdue = task.deadline && !task.completed && new Date(task.deadline) < new Date();

  const { data: assignedStaff } = useQuery({
    queryKey: ['staff-member', task.assigned_to],
    queryFn: async () => {
      if (!task.assigned_to) return null;
      const { data } = await supabase
        .from('staff_members')
        .select('name')
        .eq('id', task.assigned_to)
        .single();
      return data;
    },
    enabled: !!task.assigned_to
  });

  const { data: taskComments } = useQuery({
    queryKey: ['task-comments-count', task.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('task_comments')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', task.id);
      return count || 0;
    }
  });

  const actualCommentCount = taskComments || commentCount;

  return (
    <div 
      className={cn(
        "flex items-start gap-3 p-4 rounded-xl border border-border/40 bg-card hover:bg-muted/30 transition-colors cursor-pointer group",
        task.completed && "opacity-60"
      )}
      onClick={onClick}
    >
      <Checkbox
        checked={task.completed}
        onCheckedChange={() => onToggle()}
        onClick={(e) => e.stopPropagation()}
        className="mt-1"
      />
      
      <div className="flex-1 min-w-0">
        <p className={cn(
          "font-medium tracking-tight",
          task.completed && "line-through text-muted-foreground"
        )}>
          {task.title}
        </p>
        
        {task.description && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {task.description}
          </p>
        )}

        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
          {assignedStaff && (
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              <span>{assignedStaff.name}</span>
            </div>
          )}
          {task.deadline && (
            <div className={cn(
              "flex items-center gap-1",
              isOverdue && "text-destructive font-medium"
            )}>
              <Calendar className="h-3 w-3" />
              <span>{format(new Date(task.deadline), 'd MMM', { locale: sv })}</span>
            </div>
          )}
          {actualCommentCount > 0 && (
            <div className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              <span>{actualCommentCount}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectTaskItem;
