import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Sparkles, Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ProductTagEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  importedTags: string[]; // from booking_products.tags (read-only)
  localTags: string[];    // from booking_products.local_tags (editable)
  vocabulary: string;     // controlled tag vocabulary (comma/newline separated)
  onSaved: (newLocalTags: string[]) => void;
}

const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ").slice(0, 30);

export const ProductTagEditorDialog = ({
  open, onOpenChange, productId, productName,
  importedTags, localTags, vocabulary, onSaved,
}: ProductTagEditorDialogProps) => {
  const [tags, setTags] = useState<string[]>(localTags);
  const [input, setInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const allCurrent = new Set([...importedTags.map(norm), ...tags.map(norm)]);

  const vocabList = vocabulary
    .split(/[,\n]/).map((t) => norm(t)).filter(Boolean);

  const addTag = (raw: string) => {
    const t = norm(raw);
    if (!t) return;
    if (allCurrent.has(t)) return;
    setTags((prev) => Array.from(new Set([...prev, t])));
  };

  const removeTag = (t: string) => setTags((prev) => prev.filter((x) => x !== t));

  const handleAi = async () => {
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-product-tags", {
        body: {
          products: [{ id: productId, name: productName }],
          instructions: vocabulary,
        },
      });
      if (error) throw error;
      const sug = (data?.suggestions?.[0]?.tags as string[]) || [];
      if (sug.length === 0) {
        toast.info("AI hittade ingen passande tagg.");
      } else {
        sug.forEach(addTag);
        toast.success(`AI föreslog: ${sug.join(", ")}`);
      }
    } catch (e: any) {
      const msg = e?.context?.error || e?.message || "AI-förslag misslyckades";
      toast.error(msg);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("booking_products")
        .update({ local_tags: tags })
        .eq("id", productId);
      if (error) throw error;
      onSaved(tags);
      toast.success("Taggar sparade");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte spara");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tagga produkt</DialogTitle>
          <DialogDescription className="truncate">{productName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {importedTags.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Från Booking (kan ej ändras här)</div>
              <div className="flex flex-wrap gap-1.5">
                {importedTags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Manuella taggar</div>
            <div className="flex flex-wrap gap-1.5 min-h-[28px]">
              {tags.length === 0 && (
                <span className="text-xs text-muted-foreground italic">Inga manuella taggar än</span>
              )}
              {tags.map((t) => (
                <Badge key={t} variant="default" className="text-xs gap-1">
                  {t}
                  <button onClick={() => removeTag(t)} className="hover:opacity-70">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Lägg till tagg…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag(input);
                  setInput("");
                }
              }}
              list="tag-vocab"
            />
            <datalist id="tag-vocab">
              {vocabList.map((t) => <option key={t} value={t} />)}
            </datalist>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => { addTag(input); setInput(""); }}
              disabled={!input.trim()}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleAi}
            disabled={aiLoading}
          >
            {aiLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Föreslå med AI
          </Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
