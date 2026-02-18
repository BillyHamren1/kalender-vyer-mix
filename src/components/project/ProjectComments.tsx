import { useState } from "react";
import { Send, MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ProjectComment } from "@/types/project";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

interface ProjectCommentsProps {
  comments: ProjectComment[];
  onAddComment: (data: { author_name: string; content: string }) => void;
  className?: string;
}

const ProjectComments = ({ comments, onAddComment, className }: ProjectCommentsProps) => {
  const [authorName, setAuthorName] = useState(() => 
    localStorage.getItem('project_comment_author') || ''
  );
  const [content, setContent] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!authorName.trim() || !content.trim()) return;

    localStorage.setItem('project_comment_author', authorName.trim());
    onAddComment({ 
      author_name: authorName.trim(), 
      content: content.trim() 
    });
    setContent("");
  };

  return (
    <Card className={`border-border/40 shadow-2xl rounded-2xl${className ? ` ${className}` : ''}`}>
      <CardHeader>
        <CardTitle className="tracking-tight">Kommentarer</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Comments list */}
        {comments.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">
              Inga kommentarer ännu
            </p>
          </div>
        ) : (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {comments.map(comment => (
              <div key={comment.id} className="p-3 rounded-xl bg-muted/30 border border-border/30">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">{comment.author_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(comment.created_at), "d MMM 'kl.' HH:mm", { locale: sv })}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
              </div>
            ))}
          </div>
        )}

        {/* Add comment form */}
        <form onSubmit={handleSubmit} className="space-y-3 pt-4 border-t border-border/40">
          <div className="flex gap-2">
            <Input
              placeholder="Ditt namn"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              className="max-w-[200px]"
            />
          </div>
          <div className="flex gap-2">
            <Textarea
              placeholder="Lägg till interna anteckningar"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={2}
              className="flex-1"
            />
            <Button 
              type="submit" 
              size="icon"
              disabled={!authorName.trim() || !content.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default ProjectComments;
