import { useState, useRef, useEffect } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Send, ChevronRight, ChevronLeft, FileText, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import type { ProjectComment } from "@/types/project";

interface CollaborationPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  comments?: ProjectComment[];
  onAddComment?: (data: { author_name: string; content: string }) => void;
}

const ChatMessages = ({
  comments,
  onAddComment,
  height,
}: {
  comments: ProjectComment[];
  onAddComment?: (data: { author_name: string; content: string }) => void;
  height?: string;
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [authorName, setAuthorName] = useState(() =>
    localStorage.getItem("project_comment_author") || ""
  );
  const [content, setContent] = useState("");

  // Auto-scroll to bottom on new messages
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
    <div className={cn("flex flex-col", height || "h-[calc(100vh-380px)] min-h-[300px]")}>
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 px-1 py-2">
        {sorted.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center p-4 h-full">
            <div>
              <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center mx-auto mb-2">
                <MessageSquare className="h-5 w-5 text-muted-foreground/50" />
              </div>
              <p className="text-xs text-muted-foreground">Inga meddelanden ännu</p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                Skriv ett meddelande nedan
              </p>
            </div>
          </div>
        ) : (
          sorted.map((msg) => (
            <div key={msg.id} className="px-2 py-1.5 rounded-lg bg-muted/30 border border-border/20">
              <div className="flex items-baseline justify-between gap-2 mb-0.5">
                <span className="text-xs font-semibold text-foreground truncate">
                  {msg.author_name}
                </span>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {format(new Date(msg.created_at), "d MMM HH:mm", { locale: sv })}
                </span>
              </div>
              <p className="text-xs text-foreground/90 whitespace-pre-wrap break-words leading-relaxed">
                {msg.content}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Input area */}
      <form onSubmit={handleSubmit} className="border-t border-border/40 pt-2 pb-1 space-y-1.5">
        {!authorName && (
          <Input
            placeholder="Ditt namn"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            className="h-7 text-xs"
          />
        )}
        <div className="flex gap-1.5">
          <Textarea
            placeholder="Skriv ett meddelande..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={1}
            className="flex-1 min-h-[32px] max-h-[80px] text-xs resize-none py-1.5"
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
            className="h-8 w-8 shrink-0"
            disabled={!authorName.trim() || !content.trim()}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
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

const CollaborationPanel = ({ collapsed, onToggle, comments = [], onAddComment }: CollaborationPanelProps) => {
  const unread = 0; // Future: track unread state

  return (
    <>
      {/* Desktop panel */}
      <div
        className={cn(
          "transition-all duration-300 ease-in-out shrink-0 hidden lg:block",
          collapsed ? "w-12" : "w-80"
        )}
      >
        {collapsed ? (
          <div className="h-full flex flex-col items-center pt-2">
            <Button variant="ghost" size="icon" onClick={onToggle} className="h-9 w-9 rounded-xl">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="mt-4 flex flex-col gap-3 items-center">
              <button onClick={onToggle} className="relative h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors">
                <MessageSquare className="h-4 w-4 text-primary" />
                {comments.length > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[9px] text-primary-foreground flex items-center justify-center font-medium">
                    {comments.length > 99 ? "99" : comments.length}
                  </span>
                )}
              </button>
              <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center relative">
                <Bell className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </div>
        ) : (
          <Card className="h-full border-border/50 shadow-sm flex flex-col">
            <CardHeader className="pb-2 px-4 pt-3 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold">Samarbete</CardTitle>
              <Button variant="ghost" size="icon" onClick={onToggle} className="h-7 w-7 rounded-lg">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </CardHeader>

            <div className="px-4 pb-2 flex-1 flex flex-col min-h-0">
              <Tabs defaultValue="chat" className="w-full flex flex-col flex-1 min-h-0">
                <TabsList className="w-full h-8 p-0.5 bg-muted/50 shrink-0">
                  <TabsTrigger value="chat" className="flex-1 text-xs h-7 data-[state=active]:shadow-sm">
                    <MessageSquare className="h-3 w-3 mr-1" />
                    Chatt
                    {comments.length > 0 && (
                      <span className="ml-1 text-[9px] bg-primary/10 text-primary px-1 rounded-full">
                        {comments.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="notes" className="flex-1 text-xs h-7 data-[state=active]:shadow-sm">
                    <FileText className="h-3 w-3 mr-1" />
                    Noteringar
                  </TabsTrigger>
                  <TabsTrigger value="activity" className="flex-1 text-xs h-7 data-[state=active]:shadow-sm">
                    <Bell className="h-3 w-3 mr-1" />
                    Aktivitet
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="chat" className="mt-2 flex-1 min-h-0">
                  <ChatMessages comments={comments} onAddComment={onAddComment} />
                </TabsContent>

                <TabsContent value="notes" className="mt-2">
                  <div className="flex items-center justify-center h-[calc(100vh-380px)] min-h-[300px] text-center p-4">
                    <div>
                      <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center mx-auto mb-2">
                        <FileText className="h-5 w-5 text-muted-foreground/50" />
                      </div>
                      <p className="text-xs text-muted-foreground">Projektnoteringar</p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="activity" className="mt-2">
                  <div className="flex items-center justify-center h-[calc(100vh-380px)] min-h-[300px] text-center p-4">
                    <div>
                      <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center mx-auto mb-2">
                        <Bell className="h-5 w-5 text-muted-foreground/50" />
                      </div>
                      <p className="text-xs text-muted-foreground">Aktivitetslogg</p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </Card>
        )}
      </div>

      {/* Mobile: floating chat button + sheet */}
      <div className="lg:hidden fixed bottom-4 right-4 z-50">
        <Sheet>
          <SheetTrigger asChild>
            <Button size="icon" className="h-12 w-12 rounded-full shadow-lg relative">
              <MessageSquare className="h-5 w-5" />
              {comments.length > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-[10px] text-destructive-foreground flex items-center justify-center font-medium">
                  {comments.length > 99 ? "99" : comments.length}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[340px] sm:w-[380px] p-4">
            <h3 className="text-sm font-semibold mb-3">Projektchatt</h3>
            <ChatMessages
              comments={comments}
              onAddComment={onAddComment}
              height="h-[calc(100vh-120px)]"
            />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
};

export default CollaborationPanel;
