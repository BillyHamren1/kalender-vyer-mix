import { useState } from "react";
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
  AlertTriangle
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PackingTask, PackingTaskComment } from "@/types/packing";
import { fetchPackingTaskComments, createPackingTaskComment, deletePackingTaskComment } from "@/services/packingTaskCommentService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PackingTaskDetailSheetProps {
  task: PackingTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateTask: (data: { id: string; updates: Partial<PackingTask> }) => void;
  onDeleteTask: (id: string) => void;
}

const PackingTaskDetailSheet = ({ task, open, onOpenChange, onUpdateTask, onDeleteTask }: PackingTaskDetailSheetProps) => {
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [editedDeadline, setEditedDeadline] = useState("");
  const [editedAssignee, setEditedAssignee] = useState("");

  // Fetch staff members for assignment dropdown
  const { data: staffMembers = [] } = useQuery({
    queryKey: ['staff-members-list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('staff_members')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      return data || [];
    },
    enabled: open
  });

  // Fetch comments for this task
  const { data: comments = [] } = useQuery({
    queryKey: ['packing-task-comments', task?.id],
    queryFn: () => fetchPackingTaskComments(task!.id),
    enabled: !!task?.id && open
  });

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: (data: { task_id: string; author_name: string; content: string }) => 
      createPackingTaskComment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packing-task-comments', task?.id] });
      setNewComment("");
      toast.success('Kommentar tillagd');
    },
    onError: () => toast.error('Kunde inte lägga till kommentar')
  });

  // Delete comment mutation
  const deleteCommentMutation = useMutation({
    mutationFn: deletePackingTaskComment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packing-task-comments', task?.id] });
      toast.success('Kommentar borttagen');
    },
    onError: () => toast.error('Kunde inte ta bort kommentar')
  });

  if (!task) return null;

  const isOverdue = task.deadline && !task.completed && new Date(task.deadline) < new Date();
  const assignedStaff = staffMembers.find(s => s.id === task.assigned_to);

  const handleToggleComplete = () => {
    onUpdateTask({ id: task.id, updates: { completed: !task.completed } });
  };

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !authorName.trim()) return;
    
    addCommentMutation.mutate({
      task_id: task.id,
      author_name: authorName.trim(),
      content: newComment.trim()
    });
  };

  const handleStartEdit = () => {
    setEditedTitle(task.title);
    setEditedDescription(task.description || "");
    setEditedDeadline(task.deadline || "");
    setEditedAssignee(task.assigned_to || "");
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    onUpdateTask({
      id: task.id,
      updates: {
        title: editedTitle.trim(),
        description: editedDescription.trim() || null,
        deadline: editedDeadline || null,
        assigned_to: editedAssignee && editedAssignee !== "none" ? editedAssignee : null
      }
    });
    setIsEditing(false);
    toast.success('Uppgift uppdaterad');
  };

  const handleDelete = () => {
    onDeleteTask(task.id);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader className="pb-4">
          <div className="flex items-start justify-between">
            <SheetTitle className="text-left pr-8">
              {isEditing ? (
                <Input 
                  value={editedTitle} 
                  onChange={(e) => setEditedTitle(e.target.value)}
                  className="font-semibold text-lg"
                />
              ) : (
                <span className={cn(task.completed && "line-through text-muted-foreground")}>
                  {task.title}
                </span>
              )}
            </SheetTitle>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 pb-6">
            {/* Status & Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant={task.completed ? "default" : "outline"}
                size="sm"
                onClick={handleToggleComplete}
                className="gap-2"
              >
                {task.completed ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
                {task.completed ? "Klar" : "Markera som klar"}
              </Button>
              
              {!isEditing && (
                <Button variant="outline" size="sm" onClick={handleStartEdit}>
                  Redigera
                </Button>
              )}
              
              {isEditing && (
                <>
                  <Button size="sm" onClick={handleSaveEdit}>
                    Spara
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                    Avbryt
                  </Button>
                </>
              )}
            </div>

            {/* Info badges */}
            <div className="flex flex-wrap gap-2">
              {task.deadline && (
                <Badge variant={isOverdue ? "destructive" : "secondary"} className="gap-1">
                  {isOverdue && <AlertTriangle className="h-3 w-3" />}
                  <Calendar className="h-3 w-3" />
                  {format(new Date(task.deadline), 'd MMM yyyy', { locale: sv })}
                </Badge>
              )}
              {assignedStaff && (
                <Badge variant="secondary" className="gap-1">
                  <User className="h-3 w-3" />
                  {assignedStaff.name}
                </Badge>
              )}
              {task.is_info_only && (
                <Badge variant="outline">Info-punkt</Badge>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">Beskrivning</Label>
              {isEditing ? (
                <Textarea
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  placeholder="Lägg till en beskrivning..."
                  rows={4}
                />
              ) : (
                <p className="text-sm">
                  {task.description || <span className="text-muted-foreground italic">Ingen beskrivning</span>}
                </p>
              )}
            </div>

            {/* Edit fields when editing */}
            {isEditing && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Ansvarig</Label>
                  <Select value={editedAssignee} onValueChange={setEditedAssignee}>
                    <SelectTrigger>
                      <SelectValue placeholder="Välj person" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Ingen</SelectItem>
                      {staffMembers.map(staff => (
                        <SelectItem key={staff.id} value={staff.id}>
                          {staff.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Deadline</Label>
                  <Input
                    type="date"
                    value={editedDeadline}
                    onChange={(e) => setEditedDeadline(e.target.value)}
                  />
                </div>
              </div>
            )}

            <Separator />

            {/* Comments section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                <h3 className="font-medium">Kommentarer ({comments.length})</h3>
              </div>

              {/* Comment list */}
              <div className="space-y-3">
                {comments.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    Inga kommentarer ännu
                  </p>
                ) : (
                  comments.map((comment: PackingTaskComment) => (
                    <div 
                      key={comment.id} 
                      className="flex gap-3 p-3 rounded-lg bg-muted/50 group"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {comment.author_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">{comment.author_name}</p>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(comment.created_at), 'd MMM HH:mm', { locale: sv })}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => deleteCommentMutation.mutate(comment.id)}
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-sm mt-1 whitespace-pre-wrap">{comment.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Add comment form */}
              <form onSubmit={handleSubmitComment} className="space-y-3">
                <div className="space-y-2">
                  <Input
                    placeholder="Ditt namn"
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Skriv en kommentar..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    rows={2}
                    className="flex-1"
                  />
                  <Button 
                    type="submit" 
                    size="icon"
                    disabled={!newComment.trim() || !authorName.trim() || addCommentMutation.isPending}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            </div>

            <Separator />

            {/* Meta info */}
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Skapad: {format(new Date(task.created_at), 'd MMM yyyy HH:mm', { locale: sv })}
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Uppdaterad: {format(new Date(task.updated_at), 'd MMM yyyy HH:mm', { locale: sv })}
              </div>
            </div>

            {/* Delete button */}
            <Button 
              variant="destructive" 
              className="w-full"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Ta bort uppgift
            </Button>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default PackingTaskDetailSheet;
