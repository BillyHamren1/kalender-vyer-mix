/**
 * BreakRequiredDialog
 *
 * Öppnas vid inskick av dagrapport om arbetspasset överstiger
 * BREAK_PROMPT_THRESHOLD_HOURS (5h) och break_minutes === 0.
 *
 * Användaren MÅSTE välja rast (snabbval, eget värde) eller explicit
 * "Ingen rast" (kräver kommentar ≥ 10 tecken). Submit disabled tills
 * giltigt val finns.
 */
import React, { useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Coffee, AlertTriangle } from 'lucide-react';

const PRESETS = [15, 30, 45, 60] as const;
const MIN_NOBREAK_COMMENT = 10;

export interface BreakConfirmResult {
  breakMinutes: number;
  comment: string | null;
}

interface Props {
  open: boolean;
  passHours: number;
  initialComment?: string;
  onCancel: () => void;
  onConfirm: (result: BreakConfirmResult) => void;
}

export const BreakRequiredDialog: React.FC<Props> = ({
  open, passHours, initialComment = '', onCancel, onConfirm,
}) => {
  const [mode, setMode] = useState<'preset' | 'custom' | 'none' | null>(null);
  const [preset, setPreset] = useState<number | null>(null);
  const [custom, setCustom] = useState<string>('');
  const [comment, setComment] = useState<string>(initialComment);

  const customNum = useMemo(() => {
    const n = Number(custom);
    return Number.isFinite(n) ? Math.round(n) : NaN;
  }, [custom]);

  const valid = useMemo(() => {
    if (mode === 'preset') return preset !== null && preset > 0;
    if (mode === 'custom') return Number.isFinite(customNum) && customNum > 0 && customNum <= 600;
    if (mode === 'none') return comment.trim().length >= MIN_NOBREAK_COMMENT;
    return false;
  }, [mode, preset, customNum, comment]);

  const handleConfirm = () => {
    if (!valid) return;
    if (mode === 'preset') onConfirm({ breakMinutes: preset!, comment: comment.trim() || null });
    else if (mode === 'custom') onConfirm({ breakMinutes: customNum, comment: comment.trim() || null });
    else if (mode === 'none') onConfirm({ breakMinutes: 0, comment: comment.trim() });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="text-left flex items-center gap-2">
            <Coffee className="w-5 h-5 text-primary" />
            Rast måste anges
          </SheetTitle>
          <p className="text-xs text-muted-foreground text-left">
            Ditt arbetspass är {passHours.toFixed(1)}h. Enligt arbetstidslagen krävs rast efter 5h.
            Välj rast eller markera "Ingen rast" med förklaring.
          </p>
        </SheetHeader>

        <div className="space-y-4 py-3">
          <div>
            <Label className="text-xs">Snabbval</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setMode('preset'); setPreset(p); }}
                  className={cn(
                    'px-3 py-1.5 rounded-lg border text-[12px] font-bold tabular-nums',
                    mode === 'preset' && preset === p
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border text-foreground/80',
                  )}
                >
                  {p} min
                </button>
              ))}
              <button
                type="button"
                onClick={() => setMode('custom')}
                className={cn(
                  'px-3 py-1.5 rounded-lg border text-[12px] font-bold',
                  mode === 'custom'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border text-foreground/80',
                )}
              >
                Annat
              </button>
              <button
                type="button"
                onClick={() => setMode('none')}
                className={cn(
                  'px-3 py-1.5 rounded-lg border text-[12px] font-bold flex items-center gap-1',
                  mode === 'none'
                    ? 'bg-destructive text-destructive-foreground border-destructive'
                    : 'bg-background border-border text-foreground/80',
                )}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Ingen rast
              </button>
            </div>
          </div>

          {mode === 'custom' && (
            <div>
              <Label className="text-xs">Antal minuter</Label>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={600}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="t.ex. 25"
              />
            </div>
          )}

          {mode === 'none' && (
            <div>
              <Label className="text-xs">
                Förklaring (minst {MIN_NOBREAK_COMMENT} tecken) <span className="text-destructive">*</span>
              </Label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, 1000))}
                rows={3}
                placeholder="Varför togs ingen rast?"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                {comment.trim().length}/{MIN_NOBREAK_COMMENT} tecken
              </p>
            </div>
          )}
        </div>

        <SheetFooter className="flex-row gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel}>Avbryt</Button>
          <Button
            className="flex-1"
            disabled={!valid}
            onClick={handleConfirm}
            data-testid="break-confirm"
          >
            Bekräfta och skicka in
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default BreakRequiredDialog;
