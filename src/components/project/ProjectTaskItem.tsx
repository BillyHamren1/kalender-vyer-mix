import { useState, useRef, useEffect } from "react";
import { Calendar, User, MessageSquare, Trash2, GripVertical, ArrowUpRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ProjectTask } from "@/types/project";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ProjectTaskItemProps {
  task: ProjectTask;
  onToggle: () => void;
  onClick: () => void;
  onDelete?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRenameTask?: (id: string, title: string) => void;
  onOpenInExecution?: () => void;
  commentCount?: number;
  isFirst?: boolean;
  isLast?: boolean;
  isSelected?: boolean;
}

const ProjectTaskItem = ({ task, onToggle, onClick, onDelete, onRenameTask, onOpenInExecution, commentCount = 0, isSelected }: ProjectTaskItemProps) => {
  const isOverdue = task.deadline && !task.completed && new Date(task.deadline) < new Date();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingTitle && inputRef.current) inputRef.current.focus();
  }, [isEditingTitle]);

  const { data: assignedStaff } = useQuery({
    queryKey: ["staff-member", task.assigned_to],
    queryFn: async () => {
      if (!task.assigned_to) return null;
      const { data } = await supabase
        .from("staff_members")
        .select("name")
        .eq("id", task.assigned_to)
        .single();
      return data;
    },
    enabled: !!task.assigned_to,
  });

  const { data: taskComments } = useQuery({
    queryKey: ["task-comments-count", task.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("task_comments")
        .select("*", { count: "exact", head: true })
        .eq("task_id", task.id);
      return count || 0;
    },
  });

  const actualCommentCount = taskComments || commentCount;

  const handleTitleSave = () => {
    const trimmed = editedTitle.trim();
    if (trimmed && trimmed !== task.title && onRenameTask) {
      onRenameTask(task.id, trimmed);
    }
    setIsEditingTitle(false);
  };

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 py-1 px-2 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer group",
        task.completed && "opacity-50",
        isSelected && "bg-primary/8 hover:bg-primary/10"
      )}
      onClick={isEditingTitle ? undefined : onClick}
    >
      {/* Drag handle */}
      <div
        className="opacity-0 group-hover:opacity-40 transition-opacity shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </div>

      <Checkbox
        checked={task.completed}
        onCheckedChange={() => onToggle()}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0"
      />

      {/* Title — double click to edit */}
      {isEditingTitle ? (
        <input
          ref={inputRef}
          value={editedTitle}
          onChange={(e) => setEditedTitle(e.target.value)}
          onBlur={handleTitleSave}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleTitleSave();
            if (e.key === "Escape") {
              setEditedTitle(task.title);
              setIsEditingTitle(false);
            }
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 text-sm font-medium bg-transparent border-b border-primary outline-none py-0.5"
        />
      ) : (
        <span
          className={cn(
            "flex-1 min-w-0 text-sm font-medium truncate",
            task.completed && "line-through text-muted-foreground"
          )}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditedTitle(task.title);
            setIsEditingTitle(true);
          }}
        >
          {task.title}
        </span>
      )}

      {/* Inline metadata */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
        {task.execution_task_id && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-primary/30 text-primary/70 font-normal gap-0.5 cursor-default">
                Synkad
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Uppgiften finns i Utförande-vyn
            </TooltipContent>
          </Tooltip>
        )}
        {assignedStaff && (
          <div className="flex items-center gap-1 max-w-[100px]">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{assignedStaff.name}</span>
          </div>
        )}
        {task.deadline && (
          <div className={cn("flex items-center gap-1", isOverdue && "text-destructive font-medium")}>
            <Calendar className="h-3 w-3" />
            <span>{format(new Date(task.deadline), "d MMM", { locale: sv })}</span>
          </div>
        )}
        {actualCommentCount > 0 && (
          <div className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            <span>{actualCommentCount}</span>
          </div>
        )}
      </div>

      {/* Open in execution */}
      {task.execution_task_id && onOpenInExecution && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-primary shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onOpenInExecution();
              }}
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Öppna i Utförande
          </TooltipContent>
        </Tooltip>
      )}

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
