import { Calendar, User, MessageSquare, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ProjectTask } from "@/types/project";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface ProjectTaskItemProps {
  task: ProjectTask;
  onToggle: () => void;
  onClick: () => void;
  onDelete?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  commentCount?: number;
  isFirst?: boolean;
  isLast?: boolean;
}

const ProjectTaskItem = ({ task, onToggle, onClick, onDelete, onMoveUp, onMoveDown, commentCount = 0, isFirst, isLast }: ProjectTaskItemProps) => {
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
        "flex items-center gap-1.5 py-1 px-2 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer group",
        task.completed && "opacity-50"
      )}
      onClick={onClick}
    >
      {/* Reorder controls - compact */}
      <div className="flex flex-col items-center opacity-0 group-hover:opacity-60 transition-opacity shrink-0" onClick={(e) => e.stopPropagation()}>
        <Button
          variant="ghost"
          size="icon"
          className="h-3 w-3 text-muted-foreground hover:text-foreground"
          onClick={onMoveUp}
          disabled={isFirst}
        >
          <ChevronUp className="h-2.5 w-2.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-3 w-3 text-muted-foreground hover:text-foreground"
          onClick={onMoveDown}
          disabled={isLast}
        >
          <ChevronDown className="h-2.5 w-2.5" />
        </Button>
      </div>

      <Checkbox
        checked={task.completed}
        onCheckedChange={() => onToggle()}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0"
      />
      
      <span className={cn(
        "flex-1 min-w-0 text-sm font-medium truncate",
        task.completed && "line-through text-muted-foreground"
      )}>
        {task.title}
      </span>

      {/* Inline metadata */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
        {assignedStaff && (
          <div className="flex items-center gap-1 max-w-[100px]">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{assignedStaff.name}</span>
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

      {/* Delete button */}
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
};

export default ProjectTaskItem;
