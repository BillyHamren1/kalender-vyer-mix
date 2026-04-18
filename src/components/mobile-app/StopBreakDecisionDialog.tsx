import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Coffee, AlertTriangle, Loader2 } from 'lucide-react';

/**
 * Result returned by StopBreakDecisionDialog.
 *
 * Architectural decision: tidrapporteringen får ALDRIG dra rast automatiskt.
 * När ett pass är så långt att rast normalt skulle krävas måste användaren
 * göra ett explicit val. Tre giltiga utfall:
 *
 *  - 'break'      → användaren anger rasten själv (decimaltimmar)
 *  - 'no_break'   → användaren bekräftar uttryckligen att ingen rast tas
 *  - 'anomaly'    → användaren markerar att detta ska hanteras som avvikelse;
 *                    en time_report_anomaly skapas av anroparen så att admin
 *                    kan följa upp i stället för att gissa.
 */
export type StopBreakDecision =
  | { kind: 'break'; breakHours: number }
  | { kind: 'no_break' }
  | { kind: 'anomaly'; note: string };

interface StopBreakDecisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Längd på passet i decimaltimmar (utan rast-justering) — visas till användaren. */
  passHours: number;
  /** Etikett för vad som stoppas, t.ex. "Uppdrag X" eller "Lager". */
  context?: string | null;
  /** Inget förhandsifyllt rast-värde; måste väljas aktivt. */
  onConfirm: (result: StopBreakDecision) => Promise<void> | void;
}

const MIN_BREAK = 0;
const MAX_BREAK_HOURS = 4; // matchar backend (240 min)

/**
 * Frågar användaren om rast vid timer-stopp.
 *
 *  - Användaren MÅSTE välja ett av de tre alternativen för att kunna spara.
 *  - Ingen 0.5h dras automatiskt — beslutsdokumentet säger uttryckligen
 *    att ingen tid får justeras automatiskt bara för att passet är långt.
 */
export const StopBreakDecisionDialog: React.FC<StopBreakDecisionDialogProps> = ({
  open,
  onOpenChange,
  passHours,
  context,
  onConfirm,
}) => {
  const [choice, setChoice] = useState<'break' | 'no_break' | 'anomaly' | null>(null);
  const [breakInput, setBreakInput] = useState<string>('0.5');
  const [note, setNote] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setChoice(null);
      setBreakInput('0.5');
      setNote('');
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  const passLabel = `${passHours.toFixed(2).replace(/\.00$/, '')} h`;

  const validate = (): StopBreakDecision | null => {
    if (choice === 'break') {
      const v = parseFloat(breakInput.replace(',', '.'));
      if (!Number.isFinite(v) || v <= MIN_BREAK) {
        setError('Ange en rast större än 0.');
        return null;
      }
      if (v > MAX_BREAK_HOURS) {
        setError('Rasten kan max vara 4 timmar (240 min).');
        return null;
      }
      if (v >= passHours) {
        setError('Rasten kan inte vara lika lång som eller längre än passet.');
        return null;
      }
      return { kind: 'break', breakHours: Math.round(v * 100) / 100 };
    }
    if (choice === 'no_break') {
      return { kind: 'no_break' };
    }
    if (choice === 'anomaly') {
      const trimmed = note.trim();
      if (!trimmed) {
        setError('Beskriv kort vad avvikelsen gäller (t.ex. "glömde stoppa", "gick hem tidigare").');
        return null;
      }
      return { kind: 'anomaly', note: trimmed };
    }
    setError('Välj ett alternativ för rast.');
    return null;
  };

  const handleSubmit = async () => {
    setError(null);
    const decision = validate();
    if (!decision) return;
    setSubmitting(true);
    try {
      await onConfirm(decision);
    } catch (e: any) {
      setError(e?.message || 'Kunde inte spara. Försök igen.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coffee className="h-5 w-5 text-primary" />
            Hur ska rasten hanteras?
          </DialogTitle>
          <DialogDescription>
            Passet är <strong>{passLabel}</strong>
            {context ? ` (${context})` : ''}. Inget rast-avdrag görs
            automatiskt — välj hur den här tidrapporten ska se ut.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Option a — ange rast */}
          <button
            type="button"
            onClick={() => { setChoice('break'); setError(null); }}
            className={`w-full text-left rounded-xl border p-3 transition-colors ${
              choice === 'break' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
            }`}
          >
            <div className="font-semibold text-sm">Ange rast</div>
            <div className="text-xs text-muted-foreground">
              Ange hur lång rast du faktiskt tog. Den dras från timmar arbetade.
            </div>
            {choice === 'break' && (
              <div className="mt-3 space-y-1">
                <Label htmlFor="break-hours" className="text-xs">Rast (timmar)</Label>
                <Input
                  id="break-hours"
                  type="number"
                  inputMode="decimal"
                  step="0.25"
                  min="0"
                  max={MAX_BREAK_HOURS}
                  value={breakInput}
                  onChange={(e) => setBreakInput(e.target.value)}
                  className="h-9"
                  autoFocus
                />
              </div>
            )}
          </button>

          {/* Option b — ingen rast */}
          <button
            type="button"
            onClick={() => { setChoice('no_break'); setError(null); }}
            className={`w-full text-left rounded-xl border p-3 transition-colors ${
              choice === 'no_break' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
            }`}
          >
            <div className="font-semibold text-sm">Ingen rast</div>
            <div className="text-xs text-muted-foreground">
              Bekräfta att ingen rast togs. Inga timmar justeras.
            </div>
          </button>

          {/* Option c — markera som avvikelse */}
          <button
            type="button"
            onClick={() => { setChoice('anomaly'); setError(null); }}
            className={`w-full text-left rounded-xl border p-3 transition-colors ${
              choice === 'anomaly' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
            }`}
          >
            <div className="font-semibold text-sm flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              Markera som avvikelse
            </div>
            <div className="text-xs text-muted-foreground">
              Du är osäker eller något gick fel. Tidrapporten sparas utan
              automatisk justering och en avvikelse skickas till admin för uppföljning.
            </div>
            {choice === 'anomaly' && (
              <div className="mt-3 space-y-1">
                <Label htmlFor="anomaly-note" className="text-xs">Kort beskrivning</Label>
                <Textarea
                  id="anomaly-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="T.ex. glömde stoppa, gick hem tidigare, oklar rast"
                  className="min-h-[64px]"
                  autoFocus
                />
              </div>
            )}
          </button>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="w-full sm:w-auto"
          >
            Avbryt
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !choice}
            className="w-full sm:w-auto"
          >
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Spara tidrapport
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StopBreakDecisionDialog;
