import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { MessageSquare, Send, Pencil, Trash2, X, Check, AtSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  fetchEstablishmentTaskComments,
  createEstablishmentTaskComment,
  updateEstablishmentTaskComment,
  deleteEstablishmentTaskComment,
} from "@/services/establishmentTaskCommentService";
import { toast } from "sonner";

interface TaskCommentThreadProps {
  taskId: string;
  staffPool: Array<{ id: string; name: string }>;
}

const TaskCommentThread = ({ taskId, staffPool }: TaskCommentThreadProps) => {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [content, setContent] = useState("");
  const [authorName, setAuthorName] = useState(() =>
    localStorage.getItem("task_comment_author") || ""
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [showMentionPopover, setShowMentionPopover] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");

  const { data: comments = [] } = useQuery({
    queryKey: ["establishment-task-comments", taskId],
    queryFn: () => fetchEstablishmentTaskComments(taskId),
    enabled: !!taskId,
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments.length]);

  const createMutation = useMutation({
    mutationFn: createEstablishmentTaskComment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["establishment-task-comments", taskId] });
      queryClient.invalidateQueries({ queryKey: ["establishment-task-comment-counts"] });
      setContent("");
    },
    onError: () => toast.error("Kunde inte skicka kommentar"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      updateEstablishmentTaskComment(id, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["establishment-task-comments", taskId] });
      setEditingId(null);
    },
    onError: () => toast.error("Kunde inte uppdatera kommentar"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEstablishmentTaskComment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["establishment-task-comments", taskId] });
      queryClient.invalidateQueries({ queryKey: ["establishment-task-comment-counts"] });
    },
    onError: () => toast.error("Kunde inte ta bort kommentar"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !authorName.trim()) return;
    localStorage.setItem("task_comment_author", authorName.trim());
    createMutation.mutate({
      task_id: taskId,
      author_name: authorName.trim(),
      content: content.trim(),
    });
  };

  const handleContentChange = (value: string) => {
    setContent(value);
    // Detect @ mentions
    const lastAt = value.lastIndexOf("@");
    if (lastAt !== -1) {
      const afterAt = value.slice(lastAt + 1);
      if (!afterAt.includes(" ") && afterAt.length < 20) {
        setMentionFilter(afterAt.toLowerCase());
        setShowMentionPopover(true);
        return;
      }
    }
    setShowMentionPopover(false);
  };

  const insertMention = (name: string) => {
    const lastAt = content.lastIndexOf("@");
    if (lastAt !== -1) {
      setContent(content.slice(0, lastAt) + `@${name} `);
    }
    setShowMentionPopover(false);
    textareaRef.current?.focus();
  };

  const filteredStaff = staffPool.filter(s =>
    s.name.toLowerCase().includes(mentionFilter)
  );

  const renderContent = (text: string) => {
    // Highlight @mentions
    const parts = text.split(/(@\S+)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        const mentionName = part.slice(1);
        const isStaff = staffPool.some(
          s => s.name.toLowerCase() === mentionName.toLowerCase() ||
               s.name.split(" ")[0].toLowerCase() === mentionName.toLowerCase()
        );
        return (
          <span key={i} className={cn(
            "font-semibold",
            isStaff ? "text-primary" : "text-foreground"
          )}>
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          Kommentarer {comments.length > 0 && `(${comments.length})`}
        </span>
      </div>

      {/* Comment list */}
      <div ref={scrollRef} className="max-h-[240px] overflow-y-auto space-y-2">
        {comments.length === 0 ? (
          <p className="text-xs text-muted-foreground/60 py-3 text-center">
            Inga kommentarer ännu. Skriv en kommentar nedan.
          </p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="group rounded-lg bg-muted/30 border border-border/20 px-3 py-2">
              <div className="flex items-baseline justify-between gap-2 mb-0.5">
                <span className="text-xs font-semibold text-foreground truncate">
                  {comment.author_name}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(comment.created_at), "d MMM HH:mm", { locale: sv })}
                  </span>
                  {comment.updated_at !== comment.created_at && (
                    <span className="text-[9px] text-muted-foreground/50">(redigerad)</span>
                  )}
                  <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity">
                    <button
                      onClick={() => {
                        setEditingId(comment.id);
                        setEditContent(comment.content);
                      }}
                      className="p-0.5 rounded hover:bg-muted transition-colors"
                    >
                      <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(comment.id)}
                      className="p-0.5 rounded hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-2.5 w-2.5 text-destructive" />
                    </button>
                  </div>
                </div>
              </div>
              {editingId === comment.id ? (
                <div className="space-y-1.5">
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="min-h-[40px] text-xs resize-none"
                    autoFocus
                  />
                  <div className="flex gap-1 justify-end">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => updateMutation.mutate({ id: comment.id, content: editContent.trim() })}
                      disabled={!editContent.trim()}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-foreground/90 whitespace-pre-wrap break-words leading-relaxed">
                  {renderContent(comment.content)}
                </p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="space-y-1.5">
        {!authorName && (
          <input
            placeholder="Ditt namn"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            className="w-full h-7 text-xs rounded-md border border-input bg-background px-2 outline-none focus:ring-1 focus:ring-ring"
          />
        )}
        <div className="relative">
          <Textarea
            ref={textareaRef}
            placeholder="Skriv en kommentar... (@ för att nämna)"
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            rows={1}
            className="min-h-[32px] max-h-[80px] text-xs resize-none pr-16 py-1.5"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <div className="absolute right-1 bottom-1 flex items-center gap-0.5">
            <Popover open={showMentionPopover} onOpenChange={setShowMentionPopover}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => {
                    setContent(content + "@");
                    setMentionFilter("");
                    setShowMentionPopover(true);
                    textareaRef.current?.focus();
                  }}
                >
                  <AtSign className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-1" align="end" side="top">
                <div className="max-h-[160px] overflow-y-auto">
                  {filteredStaff.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-2">Ingen match</p>
                  ) : (
                    filteredStaff.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => insertMention(s.name)}
                        className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors"
                      >
                        {s.name}
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
            <Button
              type="submit"
              size="icon"
              className="h-6 w-6"
              disabled={!content.trim() || !authorName.trim()}
            >
              <Send className="h-3 w-3" />
            </Button>
          </div>
        </div>
        {authorName && (
          <button
            type="button"
            onClick={() => setAuthorName("")}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Byt namn ({authorName})
          </button>
        )}
      </form>
    </div>
  );
};

export default TaskCommentThread;
