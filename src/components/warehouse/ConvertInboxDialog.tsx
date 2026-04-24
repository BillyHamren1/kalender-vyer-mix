import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { CalendarIcon, Package, RotateCcw, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  createWarehouseProjectFromInbox,
  fetchInboxItemSuggestedDates,
} from '@/services/warehouseProjectService';
import { WarehouseProjectInboxItem, WarehouseProject } from '@/types/warehouseProject';
import { toast } from 'sonner';

interface ConvertInboxDialogProps {
  item: WarehouseProjectInboxItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (project: WarehouseProject) => void;
}

const toIsoDate = (d: Date | undefined): string | null =>
  d ? d.toISOString().slice(0, 10) : null;

const fromIso = (s: string | null): Date | undefined =>
  s ? new Date(s + 'T00:00:00') : undefined;

const DateField: React.FC<{
  label: string;
  value: string | null;
  onChange: (iso: string | null) => void;
}> = ({ label, value, onChange }) => {
  const date = fromIso(value);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'w-full justify-start text-left font-normal h-9',
              !date && 'text-muted-foreground'
            )}
          >
            <CalendarIcon className="w-3.5 h-3.5 mr-2" />
            {date ? format(date, 'd MMM yyyy', { locale: sv }) : 'Välj datum'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 z-[60]" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => onChange(toIsoDate(d))}
            initialFocus
            locale={sv}
            className={cn('p-3 pointer-events-auto')}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
};

export const ConvertInboxDialog: React.FC<ConvertInboxDialogProps> = ({
  item,
  open,
  onOpenChange,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [packStart, setPackStart] = useState<string | null>(null);
  const [packEnd, setPackEnd] = useState<string | null>(null);
  const [hasReturn, setHasReturn] = useState(true);
  const [returnStart, setReturnStart] = useState<string | null>(null);
  const [returnEnd, setReturnEnd] = useState<string | null>(null);
  const [loadingDates, setLoadingDates] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!item || !open) return;
    setName(item.client_name || 'Lagerprojekt');
    setHasReturn(true);
    setLoadingDates(true);
    fetchInboxItemSuggestedDates(item)
      .then((d) => {
        setPackStart(d.packStart);
        setPackEnd(d.packEnd);
        setReturnStart(d.returnStart);
        setReturnEnd(d.returnEnd);
      })
      .catch((err) => {
        console.error('Failed to fetch suggested dates:', err);
      })
      .finally(() => setLoadingDates(false));
  }, [item, open]);

  const isValid =
    !!name.trim() &&
    !!packStart &&
    !!packEnd &&
    packEnd >= packStart &&
    (!hasReturn || (!!returnStart && !!returnEnd && returnEnd >= returnStart));

  const handleSubmit = async () => {
    if (!item || !isValid) return;
    setSubmitting(true);
    try {
      const wp = await createWarehouseProjectFromInbox(item, {
        name: name.trim(),
        packStart: packStart!,
        packEnd: packEnd!,
        returnStart: returnStart!,
        returnEnd: returnEnd!,
      });
      toast.success(`Lagerprojekt ${wp.project_number} skapat`);
      onSuccess(wp);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error('Kunde inte skapa lagerprojekt');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Skapa lagerprojekt</DialogTitle>
          <DialogDescription>
            Justera datumen vid behov. Packa och Returnera skapas som moment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="wp-name" className="text-xs text-muted-foreground">
              Namn
            </Label>
            <Input
              id="wp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Lagerprojekt"
            />
          </div>

          {loadingDates ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Hämtar förslagsdatum…
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-border/60 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-primary" />
                  <h4 className="text-sm font-medium">Packning</h4>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <DateField label="Startdatum" value={packStart} onChange={setPackStart} />
                  <DateField label="Slutdatum" value={packEnd} onChange={setPackEnd} />
                </div>
                {packStart && packEnd && packEnd < packStart && (
                  <p className="text-xs text-destructive">Slutdatum måste vara efter startdatum.</p>
                )}
              </div>

              <div className="rounded-lg border border-border/60 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-primary" />
                  <h4 className="text-sm font-medium">Retur</h4>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <DateField label="Startdatum" value={returnStart} onChange={setReturnStart} />
                  <DateField label="Slutdatum" value={returnEnd} onChange={setReturnEnd} />
                </div>
                {returnStart && returnEnd && returnEnd < returnStart && (
                  <p className="text-xs text-destructive">Slutdatum måste vara efter startdatum.</p>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Avbryt
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || submitting || loadingDates}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Skapa lagerprojekt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConvertInboxDialog;
