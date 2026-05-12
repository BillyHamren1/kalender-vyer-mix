import { useState, useEffect } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Wand2 } from "lucide-react";

interface GroupProductsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPrompt?: string;
  productCount: number;
  isGenerating: boolean;
  onGenerate: (prompt: string) => void;
  /** Befintliga grupper — finns de visas redigeringsläge med kommandon */
  currentGroups?: { name: string; product_ids: string[] }[];
}

const QUICK_COMMANDS = [
  "Slå ihop … och … till …",
  "Ta bort gruppen …",
  "Döp om … till …",
  "Flytta alla … till …",
  "Dela upp … i … och …",
];

export const GroupProductsDialog = ({
  open,
  onOpenChange,
  initialPrompt,
  productCount,
  isGenerating,
  onGenerate,
  currentGroups,
}: GroupProductsDialogProps) => {
  const isEdit = !!currentGroups && currentGroups.length > 0;
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    if (open) setPrompt(isEdit ? "" : initialPrompt || "");
  }, [open, isEdit, initialPrompt]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? <Wand2 className="w-5 h-5 text-primary" /> : <Sparkles className="w-5 h-5 text-primary" />}
            {isEdit ? "Ändra gruppering med AI" : "Gruppera produkter med AI"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Ge AI:n en instruktion — t.ex. slå ihop, döp om, ta bort eller flytta. ${productCount} produkter i ${currentGroups!.length} grupper.`
              : `Skriv hur du vill att AI:n ska dela in ${productCount} produkter i kategorier.`}
          </DialogDescription>
        </DialogHeader>

        {isEdit && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Nuvarande grupper</p>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {currentGroups!.map((g) => (
                <Badge key={g.name} variant="secondary" className="text-xs">
                  {g.name} <span className="ml-1 opacity-60">({g.product_ids.length})</span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              isEdit
                ? "Exempel:\nSlå ihop Ljud och Video till AV\nTa bort gruppen Övrigt och fördela produkterna\nDöp om Möbler till Inredning"
                : "Exempel:\nGruppera per: Ljud, Ljus, Video, Rigg, Kabel, Övrigt"
            }
            rows={6}
            className="resize-none"
          />
          {isEdit ? (
            <div className="flex flex-wrap gap-1">
              {QUICK_COMMANDS.map((cmd) => (
                <button
                  key={cmd}
                  type="button"
                  onClick={() => setPrompt((p) => (p ? `${p}\n${cmd}` : cmd))}
                  className="text-[11px] px-2 py-0.5 rounded border border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  {cmd}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Lämna tomt så föreslår AI:n själv lämpliga kategorier.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
            Avbryt
          </Button>
          <Button
            onClick={() => onGenerate(prompt)}
            disabled={isGenerating || (isEdit && !prompt.trim())}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isEdit ? "Uppdaterar…" : "Grupperar…"}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                {isEdit ? "Utför" : "Gruppera"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
