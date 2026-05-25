/**
 * EditSegmentTimeSheet — local-only editor for a single GPS Day segment.
 * Produces a ManualSegmentOverride that the parent buffers and sends at
 * submit time. Does not call any backend on its own.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { MobileGpsDaySegment, MobileGpsManualOverride } from './types';

interface Props {
  segment: MobileGpsDaySegment | null;
  date: string; // YYYY-MM-DD
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (override: MobileGpsManualOverride) => void;
  onClear?: (segmentKey: string) => void;
  existingOverride?: MobileGpsManualOverride | null;
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

const EditSegmentTimeSheet: React.FC<Props> = ({
  segment,
  open,
  onOpenChange,
  onSave,
  onClear,
  existingOverride,
}) => {
  const initialStart = useMemo(
    () => toLocalInput(existingOverride?.startIso ?? segment?.currentStartTime ?? null),
    [segment, existingOverride],
  );
  const initialEnd = useMemo(
    () => toLocalInput(existingOverride?.endIso ?? segment?.currentEndTime ?? null),
    [segment, existingOverride],
  );

  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [reason, setReason] = useState(existingOverride?.reason ?? '');

  useEffect(() => {
    setStart(initialStart);
    setEnd(initialEnd);
    setReason(existingOverride?.reason ?? '');
  }, [initialStart, initialEnd, existingOverride, segment?.segmentKey]);

  if (!segment) return null;

  const handleSave = () => {
    const startIso = fromLocalInput(start);
    const endIso = fromLocalInput(end);
    if (!startIso || !endIso) return;
    onSave({
      segmentKey: segment.segmentKey,
      startIso,
      endIso,
      reason: reason.trim() ? reason.trim() : null,
    });
    onOpenChange(false);
  };

  const handleClear = () => {
    if (onClear) onClear(segment.segmentKey);
    onOpenChange(false);
  };

  const fmt = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString('sv-SE', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
    } catch {
      return iso;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[92vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>{segment.label}</SheetTitle>
          <SheetDescription>
            Ursprunglig tid från GPS: {fmt(segment.originalStartTime)} – {fmt(segment.originalEndTime)}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="seg-start">Ny starttid</Label>
            <Input
              id="seg-start"
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="seg-end">Ny sluttid</Label>
            <Input
              id="seg-end"
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="seg-reason">Orsak (valfri)</Label>
            <Textarea
              id="seg-reason"
              placeholder="t.ex. glömde stoppa tiden / GPS visade fel plats"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <SheetFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {existingOverride && onClear ? (
            <Button variant="ghost" onClick={handleClear} className="sm:order-1">
              Återställ till GPS
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2 sm:order-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
            <Button onClick={handleSave}>Spara ändring</Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default EditSegmentTimeSheet;
