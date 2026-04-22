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
import { useLanguage } from '@/i18n/LanguageContext';

export type StopBreakDecision =
  | { kind: 'break'; breakHours: number }
  | { kind: 'no_break' }
  | { kind: 'anomaly'; note: string };

interface StopBreakDecisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  passHours: number;
  context?: string | null;
  onConfirm: (result: StopBreakDecision) => Promise<void> | void;
}

const MIN_BREAK = 0;
const MAX_BREAK_HOURS = 4;

export const StopBreakDecisionDialog: React.FC<StopBreakDecisionDialogProps> = ({
  open,
  onOpenChange,
  passHours,
  context,
  onConfirm,
}) => {
  const { t } = useLanguage();
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
        setError(t('breakDialog.errBreakTooSmall'));
        return null;
      }
      if (v > MAX_BREAK_HOURS) {
        setError(t('breakDialog.errBreakTooLong'));
        return null;
      }
      if (v >= passHours) {
        setError(t('breakDialog.errBreakLongerThanShift'));
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
        setError(t('breakDialog.errAnomalyNote'));
        return null;
      }
      return { kind: 'anomaly', note: trimmed };
    }
    setError(t('breakDialog.errChoose'));
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
      setError(e?.message || t('breakDialog.errSave'));
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
            {t('breakDialog.title')}
          </DialogTitle>
          <DialogDescription>
            {t('breakDialog.body', { pass: passLabel, ctx: context ? ` (${context})` : '' })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => { setChoice('break'); setError(null); }}
            className={`w-full text-left rounded-xl border p-3 transition-colors ${
              choice === 'break' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
            }`}
          >
            <div className="font-semibold text-sm">{t('breakDialog.optBreak')}</div>
            <div className="text-xs text-muted-foreground">{t('breakDialog.optBreakDesc')}</div>
            {choice === 'break' && (
              <div className="mt-3 space-y-1">
                <Label htmlFor="break-hours" className="text-xs">{t('breakDialog.breakLabel')}</Label>
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

          <button
            type="button"
            onClick={() => { setChoice('no_break'); setError(null); }}
            className={`w-full text-left rounded-xl border p-3 transition-colors ${
              choice === 'no_break' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
            }`}
          >
            <div className="font-semibold text-sm">{t('breakDialog.optNoBreak')}</div>
            <div className="text-xs text-muted-foreground">{t('breakDialog.optNoBreakDesc')}</div>
          </button>

          <button
            type="button"
            onClick={() => { setChoice('anomaly'); setError(null); }}
            className={`w-full text-left rounded-xl border p-3 transition-colors ${
              choice === 'anomaly' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
            }`}
          >
            <div className="font-semibold text-sm flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              {t('breakDialog.optAnomaly')}
            </div>
            <div className="text-xs text-muted-foreground">{t('breakDialog.optAnomalyDesc')}</div>
            {choice === 'anomaly' && (
              <div className="mt-3 space-y-1">
                <Label htmlFor="anomaly-note" className="text-xs">{t('breakDialog.noteLabel')}</Label>
                <Textarea
                  id="anomaly-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('breakDialog.notePlaceholder')}
                  className="min-h-[64px]"
                  autoFocus
                />
              </div>
            )}
          </button>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="w-full sm:w-auto"
          >
            {t('breakDialog.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !choice}
            className="w-full sm:w-auto"
          >
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {t('breakDialog.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StopBreakDecisionDialog;
