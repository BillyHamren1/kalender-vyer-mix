import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface BulkCleanupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AGE_OPTIONS = [
  { value: "7", label: "Äldre än 7 dagar" },
  { value: "14", label: "Äldre än 14 dagar" },
  { value: "30", label: "Äldre än 30 dagar" },
  { value: "60", label: "Äldre än 60 dagar" },
];

const STATUS_OPTIONS = [
  { value: "completed", label: "Avslutade" },
  { value: "delivered", label: "Levererade" },
  { value: "planning", label: "Planering" },
];

const BulkCleanupDialog = ({ open, onOpenChange }: BulkCleanupDialogProps) => {
  const queryClient = useQueryClient();
  const [ageDays, setAgeDays] = useState("30");
  const [statuses, setStatuses] = useState<string[]>(["completed", "delivered"]);
  const [preview, setPreview] = useState<{ id: string; name: string; status: string; updatedAt: string }[] | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const previewMutation = useMutation({
    mutationFn: async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - parseInt(ageDays));
      
      const { data, error } = await supabase
        .from('packing_projects')
        .select('id, name, status, updated_at')
        .in('status', statuses)
        .lt('updated_at', cutoff.toISOString())
        .order('updated_at', { ascending: true });

      if (error) throw error;
      return (data || []).map(p => ({ id: p.id, name: p.name, status: p.status, updatedAt: p.updated_at }));
    },
    onSuccess: (data) => setPreview(data),
    onError: () => toast.error('Kunde inte hämta packningar'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      // Delete related data first
      for (const table of ['packing_list_items', 'packing_parcels', 'packing_tasks', 'packing_comments', 'packing_files', 'packing_labor_costs', 'packing_purchases', 'packing_quotes', 'packing_invoices', 'packing_budget', 'packing_task_comments'] as const) {
        await supabase.from(table).delete().in('packing_id', ids);
      }
      const { error } = await supabase.from('packing_projects').delete().in('id', ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['packings'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-active-packings'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-completed-packings'] });
      toast.success(`${count} packningar borttagna`);
      handleClose();
    },
    onError: () => toast.error('Kunde inte ta bort packningar'),
  });

  const handleClose = () => {
    setPreview(null);
    setConfirmText("");
    onOpenChange(false);
  };

  const toggleStatus = (status: string) => {
    setStatuses(prev => 
      prev.includes(status) 
        ? prev.filter(s => s !== status) 
        : [...prev, status]
    );
    setPreview(null);
  };

  const needsConfirmation = preview && preview.length > 5;
  const canDelete = preview && preview.length > 0 && (!needsConfirmation || confirmText === "RADERA");

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Rensa gamla packningar
          </DialogTitle>
          <DialogDescription>
            Ta bort gamla packningar som inte längre behövs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status filter */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Status att rensa</Label>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map(opt => (
                <Button
                  key={opt.value}
                  variant={statuses.includes(opt.value) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleStatus(opt.value)}
                  className={statuses.includes(opt.value) ? "bg-destructive hover:bg-destructive/90" : ""}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Age filter */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Ålder</Label>
            <Select value={ageDays} onValueChange={(v) => { setAgeDays(v); setPreview(null); }}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGE_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Preview button */}
          <Button 
            onClick={() => previewMutation.mutate()} 
            variant="outline" 
            className="w-full"
            disabled={statuses.length === 0 || previewMutation.isPending}
          >
            {previewMutation.isPending ? "Söker..." : "Visa matchande packningar"}
          </Button>

          {/* Preview results */}
          {preview !== null && (
            <div className="border rounded-xl p-3 space-y-2 max-h-48 overflow-y-auto bg-muted/30">
              {preview.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Inga packningar matchar filtret
                </p>
              ) : (
                <>
                  <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" />
                    {preview.length} packningar kommer tas bort
                  </p>
                  {preview.map(p => (
                    <div key={p.id} className="text-sm flex justify-between items-center py-1 border-b border-border/30 last:border-0">
                      <span className="truncate flex-1">{p.name}</span>
                      <span className="text-xs text-muted-foreground ml-2 shrink-0">{p.status}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Confirmation for large deletions */}
          {needsConfirmation && (
            <div>
              <Label className="text-sm text-destructive font-medium mb-1 block">
                Skriv RADERA för att bekräfta ({preview.length} packningar)
              </Label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="RADERA"
                className="border-destructive/50"
              />
            </div>
          )}

          {/* Delete button */}
          {preview && preview.length > 0 && (
            <Button
              onClick={() => deleteMutation.mutate(preview.map(p => p.id))}
              variant="destructive"
              className="w-full"
              disabled={!canDelete || deleteMutation.isPending}
            >
              {deleteMutation.isPending 
                ? "Tar bort..." 
                : `Ta bort ${preview.length} packningar`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BulkCleanupDialog;
