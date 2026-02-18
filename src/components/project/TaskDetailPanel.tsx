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
  AlertTriangle,
  X,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { ProjectTask, TaskComment } from "@/types/project";
import { fetchTaskComments, createTaskComment, deleteTaskComment } from "@/services/taskCommentService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TaskDetailPanelProps {
  task: ProjectTask;
  onClose: () => void;
  onUpdateTask: (data: { id: string; updates: Partial<ProjectTask> }) => void;
  onDeleteTask: (id: string) => void;
  onAction?: () => void;
}

const initials = (name: string) =>
  name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

const TaskDetailPanel = ({ task, onClose, onUpdateTask, onDeleteTask, onAction }: TaskDetailPanelProps) => {
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState("");
  const [authorName, setAuthorName] = useState(() => localStorage.getItem("task-comment-author") || "");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(task.title);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState(task.description || "");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  // Sync state when task changes
  useEffect(() => {
    setEditedTitle(task.title);
    setEditedDescription(task.description || "");
    setIsEditingTitle(false);
    setIsEditingDescription(false);
  }, [task.id]);

  useEffect(() => {
    if (isEditingTitle) titleInputRef.current?.focus();
  }, [isEditingTitle]);

  useEffect(() => {
    if (isEditingDescription) descRef.current?.focus();
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
  });

  const { data: comments = [] } = useQuery({
    queryKey: ["task-comments", task.id],
    queryFn: () => fetchTaskComments(task.id),
  });

  const addCommentMutation = useMutation({
    mutationFn: (data: { task_id: string; author_name: string; content: string }) =>
      createTaskComment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-comments", task.id] });
      queryClient.invalidateQueries({ queryKey: ["task-comments-count", task.id] });
      setNewComment("");
    },
    onError: () => toast.error("Kunde inte lägga till kommentar"),
  });

  const deleteCommentMutation = useMutation({
    mutationFn: deleteTaskComment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-comments", task.id] });
      queryClient.invalidateQueries({ queryKey: ["task-comments-count", task.id] });
    },
    onError: () => toast.error("Kunde inte ta bort kommentar"),
  });

  const isOverdue = task.deadline && !task.completed && new Date(task.deadline) < new Date();
  const assignedStaff = staffMembers.find((s) => s.id === task.assigned_to);

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
    onUpdateTask({ id: task.id, updates: { deadline: date ? format(date, "yyyy-MM-dd") : null } });
    setDatePickerOpen(false);
  };

  const handleAssigneeChange = (staffId: string) => {
    onUpdateTask({ id: task.id, updates: { assigned_to: staffId === "none" ? null : staffId } });
    setAssigneeOpen(false);
  };

  const handleSubmitComment = () => {
    if (!newComment.trim()) return;
    const name = authorName.trim() || "Anonym";
    localStorage.setItem("task-comment-author", name);
    setAuthorName(name);
    addCommentMutation.mutate({ task_id: task.id, author_name: name, content: newComment.trim() });
  };

  const handleDelete = () => {
    onDeleteTask(task.id);
    onClose();
  };

  return (
    <div className="flex flex-col h-full border-l border-primary/15 bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-2 px-4 pt-4 pb-3 border-b border-border/30 shrink-0">
        {/* Complete toggle */}
        <button
          onClick={() => onUpdateTask({ id: task.id, updates: { completed: !task.completed } })}
          className={cn(
            "mt-0.5 shrink-0 transition-colors",
            task.completed ? "text-primary" : "text-border hover:text-muted-foreground"
          )}
        >
          {task.completed ? <CheckCircle2 className="h-4.5 w-4.5" /> : <Circle className="h-4.5 w-4.5" />}
        </button>

        {/* Title */}
        <div className="flex-1 min-w-0">
          {isEditingTitle ? (
            <Input
              ref={titleInputRef}
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleTitleSave();
                if (e.key === "Escape") { setEditedTitle(task.title); setIsEditingTitle(false); }
              }}
              className="text-sm font-semibold h-7 px-1.5 py-0 border-primary/50"
            />
          ) : (
            <button
              className="text-left w-full"
              onClick={() => { setEditedTitle(task.title); setIsEditingTitle(true); }}
            >
              <span className={cn(
                "text-sm font-semibold leading-snug block",
                task.completed && "line-through text-muted-foreground"
              )}>
                {task.title}
              </span>
              {task.is_info_only && (
                <span className="text-[9px] uppercase tracking-widest text-primary/70 font-bold">Milstolpe</span>
              )}
            </button>
          )}
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Metadata chips */}
        <div className="flex flex-wrap gap-1.5">
          {/* Deadline chip */}
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <button className={cn(
                "inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border font-medium transition-colors",
                isOverdue
                  ? "border-destructive/50 bg-destructive/8 text-destructive"
                  : task.deadline
                  ? "border-border bg-muted/50 text-foreground hover:bg-muted"
                  : "border-dashed border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
              )}>
                {isOverdue && <AlertTriangle className="h-3 w-3" />}
                <Calendar className="h-3 w-3" />
                {task.deadline
                  ? format(new Date(task.deadline), "d MMM", { locale: sv })
                  : "Deadline"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-card" align="start">
              <CalendarPicker
                mode="single"
                selected={task.deadline ? new Date(task.deadline) : undefined}
                onSelect={handleDeadlineChange}
                initialFocus
                className="p-3"
              />
              {task.deadline && (
                <div className="px-3 pb-3">
                  <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => handleDeadlineChange(undefined)}>
                    Ta bort datum
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Assignee chip */}
          <Popover open={assigneeOpen} onOpenChange={setAssigneeOpen}>
            <PopoverTrigger asChild>
              <button className={cn(
                "inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border font-medium transition-colors",
                assignedStaff
                  ? "border-border bg-muted/50 text-foreground hover:bg-muted"
                  : "border-dashed border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
              )}>
                <User className="h-3 w-3" />
                {assignedStaff ? assignedStaff.name : "Ansvarig"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-44 p-1 bg-card" align="start">
              <button
                className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
                onClick={() => handleAssigneeChange("none")}
              >
                Ingen
              </button>
              {staffMembers.map((s) => (
                <button
                  key={s.id}
                  className={cn(
                    "w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors",
                    task.assigned_to === s.id && "bg-primary/10 text-primary font-semibold"
                  )}
                  onClick={() => handleAssigneeChange(s.id)}
                >
                  {s.name}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          {/* Action button — e.g. "Öppna transportbokning" */}
          {onAction && (
            <button
              onClick={onAction}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-primary/40 bg-primary/8 text-primary font-medium hover:bg-primary/15 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Öppna transportbokning
            </button>
          )}
        </div>

        {/* Description */}
        {isEditingDescription ? (
          <div className="space-y-2">
            <Textarea
              ref={descRef}
              value={editedDescription}
              onChange={(e) => setEditedDescription(e.target.value)}
              onBlur={handleDescriptionSave}
              onKeyDown={(e) => { if (e.key === "Escape") setIsEditingDescription(false); }}
              placeholder="Lägg till beskrivning..."
              rows={3}
              className="text-xs resize-none bg-muted/30 border-border/50"
            />
            <div className="flex gap-1.5">
              <Button size="sm" className="h-6 text-xs px-2.5" onClick={handleDescriptionSave}>Spara</Button>
              <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setIsEditingDescription(false)}>Avbryt</Button>
            </div>
          </div>
        ) : (
          <button
            className="w-full text-left group"
            onClick={() => { setEditedDescription(task.description || ""); setIsEditingDescription(true); }}
          >
            {task.description ? (
              <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">{task.description}</p>
            ) : (
              <p className="text-xs text-muted-foreground/60 italic group-hover:text-muted-foreground transition-colors">
                Lägg till beskrivning...
              </p>
            )}
          </button>
        )}

        {/* Comments divider */}
        <div className="border-t border-border/30" />

        {/* Comments header */}
        <div className="flex items-center gap-1.5">
          <MessageSquare className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Kommentarer {comments.length > 0 && `· ${comments.length}`}
          </span>
        </div>

        {/* Comment list */}
        {comments.length > 0 && (
          <div className="space-y-3">
            {(comments as TaskComment[]).map((comment) => (
              <div key={comment.id} className="flex gap-2 group">
                <Avatar className="h-6 w-6 shrink-0 mt-0.5">
                  <AvatarFallback className="text-[9px] bg-primary/10 text-primary font-semibold">
                    {initials(comment.author_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[11px] font-semibold text-foreground">{comment.author_name}</span>
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
                  <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">{comment.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Author name input (only if not set) */}
        {!authorName && (
          <Input
            placeholder="Ditt namn..."
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            onBlur={() => authorName.trim() && localStorage.setItem("task-comment-author", authorName.trim())}
            className="h-7 text-xs"
          />
        )}

        {/* Comment input */}
        <div className="flex gap-2 items-end">
          <Avatar className="h-6 w-6 shrink-0 mb-0.5">
            <AvatarFallback className="text-[9px] bg-muted text-muted-foreground">
              {authorName ? initials(authorName) : "?"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 relative">
            <Textarea
              ref={commentRef}
              placeholder="Kommentar... (Enter skickar)"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitComment();
                }
              }}
              rows={2}
              className="text-xs resize-none pr-8 bg-muted/30 border-border/50"
            />
            <button
              onClick={handleSubmitComment}
              disabled={!newComment.trim()}
              className="absolute right-2 bottom-2 text-primary disabled:text-muted-foreground transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Footer — delete */}
      <div className="px-4 py-2 border-t border-border/20 shrink-0">
        <button
          onClick={handleDelete}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
        >
          <Trash2 className="h-3 w-3" />
          Ta bort uppgift
        </button>
      </div>
    </div>
  );
};

export default TaskDetailPanel;
