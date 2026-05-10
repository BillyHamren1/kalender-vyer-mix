/**
 * AssignStaffToPackingDialog — small picker that lists active staff and
 * assigns the chosen person directly to a packing via warehouse_assignments.
 *
 * Shows currently-assigned staff at the top and lets the user remove or add.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, UserPlus, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { assignStaffToPacking, removeStaffFromPacking } from '@/services/warehouseAssignmentsSync';
import { useWarehousePackingStaff } from '@/hooks/useWarehousePackingStaff';

interface Props {
  packingId: string;
  packingName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface StaffOption {
  id: string;
  name: string;
}

const AssignStaffToPackingDialog: React.FC<Props> = ({ packingId, packingName, open, onOpenChange }) => {
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const { assigned, refresh } = useWarehousePackingStaff(packingId);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingStaff(true);
    (async () => {
      const { data, error } = await supabase
        .from('staff_members')
        .select('id, name')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error('[AssignStaffToPackingDialog] load failed', error);
        toast.error('Kunde inte ladda personal');
        setStaff([]);
      } else {
        setStaff((data || []) as StaffOption[]);
      }
      setLoadingStaff(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const assignedIds = useMemo(() => new Set(assigned.map((a) => a.staff_id)), [assigned]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((s) => s.name.toLowerCase().includes(q));
  }, [staff, search]);

  const handleAdd = async (s: StaffOption) => {
    setBusyId(s.id);
    const res = await assignStaffToPacking({ staffId: s.id, packingId });
    setBusyId(null);
    if (res.ok) {
      toast.success(`${s.name} tilldelad`);
      refresh();
    } else {
      toast.error('Kunde inte tilldela');
    }
  };

  const handleRemove = async (staffId: string, name: string) => {
    setBusyId(staffId);
    const res = await removeStaffFromPacking({ staffId, packingId });
    setBusyId(null);
    if (res.ok) {
      toast.success(`${name} borttagen`);
      refresh();
    } else {
      toast.error('Kunde inte ta bort');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tilldela personal</DialogTitle>
          {packingName && <p className="text-xs text-muted-foreground">{packingName}</p>}
        </DialogHeader>

        {assigned.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Tilldelade ({assigned.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {assigned.map((a) => (
                <button
                  key={a.assignment_id}
                  onClick={() => handleRemove(a.staff_id, a.name)}
                  disabled={busyId === a.staff_id}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs font-medium border border-primary/20 hover:bg-primary/15"
                >
                  {a.name}
                  <X className="w-3 h-3" />
                </button>
              ))}
            </div>
          </div>
        )}

        <Input
          placeholder="Sök personal…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="max-h-[260px] overflow-y-auto border rounded-md">
          {loadingStaff ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Ingen personal hittades</p>
          ) : (
            <ul className="divide-y">
              {filtered.map((s) => {
                const already = assignedIds.has(s.id);
                return (
                  <li key={s.id} className="flex items-center justify-between px-3 py-2">
                    <span className={`text-sm ${already ? 'text-muted-foreground' : ''}`}>{s.name}</span>
                    {already ? (
                      <span className="text-[10px] uppercase tracking-wider text-emerald-600 font-bold">
                        Tilldelad
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId === s.id}
                        onClick={() => handleAdd(s)}
                      >
                        {busyId === s.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <UserPlus className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AssignStaffToPackingDialog;
