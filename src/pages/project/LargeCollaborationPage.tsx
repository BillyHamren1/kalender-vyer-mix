import { useOutletContext, useLocation } from "react-router-dom";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, Send, FileText, Bell, ListChecks } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import type { useLargeProjectDetail } from "@/hooks/useLargeProjectDetail";
import type { ProjectComment } from "@/types/project";

const ChatMessages = ({
  comments,
  onAddComment,
}: {
  comments: ProjectComment[];
  onAddComment?: (data: { author_name: string; content: string }) => void;
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [authorName, setAuthorName] = useState(() =>
    localStorage.getItem("project_comment_author") || ""
  );
  const [content, setContent] = useState("");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!authorName.trim() || !content.trim() || !onAddComment) return;
    localStorage.setItem("project_comment_author", authorName.trim());
    onAddComment({ author_name: authorName.trim(), content: content.trim() });
    setContent("");
  };

  const sorted = [...comments].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return (
    <div className="flex flex-col h-[calc(100vh-320px)] min-h-[400px]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 px-1 py-2">
        {sorted.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center p-8 h-full">
            <div>
              <div className="h-12 w-12 rounded-xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                <MessageSquare className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <p className="text-sm text-muted-foreground">Inga meddelanden ännu</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Skriv ett meddelande nedan för att starta en konversation
              </p>
            </div>
          </div>
        ) : (
          sorted.map((msg) => (
            <div key={msg.id} className="px-3 py-2 rounded-lg bg-muted/30 border border-border/20">
              <div className="flex items-baseline justify-between gap-2 mb-0.5">
                <span className="text-sm font-semibold text-foreground truncate">
                  {msg.author_name}
                </span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(msg.created_at), "d MMM HH:mm", { locale: sv })}
                </span>
              </div>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words leading-relaxed">
                {msg.content}
              </p>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-border/40 pt-3 pb-1 space-y-2">
        {!authorName && (
          <Input
            placeholder="Ditt namn"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            className="h-9 text-sm"
          />
        )}
        <div className="flex gap-2">
          <Textarea
            placeholder="Skriv ett meddelande..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={2}
            className="flex-1 min-h-[40px] max-h-[120px] text-sm resize-none py-2"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            className="h-10 w-10 shrink-0"
            disabled={!authorName.trim() || !content.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {authorName && (
          <button
            type="button"
            onClick={() => setAuthorName("")}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Byt namn ({authorName})
          </button>
        )}
      </form>
    </div>
  );
};

const LargeCollaborationPage = () => {
  const detail = useOutletContext<ReturnType<typeof useLargeProjectDetail>>();
  const { comments, addComment, project } = detail;
  const location = useLocation();

  const [linkedTaskRef, setLinkedTaskRef] = useState<{ taskId: string; taskTitle: string } | null>(null);

  // Pick up linkedTaskRef from navigation state (e.g. from LargeEstablishmentPage)
  useEffect(() => {
    const navRef = (location.state as any)?.linkedTaskRef;
    if (navRef?.taskId) {
      setLinkedTaskRef(navRef);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  return (
    <Card className="border-border/50 shadow-sm">
      <div className="p-4 sm:p-6">
        <Tabs defaultValue="chat" className="w-full">
          <TabsList className="w-full max-w-md h-9 p-0.5 bg-muted/50">
            <TabsTrigger value="chat" className="flex-1 text-sm h-8 data-[state=active]:shadow-sm gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" />
              Chatt
              {(comments?.length ?? 0) > 0 && (
                <span className="text-[10px] bg-primary/10 text-primary px-1.5 rounded-full">
                  {comments?.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex-1 text-sm h-8 data-[state=active]:shadow-sm gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Noteringar
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex-1 text-sm h-8 data-[state=active]:shadow-sm gap-1.5">
              <Bell className="h-3.5 w-3.5" />
              Aktivitet
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="mt-4">
            <ChatMessages comments={comments || []} onAddComment={addComment} />
          </TabsContent>

          <TabsContent value="notes" className="mt-4">
            <div className="flex items-center justify-center h-[calc(100vh-320px)] min-h-[400px] text-center p-8">
              <div>
                <div className="h-12 w-12 rounded-xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                  <FileText className="h-6 w-6 text-muted-foreground/50" />
                </div>
                <p className="text-sm text-muted-foreground">Projektnoteringar</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Kommer snart</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <div className="flex items-center justify-center h-[calc(100vh-320px)] min-h-[400px] text-center p-8">
              <div>
                <div className="h-12 w-12 rounded-xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                  <Bell className="h-6 w-6 text-muted-foreground/50" />
                </div>
                <p className="text-sm text-muted-foreground">Aktivitetslogg</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Kommer snart</p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Card>
  );
};

export default LargeCollaborationPage;
