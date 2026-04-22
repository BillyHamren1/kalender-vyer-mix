import React, { useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Coffee, Briefcase, Loader2, AlertCircle } from 'lucide-react';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import { sv, enUS } from 'date-fns/locale';
import { mobileApi } from '@/services/mobileApiService';
import { toast } from 'sonner';
import { useLanguage } from '@/i18n/LanguageContext';

type PendingAnomaly = {
  id: string;
  location_id: string | null;
  booking_id: string | null;
  large_project_id: string | null;
  location_name: string | null;
  started_at: string;
  ended_at: string;
  duration_minutes: number;
  classification: 'break' | 'work' | null;
  work_description: string | null;
  time_report_id: string | null;
};

type LocalChoice = {
  classification: 'break' | 'work' | null;
  description: string;
};

interface AnomalyClassificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
}

const COMMENT_THRESHOLD_MIN = 10;

export const AnomalyClassificationDialog: React.FC<AnomalyClassificationDialogProps> = ({
  open,
  onOpenChange,
  onCompleted,
}) => {
  const { t, locale } = useLanguage();
  const dateLocale = locale === 'en' ? enUS : sv;
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [anomalies, setAnomalies] = useState<PendingAnomaly[]>([]);
  const [choices, setChoices] = useState<Record<string, LocalChoice>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await mobileApi.listPendingAnomalies();
      setAnomalies(res.anomalies || []);
      setChoices(prev => {
        const next: Record<string, LocalChoice> = {};
        for (const a of res.anomalies || []) {
          next[a.id] = prev[a.id] || { classification: null, description: '' };
        }
        return next;
      });
    } catch (e: any) {
      toast.error(e?.message || t('anomaly.fetchFail'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const setChoice = (id: string, partial: Partial<LocalChoice>) => {
    setChoices(prev => ({ ...prev, [id]: { ...prev[id], ...partial } }));
  };

  const isComplete = anomalies.every(a => {
    const c = choices[a.id];
    if (!c?.classification) return false;
    if (c.classification === 'work' && a.duration_minutes > COMMENT_THRESHOLD_MIN && !c.description.trim()) return false;
    return true;
  });

  const handleSubmit = async () => {
    if (!isComplete) return;
    setSubmitting(true);
    try {
      for (const a of anomalies) {
        const c = choices[a.id];
        await mobileApi.classifyAnomaly({
          anomaly_id: a.id,
          classification: c.classification!,
          work_description:
            c.classification === 'work' && a.duration_minutes > COMMENT_THRESHOLD_MIN
              ? c.description.trim()
              : undefined,
        });
      }
      toast.success(t('anomaly.saved'));
      onCompleted?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || t('anomaly.saveFail'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            {t('anomaly.title')}
          </DialogTitle>
          <DialogDescription>{t('anomaly.body')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto flex-1 -mx-1 px-1">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> {t('anomaly.loading')}
            </div>
          ) : anomalies.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {t('anomaly.none')}
            </div>
          ) : (
            anomalies.map(a => {
              const c = choices[a.id] || { classification: null, description: '' };
              const start = parseISO(a.started_at);
              const end = parseISO(a.ended_at);
              const durMin = a.duration_minutes ?? differenceInMinutes(end, start);
              const requiresComment = c.classification === 'work' && durMin > COMMENT_THRESHOLD_MIN;
              const commentMissing = requiresComment && !c.description.trim();

              return (
                <div key={a.id} className="rounded-lg border bg-card p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium capitalize">
                        {format(start, 'EEEE d MMM', { locale: dateLocale })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(start, 'HH:mm')}–{format(end, 'HH:mm')}
                        {a.location_name ? ` · ${a.location_name}` : ''}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {durMin} min
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={c.classification === 'break' ? 'default' : 'outline'}
                      size="sm"
                      className="rounded-xl"
                      onClick={() => setChoice(a.id, { classification: 'break', description: '' })}
                    >
                      <Coffee className="h-4 w-4 mr-1" /> {t('anomaly.break')}
                    </Button>
                    <Button
                      type="button"
                      variant={c.classification === 'work' ? 'default' : 'outline'}
                      size="sm"
                      className="rounded-xl"
                      onClick={() => setChoice(a.id, { classification: 'work' })}
                    >
                      <Briefcase className="h-4 w-4 mr-1" /> {t('anomaly.work')}
                    </Button>
                  </div>

                  {requiresComment && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        {t('anomaly.workWhat')} <span className="text-destructive">*</span>
                      </label>
                      <Textarea
                        value={c.description}
                        onChange={e => setChoice(a.id, { description: e.target.value })}
                        placeholder={t('anomaly.workPlaceholder')}
                        className="min-h-[60px] text-sm"
                      />
                      {commentMissing && (
                        <p className="text-xs text-destructive">
                          {t('anomaly.commentRequired', { mins: COMMENT_THRESHOLD_MIN })}
                        </p>
                      )}
                    </div>
                  )}

                  {c.classification === 'break' && (
                    <p className="text-xs text-muted-foreground">
                      {t('anomaly.deductedHours', { hours: (durMin / 60).toFixed(2) })}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('anomaly.later')}
          </Button>
          <Button onClick={handleSubmit} disabled={!isComplete || submitting || anomalies.length === 0}>
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {t('anomaly.saveAll')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AnomalyClassificationDialog;
