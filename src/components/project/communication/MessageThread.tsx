import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { ProjectMessage } from "@/types/projectMessage";

interface MessageThreadProps {
  messages: ProjectMessage[];
  isLoading: boolean;
  isSending: boolean;
  onSend: (message: string) => void;
  emptyText?: string;
  placeholder?: string;
}

const MessageThread = ({
  messages,
  isLoading,
  isSending,
  onSend,
  emptyText = "Inga meddelanden ännu",
  placeholder = "Skriv ett meddelande...",
}: MessageThreadProps) => {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 min-h-0 px-4 py-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Laddar...</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">{emptyText}</p>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className="flex gap-3 group">
                <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                    {getInitials(msg.sender_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {msg.sender_name}
                    </span>
                    <span className="text-[11px] text-muted-foreground/70">
                      {format(new Date(msg.created_at), "d MMM HH:mm", { locale: sv })}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed mt-0.5">
                    {msg.message}
                  </p>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border/40 p-3 flex gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="min-h-[40px] max-h-[120px] resize-none text-sm"
          rows={1}
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!draft.trim() || isSending}
          className="shrink-0 h-10 w-10"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default MessageThread;
