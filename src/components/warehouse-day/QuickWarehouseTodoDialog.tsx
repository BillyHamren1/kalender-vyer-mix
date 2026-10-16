import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { DayStaff } from '@/hooks/useWarehouseDayStaff';

type Kind = 'warehouse_task' | 'repair_care';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultKind: Kind;
  defaultStaffId: string | null;
  staff: DayStaff[];
  onCreate: (i: { title: string; kind: Kind; staffId: string | null; notes?: string }) => Promise<void>;
}

/** Snabb to-do för lagret: titel, typ, ev. person. Inget projekt behövs. */
export default function QuickWarehouseTodoDialog({ open, onOpenChange, defaultKind, defaultStaffId, staff, onCreate }: Props) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [staffId, setStaffId] = useState<string | null>(defaultStaffId);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setTitle(''); setNotes(''); setKind(defaultKind); setStaffId(defaultStaffId); }
  }, [open, defaultKind, defaultStaffId]);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await onCreate({ title, kind, staffId, notes });
      toast.success('Uppgiften är skapad');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte skapa uppgiften');
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Ny uppgift</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input autoFocus placeholder="Vad ska göras?" value={title} onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
          <div className="flex gap-1.5">
            {([['warehouse_task', 'Lageruppgift'], ['repair_care', 'Reparation & vård']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setKind(k)}
                className={cn('flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold',
                  kind === k ? 'border-warehouse bg-warehouse/10 text-warehouse' : 'border-border text-muted-foreground')}>{l}</button>
            ))}
          </div>
          <Textarea placeholder="Anteckning (valfritt)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground mb-1">Tilldela (valfritt)</div>
            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
              <button type="button" onClick={() => setStaffId(null)}
                className={cn('rounded-full border px-2 py-0.5 text-[11px]', !staffId ? 'border-warehouse bg-warehouse/10 text-warehouse' : 'border-border')}>Obemannad</button>
              {staff.filter((s) => s.inWarehouseToday || s.id === staffId).map((s) => (
                <button key={s.id} type="button" onClick={() => setStaffId(s.id)}
                  className={cn('rounded-full border px-2 py-0.5 text-[11px]', staffId === s.id ? 'border-warehouse bg-warehouse/10 text-warehouse' : 'border-border')}>{s.name}</button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button className="bg-warehouse hover:bg-warehouse-hover" disabled={!title.trim() || busy} onClick={submit}>Skapa</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
