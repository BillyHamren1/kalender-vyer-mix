import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import {
  Calendar,
  User,
  MessageSquare,
  Send,
  Trash2,
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  X,
  Pencil,
  Check,
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { ProjectTask, TaskComment } from "@/types/project";
import { fetchTaskComments, createTaskComment, deleteTaskComment } from "@/services/taskCommentService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TaskDetailSheetProps {
  task: ProjectTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateTask: (data: { id: string; updates: Partial<ProjectTask> }) => void;
  onDeleteTask: (id: string) => void;
}

const TaskDetailSheet = ({ task, open, onOpenChange, onUpdateTask, onDeleteTask }: TaskDetailSheetProps) => {
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState("");
  const [authorName, setAuthorName] = useState(() => localStorage.getItem("task-comment-author") || "");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const descTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) titleInputRef.current.focus();
  }, [isEditingTitle]);

  useEffect(() => {
    if (isEditingDescription && descTextareaRef.current) descTextareaRef.current.focus();
  }, [isEditingDescription]);

  const { data: staffMembers = [] } = useQuery({
    queryKey: ["staff-members-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff_members")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: open,
  });

  const { data: comments = [] } = useQuery({
    queryKey: ["task-comments", task?.id],
    queryFn: () => fetchTaskComments(task!.id),
    enabled: !!task?.id && open,
  });

  const addCommentMutation = useMutation({
    mutationFn: (data: { task_id: string; author_name: string; content: string }) =>
      createTaskComment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-comments", task?.id] });
      queryClient.invalidateQueries({ queryKey: ["task-comments-count", task?.id] });
      setNewComment("");
    },
    onError: () => toast.error("Kunde inte lägga till kommentar"),
  });

  const deleteCommentMutation = useMutation({
    mutationFn: deleteTaskComment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-comments", task?.id] });
      queryClient.invalidateQueries({ queryKey: ["task-comments-count", task?.id] });
    },
    onError: () => toast.error("Kunde inte ta bort kommentar"),
  });

  if (!task) return null;

  const isOverdue = task.deadline && !task.completed && new Date(task.deadline) < new Date();
  const assignedStaff = staffMembers.find((s) => s.id === task.assigned_to);

  const handleToggleComplete = () => {
    onUpdateTask({ id: task.id, updates: { completed: !task.completed } });
  };

  const handleTitleSave = () => {
    const trimmed = editedTitle.trim();
    if (trimmed && trimmed !== task.title) {
      onUpdateTask({ id: task.id, updates: { title: trimmed } });
    }
    setIsEditingTitle(false);
  };

  const handleDescriptionSave = () => {
    const trimmed = editedDescription.trim();
    if (trimmed !== (task.description || "")) {
      onUpdateTask({ id: task.id, updates: { description: trimmed || null } });
    }
    setIsEditingDescription(false);
  };

  const handleDeadlineChange = (date: Date | undefined) => {
    onUpdateTask({
      id: task.id,
      updates: { deadline: date ? format(date, "yyyy-MM-dd") : null },
    });
    setDatePickerOpen(false);
  };

  const handleAssigneeChange = (staffId: string) => {
    onUpdateTask({
      id: task.id,
      updates: { assigned_to: staffId === "none" ? null : staffId },
    });
    setAssigneeOpen(false);
  };

  const handleSubmitComment = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newComment.trim() || !authorName.trim()) return;
    localStorage.setItem("task-comment-author", authorName.trim());
    addCommentMutation.mutate({
      task_id: task.id,
      author_name: authorName.trim(),
      content: newComment.trim(),
    });
  };

  const handleCommentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmitComment();
    }
  };

  const handleDelete = () => {
    onDeleteTask(task.id);
    onOpenChange(false);
  };

  const initials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col gap-0">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-border/40">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Complete toggle */}
            <button
              onClick={handleToggleComplete}
              className={cn(
                "mt-0.5 shrink-0 rounded-full transition-colors",
                task.completed
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {task.completed ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <Circle className="h-5 w-5" />
              )}
            </button>

            {/* Title */}
            <div className="flex-1 min-w-0">
              {isEditingTitle ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    ref={titleInputRef}
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    onBlur={handleTitleSave}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleTitleSave();
                      if (e.key === "Escape") setIsEditingTitle(false);
                    }}
                    className="text-base font-semibold h-8 px-2 py-1"
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleTitleSave}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <button
                  className="text-left w-full group flex items-start gap-1.5"
                  onClick={() => { setEditedTitle(task.title); setIsEditingTitle(true); }}
                >
                  <span className={cn(
                    "text-base font-semibold leading-tight",
                    task.completed && "line-through text-muted-foreground"
                  )}>
                    {task.title}
                  </span>
                  <Pencil className="h-3 w-3 mt-1 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              )}
              {task.is_info_only && (
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Milstolpe</span>
              )}
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-5">
            {/* Metadata chips row */}
            <div className="flex flex-wrap gap-2">
              {/* Deadline */}
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
                      isOverdue
                        ? "border-destructive/50 bg-destructive/10 text-destructive"
                        : task.deadline
                        ? "border-border bg-muted/40 text-foreground hover:bg-muted"
                        : "border-dashed border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                    )}
                  >
                    {isOverdue && <AlertTriangle className="h-3 w-3" />}
                    <Calendar className="h-3 w-3" />
                    {task.deadline
                      ? format(new Date(task.deadline), "d MMM yyyy", { locale: sv })
                      : "Sätt deadline"}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={task.deadline ? new Date(task.deadline) : undefined}
                    onSelect={handleDeadlineChange}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                  {task.deadline && (
                    <div className="px-3 pb-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-muted-foreground text-xs"
                        onClick={() => handleDeadlineChange(undefined)}
                      >
                        Ta bort deadline
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>

              {/* Assignee */}
              <Popover open={assigneeOpen} onOpenChange={setAssigneeOpen}>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
                      assignedStaff
                        ? "border-border bg-muted/40 text-foreground hover:bg-muted"
                        : "border-dashed border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                    )}
                  >
                    <User className="h-3 w-3" />
                    {assignedStaff ? assignedStaff.name : "Tilldela"}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-1" align="start">
                  <div className="space-y-0.5">
                    <button
                      className="w-full text-left text-sm px-2.5 py-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
                      onClick={() => handleAssigneeChange("none")}
                    >
                      Ingen
                    </button>
                    {staffMembers.map((staff) => (
                      <button
                        key={staff.id}
                        className={cn(
                          "w-full text-left text-sm px-2.5 py-1.5 rounded-md hover:bg-muted transition-colors",
                          task.assigned_to === staff.id && "bg-primary/10 text-primary font-medium"
                        )}
                        onClick={() => handleAssigneeChange(staff.id)}
                      >
                        {staff.name}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Description */}
            <div>
              {isEditingDescription ? (
                <div className="space-y-2">
                  <Textarea
                    ref={descTextareaRef}
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                    onBlur={handleDescriptionSave}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setIsEditingDescription(false);
                    }}
                    placeholder="Lägg till en beskrivning..."
                    rows={4}
                    className="text-sm resize-none"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleDescriptionSave} className="h-7 text-xs">Spara</Button>
                    <Button size="sm" variant="ghost" onClick={() => setIsEditingDescription(false)} className="h-7 text-xs">Avbryt</Button>
                  </div>
                </div>
              ) : (
                <button
                  className="w-full text-left group"
                  onClick={() => {
                    setEditedDescription(task.description || "");
                    setIsEditingDescription(true);
                  }}
                >
                  {task.description ? (
                    <p className="text-sm text-foreground whitespace-pre-wrap">{task.description}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic group-hover:text-foreground transition-colors">
                      Klicka för att lägga till beskrivning...
                    </p>
                  )}
                </button>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-border/40" />

            {/* Comments */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Kommentarer {comments.length > 0 && `(${comments.length})`}
                </span>
              </div>

              {/* Comment list */}
              {comments.length > 0 && (
                <div className="space-y-3">
                  {comments.map((comment: TaskComment) => (
                    <div key={comment.id} className="flex gap-2.5 group">
                      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                          {initials(comment.author_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold">{comment.author_name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(comment.created_at), "d MMM HH:mm", { locale: sv })}
                          </span>
                          <button
                            className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                            onClick={() => deleteCommentMutation.mutate(comment.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        <p className="text-sm mt-0.5 whitespace-pre-wrap text-foreground/90">{comment.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {comments.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Inga kommentarer ännu</p>
              )}

              {/* Author name (persistent) */}
              {!authorName && (
                <Input
                  placeholder="Ditt namn (sparas)"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  className="h-8 text-sm"
                />
              )}

              {/* Comment input */}
              <div className="flex gap-2 items-end">
                <Avatar className="h-7 w-7 shrink-0 mb-0.5">
                  <AvatarFallback className="text-[10px] bg-muted text-muted-foreground">
                    {authorName ? initials(authorName) : "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 relative">
                  <Textarea
                    placeholder="Skriv en kommentar... (Enter = skicka)"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={handleCommentKeyDown}
                    rows={2}
                    className="text-sm resize-none pr-9"
                  />
                  <button
                    onClick={() => handleSubmitComment()}
                    disabled={!newComment.trim() || !authorName.trim() || addCommentMutation.isPending}
                    className="absolute right-2 bottom-2 text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {authorName && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Kommenterar som <strong>{authorName}</strong></span>
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                    onClick={() => setAuthorName("")}
                  >
                    Ändra
                  </button>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-border/40" />

            {/* Meta info + delete */}
            <div className="space-y-3">
              <div className="text-[11px] text-muted-foreground space-y-1">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  Skapad: {format(new Date(task.created_at), "d MMM yyyy HH:mm", { locale: sv })}
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  Uppdaterad: {format(new Date(task.updated_at), "d MMM yyyy HH:mm", { locale: sv })}
                </div>
              </div>

              <Button
                variant="ghost"
                className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive text-sm h-8"
                onClick={handleDelete}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Ta bort uppgift
              </Button>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default TaskDetailSheet;
