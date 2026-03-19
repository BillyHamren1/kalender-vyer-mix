import { useState, useRef, useEffect } from "react";
import { Plus, Trash2, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface ChecklistItem {
  id: string;
  title: string;
  completed: boolean;
  sort_order: number;
}

interface ManualPackingChecklistProps {
  packingId: string;
}

const ManualPackingChecklist = ({ packingId }: ManualPackingChecklistProps) => {
  const [newItem, setNewItem] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
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
    }
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['packing-checklist', packingId] });

  const addMutation = useMutation({
    mutationFn: async (title: string) => {
      const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.sort_order)) + 1 : 0;
      const { error } = await supabase.from('packing_tasks').insert({
        packing_id: packingId,
        title,
        completed: false,
        sort_order: maxOrder
      });
      if (error) throw error;
    },
    onSuccess: invalidate
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const { error } = await supabase.from('packing_tasks').update({ completed }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate
  });

  const updateTitleMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase.from('packing_tasks').update({ title }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('packing_tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate
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

  const completedCount = items.filter(i => i.completed).length;
  const totalCount = items.length;

  if (isLoading) {
    return <div className="animate-pulse space-y-2">
      {[1,2,3].map(i => <div key={i} className="h-10 bg-muted rounded-lg" />)}
    </div>;
  }

  return (
    <div className="space-y-4">
      {/* Progress */}
      {totalCount > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
          <span className="text-sm text-muted-foreground font-medium whitespace-nowrap">
            {completedCount}/{totalCount}
          </span>
        </div>
      )}

      {/* Items */}
      <div className="space-y-1">
        {items.map(item => (
          <div
            key={item.id}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg group hover:bg-muted/50 transition-colors",
              item.completed && "opacity-60"
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
                onChange={(e) => setEditingTitle(e.target.value)}
                onBlur={handleSaveEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEdit();
                  if (e.key === 'Escape') setEditingId(null);
                }}
                className="h-7 text-sm flex-1"
              />
            ) : (
              <span
                className={cn(
                  "flex-1 text-sm cursor-pointer",
                  item.completed && "line-through text-muted-foreground"
                )}
                onClick={() => handleStartEdit(item)}
              >
                {item.title}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              onClick={() => deleteMutation.mutate(item.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      {/* Add new item */}
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder="Lägg till artikel..."
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
          className="text-sm"
        />
        <Button variant="outline" size="icon" onClick={handleAdd} disabled={!newItem.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {totalCount === 0 && (
        <p className="text-muted-foreground text-center py-6 text-sm">
          Inga artiklar ännu. Skriv ett namn ovan och tryck Enter.
        </p>
      )}
    </div>
  );
};

export default ManualPackingChecklist;
