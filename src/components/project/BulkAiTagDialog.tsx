import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Sparkles, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UntaggedProduct {
  id: string;
  name: string;
}

interface BulkAiTagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  untagged: UntaggedProduct[];
  defaultVocabulary: string;
  onApplied: (applied: Record<string, string[]>) => void;
}

const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ").slice(0, 30);

export const BulkAiTagDialog = ({
  open, onOpenChange, untagged, defaultVocabulary, onApplied,
}: BulkAiTagDialogProps) => {
  const [vocab, setVocab] = useState(defaultVocabulary);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<Record<string, string[]>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const hasResults = Object.keys(results).length > 0;

  const runAi = async () => {
    if (untagged.length === 0) return;
    setRunning(true);
    setResults({});
    setSelected(new Set());
    try {
      // Process in chunks of 30 to keep payloads reasonable
      const chunks: UntaggedProduct[][] = [];
      for (let i = 0; i < untagged.length; i += 30) chunks.push(untagged.slice(i, i + 30));

      const merged: Record<string, string[]> = {};
      for (const [idx, chunk] of chunks.entries()) {
        const { data, error } = await supabase.functions.invoke("suggest-product-tags", {
          body: {
            products: chunk,
            instructions: vocab,
          },
        });
        if (error) throw error;
        const sug = (data?.suggestions as Array<{ id: string; tags: string[] }>) || [];
        for (const s of sug) {
          if (s.tags && s.tags.length > 0) merged[s.id] = s.tags;
        }
        toast.message(`AI klar med batch ${idx + 1}/${chunks.length}`);
      }
      setResults(merged);
      setSelected(new Set(Object.keys(merged)));
      toast.success(`AI föreslog taggar för ${Object.keys(merged).length} av ${untagged.length} produkter`);
    } catch (e: any) {
      const msg = e?.context?.error || e?.message || "AI-körning misslyckades";
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  };

  const toggleSel = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const applySelected = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setSaving(true);
    try {
      // Update one by one (small enough sets, RLS-safe)
      for (const id of ids) {
        const tags = results[id];
        if (!tags) continue;
        const { error } = await supabase
          .from("booking_products")
          .update({ local_tags: tags })
          .eq("id", id);
        if (error) throw error;
      }
      const applied: Record<string, string[]> = {};
      for (const id of ids) applied[id] = results[id];
      onApplied(applied);
      toast.success(`Sparade taggar för ${ids.length} produkter`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte spara alla");
    } finally {
      setSaving(false);
    }
  };

  const productMap = useMemo(() => new Map(untagged.map((p) => [p.id, p])), [untagged]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,56rem)] max-w-none overflow-hidden p-0 sm:max-h-[88vh]">
        <DialogHeader className="border-b px-6 py-5 pr-12">
          <DialogTitle>Tagga otaggade produkter med AI</DialogTitle>
          <DialogDescription>
            {untagged.length} produkter saknar tagg. Skriv fritt vad AI:n ska tänka på — t.ex. "Tagga möbler som möbler", "2EL räknas som EL", "Behandla allt med 'duk' i namnet som tält".
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 py-5">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Instruktioner till AI:n (valfritt)</div>
            <Textarea
              value={vocab}
              onChange={(e) => setVocab(e.target.value)}
              placeholder={'Lämna tomt för auto-klassning, eller skriv egna regler:\n\nTagga alla möbler som "möbler".\n2EL räknas som "el".\nAllt med "kabel" i namnet → "kabel".'}
              rows={5}
              disabled={running}
            />
          </div>

          {!hasResults ? (
            <Button onClick={runAi} disabled={running} className="w-full">
              {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Kör AI på {untagged.length} produkter
            </Button>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">Förslag ({Object.keys(results).length})</div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(Object.keys(results)))}>
                    Markera alla
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                    Avmarkera
                  </Button>
                </div>
              </div>
              <ScrollArea className="h-[min(42vh,24rem)] rounded-md border border-border/50 bg-background/40 p-2">
                <div className="space-y-1">
                  {Object.entries(results).map(([id, tags]) => {
                    const p = productMap.get(id);
                    if (!p) return null;
                    return (
                      <label
                        key={id}
                        className="flex items-start gap-2 p-2 rounded hover:bg-muted/40 cursor-pointer"
                      >
                        <Checkbox
                          checked={selected.has(id)}
                          onCheckedChange={() => toggleSel(id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{p.name}</div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {tags.map((t) => (
                              <Badge key={t} variant="default" className="text-xs">{t}</Badge>
                            ))}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>
              <Button onClick={runAi} disabled={running} variant="ghost" size="sm" className="mt-2">
                <Sparkles className="w-3 h-3 mr-1" /> Kör om
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Stäng</Button>
          {hasResults && (
            <Button onClick={applySelected} disabled={saving || selected.size === 0}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Spara {selected.size} valda
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
