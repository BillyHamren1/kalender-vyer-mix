import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";

interface GroupProductsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPrompt?: string;
  productCount: number;
  isGenerating: boolean;
  onGenerate: (prompt: string) => void;
}

export const GroupProductsDialog = ({
  open,
  onOpenChange,
  initialPrompt,
  productCount,
  isGenerating,
  onGenerate,
}: GroupProductsDialogProps) => {
  const [prompt, setPrompt] = useState(initialPrompt || "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Gruppera produkter med AI
          </DialogTitle>
          <DialogDescription>
            Skriv hur du vill att AI:n ska dela in {productCount} produkter i kategorier. Du kan
            efteråt flytta produkter mellan grupper, döpa om eller lägga till egna.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={`Exempel:\nGruppera per: Ljud, Ljus, Video, Rigg, Kabel, Övrigt`}
            rows={6}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            Lämna tomt så föreslår AI:n själv lämpliga kategorier.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
            Avbryt
          </Button>
          <Button onClick={() => onGenerate(prompt)} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Grupperar...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Gruppera
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
