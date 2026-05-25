/**
 * ManualWorkSegmentsEditor — användaren bygger sin manuella tidrapport som
 * en eller flera rader. Varje rad har start, slut, rast och en valbar target
 * (booking/project/large_project/location/other). Systemet auto-väljer aldrig.
 */
import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Plus, Trash2, Send, Loader2, ClipboardEdit, AlertTriangle, ChevronRight,
} from 'lucide-react';
import ManualWorkTargetPicker from './ManualWorkTargetPicker';
import type {
  ManualWorkSegmentInput,
  ManualWorkTarget,
  ManualWorkTargets,
} from './types';

interface Props {
  date: string;
  targets: ManualWorkTargets;
  userComment: string;
  onUserCommentChange: (v: string) => void;
  onSubmit: (input: { segments: ManualWorkSegmentInput[]; comment: string | null }) => void | Promise<void>;
  isSubmitting: boolean;
  disabled?: boolean;
  disabledReason?: string | null;
}

interface RowDraft {
  id: string;
  startTime: string;
  endTime: string;
  breakStr: string;
  target: ManualWorkTarget | null;
}

function diffMinutes(start: string, end: string): number {
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60; // nattpass
  return mins;
}

function fmtDuration(mins: number): string {
  if (mins <= 0) return '0h';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function newRowId() {
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const ManualWorkSegmentsEditor: React.FC<Props> = ({
  targets, userComment, onUserCommentChange, onSubmit, isSubmitting, disabled, disabledReason,
}) => {
  const [rows, setRows] = useState<RowDraft[]>([
    { id: newRowId(), startTime: '08:00', endTime: '16:00', breakStr: '30', target: null },
  ]);
  const [pickerRowId, setPickerRowId] = useState<string | null>(null);

  const totals = useMemo(() => {
    let net = 0, brk = 0;
    for (const r of rows) {
      const gross = diffMinutes(r.startTime, r.endTime);
      const b = Math.max(0, Math.round(Number(r.breakStr) || 0));
      net += Math.max(0, gross - b);
      brk += b;
    }
    return { net, brk };
  }, [rows]);

  const canSubmit = !disabled && !isSubmitting && rows.length > 0 && rows.every((r) => {
    const valid = /^\d{2}:\d{2}$/.test(r.startTime) && /^\d{2}:\d{2}$/.test(r.endTime);
    const gross = diffMinutes(r.startTime, r.endTime);
    const b = Math.max(0, Math.round(Number(r.breakStr) || 0));
    return valid && gross > 0 && b < gross && r.target !== null;
  });

  const updateRow = (id: string, patch: Partial<RowDraft>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));
  const addRow = () => {
    const last = rows[rows.length - 1];
    setRows((rs) => [
      ...rs,
      {
        id: newRowId(),
        startTime: last?.endTime ?? '13:00',
        endTime: '17:00',
        breakStr: '0',
        target: null,
      },
    ]);
  };

  const handleSubmit = () => {
    const segments: ManualWorkSegmentInput[] = rows.map((r) => ({
      startTime: r.startTime,
      endTime: r.endTime,
      breakMinutes: Math.max(0, Math.round(Number(r.breakStr) || 0)),
      target: r.target,
    }));
    void onSubmit({ segments, comment: userComment.trim() || null });
  };

  const activePickerRow = pickerRowId ? rows.find((r) => r.id === pickerRowId) ?? null : null;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardEdit className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Manuell tidrapport</h3>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        Lägg till en eller flera rader och välj själv var varje rad hör hemma.
      </p>

      <div className="space-y-3">
        {rows.map((r, idx) => {
          const gross = diffMinutes(r.startTime, r.endTime);
          const b = Math.max(0, Math.round(Number(r.breakStr) || 0));
          const net = Math.max(0, gross - b);
          const targetMissing = r.target === null;
          const isOther = r.target?.targetType === 'other';
          return (
            <div
              key={r.id}
              className="rounded-lg border bg-card p-3 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Rad {idx + 1}
                </span>
                {rows.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    onClick={() => removeRow(r.id)}
                    disabled={disabled || isSubmitting}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Start</Label>
                  <Input
                    type="time"
                    value={r.startTime}
                    onChange={(e) => updateRow(r.id, { startTime: e.target.value })}
                    disabled={disabled || isSubmitting}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Slut</Label>
                  <Input
                    type="time"
                    value={r.endTime}
                    onChange={(e) => updateRow(r.id, { endTime: e.target.value })}
                    disabled={disabled || isSubmitting}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Rast (min)</Label>
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={r.breakStr}
                    onChange={(e) => updateRow(r.id, { breakStr: e.target.value })}
                    disabled={disabled || isSubmitting}
                  />
                </div>
              </div>

              {/* Target picker trigger */}
              <button
                onClick={() => setPickerRowId(r.id)}
                disabled={disabled || isSubmitting}
                className={`w-full flex items-center justify-between text-left px-3 py-2.5 rounded-md border transition ${
                  targetMissing
                    ? 'border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10'
                    : 'border-border bg-muted/30 hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isOther && <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
                  <div className="min-w-0">
                    {targetMissing ? (
                      <div className="text-sm font-medium text-primary">
                        Välj plats / projekt
                      </div>
                    ) : (
                      <>
                        <div className="text-sm font-medium truncate">{r.target!.label}</div>
                        {r.target!.subtitle && (
                          <div className="text-[11px] text-muted-foreground truncate">
                            {r.target!.subtitle}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>

              {isOther && (
                <p className="text-[11px] text-amber-700">
                  Denna tid hamnar inte på projektkostnad förrän den kopplas.
                </p>
              )}

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Netto</span>
                <span className="font-semibold">{fmtDuration(net)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={addRow}
        disabled={disabled || isSubmitting}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-1.5" />
        Lägg till rad
      </Button>

      <div className="rounded-md bg-muted/40 p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Total rast</span>
          <span className="font-medium">{fmtDuration(totals.brk)}</span>
        </div>
        <div className="flex items-center justify-between mt-1 pt-1 border-t">
          <span className="text-muted-foreground">Total arbetstid</span>
          <span className="font-semibold">{fmtDuration(totals.net)}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="manual-comment" className="text-xs">Kommentar till admin (valfri)</Label>
        <Textarea
          id="manual-comment"
          rows={2}
          value={userComment}
          onChange={(e) => onUserCommentChange(e.target.value)}
          disabled={disabled || isSubmitting}
          placeholder="t.ex. glömde slå på telefonen, jobbade på lager …"
        />
      </div>

      {disabled && disabledReason && (
        <p className="text-xs text-muted-foreground">{disabledReason}</p>
      )}

      {!canSubmit && !disabled && rows.some((r) => r.target === null) && (
        <Badge variant="outline" className="w-full justify-center py-1.5 text-[11px]">
          Välj plats/projekt för alla rader innan du skickar in
        </Badge>
      )}

      <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full" size="lg">
        {isSubmitting ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Skickar…</>
        ) : (
          <><Send className="h-4 w-4 mr-2" />Skicka in tidrapport</>
        )}
      </Button>

      <ManualWorkTargetPicker
        open={!!pickerRowId}
        onOpenChange={(o) => { if (!o) setPickerRowId(null); }}
        targets={targets}
        currentTarget={activePickerRow?.target ?? null}
        onSelect={(t) => {
          if (pickerRowId) updateRow(pickerRowId, { target: t });
        }}
      />
    </Card>
  );
};

export default ManualWorkSegmentsEditor;
