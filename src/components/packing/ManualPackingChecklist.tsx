import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ListPlus, Plus, Printer, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { WAREHOUSE_CHECKLIST_TEMPLATES } from "@/lib/packing/warehouseChecklistTemplates";
import { openPrintableChecklist } from "@/lib/packing/printChecklist";

interface ChecklistItem {
  id: string;
  title: string;
  completed: boolean;
  sort_order: number;
}

interface ManualPackingChecklistProps {
  packingId: string;
  packingName?: string;
  bookingNumber?: string | null;
  client?: string | null;
}

const normalizeTitle = (value: string) => value.trim().toLocaleLowerCase('sv-SE');

const ManualPackingChecklist = ({
  packingId,
  packingName = 'Lagerchecklista',
  bookingNumber,
  client,
}: ManualPackingChecklistProps) => {
  const [newItem, setNewItem] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>('packstart');
  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['packing-checklist', packingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('packing_tasks')
        .select('id, title, completed, sort_order')
        .eq('packing_id', packingId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data as ChecklistItem[];
    },
  });

  const invalidate = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['packing-checklist', packingId] }),
    queryClient.invalidateQueries({ queryKey: ['packing-tasks', packingId] }),
  ]);

  const addMutation = useMutation({
    mutationFn: async (title: string) => {
      const maxOrder = items.length > 0 ? Math.max(...items.map((item) => item.sort_order)) + 1 : 0;
      const { error } = await supabase.from('packing_tasks').insert({
        packing_id: packingId,
        title,
        completed: false,
        sort_order: maxOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Kontrollpunkt tillagd');
    },
    onError: () => toast.error('Kunde inte lägga till kontrollpunkt'),
  });

  const applyTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const template = WAREHOUSE_CHECKLIST_TEMPLATES.find((item) => item.id === templateId);
      if (!template) return { added: 0 };

      const existing = new Set(items.map((item) => normalizeTitle(item.title)));
      const missing = template.items.filter((title) => !existing.has(normalizeTitle(title)));
      if (missing.length === 0) return { added: 0 };

      const maxOrder = items.length > 0 ? Math.max(...items.map((item) => item.sort_order)) + 1 : 0;
      const rows = missing.map((title, index) => ({
        packing_id: packingId,
        title,
        completed: false,
        sort_order: maxOrder + index,
      }));
      const { error } = await supabase.from('packing_tasks').insert(rows);
      if (error) throw error;
      return { added: rows.length };
    },
    onSuccess: (result) => {
      invalidate();
      if (result?.added) toast.success(`${result.added} kontrollpunkter lades till`);
      else toast.info('Mallen finns redan i checklistan');
    },
    onError: () => toast.error('Kunde inte lägga in checklistmallen'),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const { error } = await supabase.from('packing_tasks').update({ completed }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: () => toast.error('Kunde inte uppdatera kontrollpunkten'),
  });

  const updateTitleMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase.from('packing_tasks').update({ title }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: () => toast.error('Kunde inte uppdatera texten'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('packing_tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: () => toast.error('Kunde inte ta bort kontrollpunkten'),
  });

  const handleAdd = () => {
    const title = newItem.trim();
    if (!title) return;
    addMutation.mutate(title);
    setNewItem("");
    inputRef.current?.focus();
  };

  const handleStartEdit = (item: ChecklistItem) => {
    setEditingId(item.id);
    setEditingTitle(item.title);
  };

  const handleSaveEdit = () => {
    if (editingId && editingTitle.trim()) {
      updateTitleMutation.mutate({ id: editingId, title: editingTitle.trim() });
    }
    setEditingId(null);
  };

  useEffect(() => {
    if (editingId && editRef.current) editRef.current.focus();
  }, [editingId]);

  const completedCount = items.filter((item) => item.completed).length;
  const totalCount = items.length;
  const selectedTemplateMeta = useMemo(
    () => WAREHOUSE_CHECKLIST_TEMPLATES.find((template) => template.id === selectedTemplate),
    [selectedTemplate],
  );

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2">
        {[1, 2, 3].map((index) => <div key={index} className="h-10 bg-muted rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/50 bg-muted/20 p-3 flex flex-col lg:flex-row lg:items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Arbetschecklista</p>
          <p className="text-xs text-muted-foreground">Lägg in en lagermall, anpassa punkterna och skriv ut samma lista när den behövs på golvet.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
            <SelectTrigger className="w-full sm:w-[210px] h-9 bg-background">
              <SelectValue placeholder="Välj checklistmall" />
            </SelectTrigger>
            <SelectContent>
              {WAREHOUSE_CHECKLIST_TEMPLATES.map((template) => (
                <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => applyTemplateMutation.mutate(selectedTemplate)}
            disabled={applyTemplateMutation.isPending}
            title={selectedTemplateMeta?.description}
          >
            <ListPlus className="h-4 w-4" />
            Lägg in mall
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => openPrintableChecklist(
              {
                title: 'Arbetschecklista',
                packingName,
                bookingNumber,
                client,
              },
              items.map((item) => ({ title: item.title, completed: item.completed })),
            )}
          >
            <Printer className="h-4 w-4" />
            Skriv ut / Spara PDF
          </Button>
        </div>
      </div>

      {totalCount > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${(completedCount / totalCount) * 100}%` }}
            />
          </div>
          <span className="text-sm text-muted-foreground font-medium whitespace-nowrap">
            {completedCount}/{totalCount} klara
          </span>
        </div>
      )}

      <div className="space-y-1">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg group hover:bg-muted/50 transition-colors border border-transparent hover:border-border/40",
              item.completed && "opacity-60",
            )}
          >
            <Checkbox
              checked={item.completed}
              onCheckedChange={(checked) => toggleMutation.mutate({ id: item.id, completed: !!checked })}
            />
            {editingId === item.id ? (
              <Input
                ref={editRef}
                value={editingTitle}
                onChange={(event) => setEditingTitle(event.target.value)}
                onBlur={handleSaveEdit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSaveEdit();
                  if (event.key === 'Escape') setEditingId(null);
                }}
                className="h-7 text-sm flex-1"
              />
            ) : (
              <span
                className={cn(
                  "flex-1 text-sm cursor-pointer",
                  item.completed && "line-through text-muted-foreground",
                )}
                onClick={() => handleStartEdit(item)}
              >
                {item.title}
              </span>
            )}
            {item.completed && <Check className="h-4 w-4 text-primary shrink-0" />}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              onClick={() => deleteMutation.mutate(item.id)}
              title="Ta bort kontrollpunkt"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={newItem}
          onChange={(event) => setNewItem(event.target.value)}
          placeholder="Ny kontrollpunkt…"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleAdd();
            }
          }}
          className="text-sm"
        />
        <Button variant="outline" size="icon" onClick={handleAdd} disabled={!newItem.trim()} title="Lägg till kontrollpunkt">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {totalCount === 0 && (
        <div className="text-center py-6 rounded-xl border border-dashed border-border/60 bg-muted/20">
          <p className="text-sm font-medium">Checklistan är tom</p>
          <p className="text-xs text-muted-foreground mt-1">Välj en mall ovan eller skapa egna kontrollpunkter.</p>
        </div>
      )}
    </div>
  );
};

export default ManualPackingChecklist;
