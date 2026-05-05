import React, { useMemo, useState } from 'react';
import { Sun } from 'lucide-react';
import { format, parseISO } from 'date-fns';
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
import { useLanguage } from '@/i18n/LanguageContext';
import type { LateAfterPlannedStartDecision } from '@/hooks/useWorkDayAssistant';

export type LateChoice = 'planned' | 'first_signal' | 'custom' | 'did_not_work';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decision: LateAfterPlannedStartDecision;
  submitting?: boolean;
  onChoose: (choice: LateChoice, customIso?: string) => void | Promise<void>;
}

function fmtHHmm(iso: string): string {
  try { return format(parseISO(iso), 'HH:mm'); } catch { return iso; }
}

export const LateAfterPlannedStartDialog: React.FC<Props> = ({
  open, onOpenChange, decision, submitting, onChoose,
}) => {
  const { t } = useLanguage();
  const plannedHHmm = useMemo(() => fmtHHmm(decision.plannedStartIso), [decision.plannedStartIso]);
  const firstHHmm = useMemo(() => fmtHHmm(decision.firstSignalIso), [decision.firstSignalIso]);
  const [customMode, setCustomMode] = useState(false);
  const [customTime, setCustomTime] = useState<string>(plannedHHmm);

  const buildCustomIso = (): string | undefined => {
    if (!customTime) return undefined;
    const [h, m] = customTime.split(':').map((v) => parseInt(v, 10));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return undefined;
    const base = parseISO(decision.plannedStartIso);
    base.setHours(h, m, 0, 0);
    return base.toISOString();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sun className="h-5 w-5 text-primary" />
            {t('assistant.lateTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('assistant.lateBody', { planned: plannedHHmm, first: firstHHmm })}
            {decision.plannedLabel ? ` (${decision.plannedLabel})` : ''}
          </DialogDescription>
        </DialogHeader>

        {!customMode ? (
          <div className="flex flex-col gap-2 py-2">
            <Button
              variant="default"
              disabled={submitting}
              onClick={() => onChoose('planned')}
            >
              {t('assistant.lateChoosePlanned', { planned: plannedHHmm })}
            </Button>
            <Button
              variant="outline"
              disabled={submitting}
              onClick={() => onChoose('first_signal')}
            >
              {t('assistant.lateChooseFirstGps', { first: firstHHmm })}
            </Button>
            <Button
              variant="outline"
              disabled={submitting}
              onClick={() => setCustomMode(true)}
            >
              {t('assistant.lateChooseCustom')}
            </Button>
            <Button
              variant="ghost"
              disabled={submitting}
              onClick={() => onChoose('did_not_work')}
            >
              {t('assistant.lateChooseDidNotWork')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 py-2">
            <Label htmlFor="late-custom-time">{t('assistant.lateCustomHint')}</Label>
            <Input
              id="late-custom-time"
              type="time"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
            />
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setCustomMode(false)} disabled={submitting}>
                {t('assistant.notNow')}
              </Button>
              <Button
                onClick={() => onChoose('custom', buildCustomIso())}
                disabled={submitting || !customTime}
              >
                OK
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default LateAfterPlannedStartDialog;
