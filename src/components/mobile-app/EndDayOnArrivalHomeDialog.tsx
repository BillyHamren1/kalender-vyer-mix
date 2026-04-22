/**
 * EndDayOnArrivalHomeDialog
 * ─────────────────────────
 * Hard copy rule: the words "hem", "hemma", "bostad" must NOT appear in
 * any user-visible string.
 */
import { useMemo, useState } from 'react';
import { Clock, MapPin, Check, X, Pencil } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { EndDayOnHomeSuggestion } from '@/hooks/useEndDayOnArrivalHome';
import { useLanguage } from '@/i18n/LanguageContext';

// Kept for the copy-contract test (asserts no "hem"/"hemma"/"bostad").
// The component itself uses translations; this constant mirrors the SV copy.
export const END_DAY_HOME_COPY = {
  title: 'Avsluta dagen?',
  body: (place: string, time: string) =>
    `Jag misstänker att du avslutade din arbetsdag när du lämnade ${place} kl ${time}. Stämmer detta och du vill rapportera din tid?`,
  yes: (time: string) => `Ja, rapportera till ${time}`,
  no: 'Nej, jag ska tillbaka',
  custom: 'Anpassa tid',
} as const;

interface Props {
  suggestion: EndDayOnHomeSuggestion;
  onAccept: (chosenEndIso: string) => void | Promise<void>;
  onDismiss: (silenceForToday: boolean) => void;
}

export default function EndDayOnArrivalHomeDialog({ suggestion, onAccept, onDismiss }: Props) {
  const { t } = useLanguage();
  const [picking, setPicking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const exitDate = useMemo(() => parseISO(suggestion.exitedAtIso), [suggestion.exitedAtIso]);
  const exitTimeLabel = format(exitDate, 'HH:mm');
  const [chosenTime, setChosenTime] = useState(exitTimeLabel);

  const handleAcceptSuggested = async () => {
    setSubmitting(true);
    try { await onAccept(suggestion.exitedAtIso); } finally { setSubmitting(false); }
  };

  const handleAcceptCustom = async () => {
    const [hh, mm] = chosenTime.split(':').map((n) => parseInt(n, 10));
    if (Number.isNaN(hh) || Number.isNaN(mm)) return;
    const dt = new Date(exitDate);
    dt.setHours(hh, mm, 0, 0);
    setSubmitting(true);
    try { await onAccept(dt.toISOString()); } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-card rounded-t-3xl shadow-2xl border-t border-border/50 p-6 pb-10 animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <h3 className="font-bold text-foreground text-base">{t('endHome.title')}</h3>
          </div>
          <button
            onClick={() => onDismiss(false)}
            className="p-2 rounded-xl hover:bg-muted/60 transition-colors"
            disabled={submitting}
            aria-label={t('endHome.close')}
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <p className="text-sm text-foreground leading-relaxed mb-5">
          {t('endHome.body', { place: suggestion.workplaceName, time: exitTimeLabel })}
        </p>

        <div className="rounded-2xl bg-muted/40 border border-border/50 p-3.5 mb-5 flex items-center gap-2.5">
          <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium text-foreground">{suggestion.workplaceName}</span>
          <span className="ml-auto text-sm font-mono font-semibold text-primary">{exitTimeLabel}</span>
        </div>

        {picking ? (
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-foreground">{t('endHome.pickEnd')}</label>
            <input
              type="time"
              value={chosenTime}
              onChange={(e) => setChosenTime(e.target.value)}
              className="w-full rounded-xl border border-border/60 bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              disabled={submitting}
            />
            <button
              onClick={handleAcceptCustom}
              disabled={submitting}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {submitting ? t('endHome.saving') : t('endHome.endAt', { time: chosenTime })}
            </button>
            <button
              onClick={() => setPicking(false)}
              disabled={submitting}
              className="w-full py-2.5 rounded-2xl text-muted-foreground font-medium text-xs hover:bg-muted/40"
            >
              {t('endHome.back')}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              onClick={handleAcceptSuggested}
              disabled={submitting}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {t('endHome.yes', { time: exitTimeLabel })}
            </button>
            <button
              onClick={() => onDismiss(true)}
              disabled={submitting}
              className="w-full py-3 rounded-2xl bg-muted text-foreground font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {t('endHome.no')}
            </button>
            <button
              onClick={() => setPicking(true)}
              disabled={submitting}
              className="w-full py-2.5 rounded-2xl text-muted-foreground font-medium text-xs hover:bg-muted/40 flex items-center justify-center gap-2"
            >
              <Pencil className="w-3.5 h-3.5" />
              {t('endHome.custom')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
