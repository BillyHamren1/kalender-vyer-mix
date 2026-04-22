import { useState } from 'react';
import { MapPin, Clock, MessageSquare, Check, X, Briefcase, Home, Sparkles } from 'lucide-react';
import { TravelCompletedInfo } from '@/hooks/useTravelDetection';
import { mobileApi } from '@/services/mobileApiService';
import { toast } from 'sonner';
import { useArrivalContext } from '@/hooks/useArrivalContext';
import SmartArrivalSuggestion from './SmartArrivalSuggestion';
import type { UnplannedVisit } from '@/hooks/useUnplannedSiteVisit';
import { useLanguage } from '@/i18n/LanguageContext';

interface TravelCompletedDialogProps {
  info: TravelCompletedInfo;
  onDismiss: () => void;
  onAcceptedVisit?: (visit: UnplannedVisit) => void;
}

function formatDuration(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m} min`;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export default function TravelCompletedDialog({ info, onDismiss, onAcceptedVisit }: TravelCompletedDialogProps) {
  const { t } = useLanguage();
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [smartResolved, setSmartResolved] = useState(false);
  const { suggestion } = useArrivalContext(info, !smartResolved);

  const needsClassification = info.classification === 'unclassified' && !info.matchedBookingId;

  const persist = async (
    classification: 'work' | 'personal' | 'unclassified' | null,
  ) => {
    setSaving(true);
    try {
      if (comment.trim() || (!info.matchedBookingId && info.toAddress)) {
        await mobileApi.updateTravelLog({
          travel_log_id: info.travelLogId,
          description: comment || undefined,
          manual_project_name: info.matchedBookingId
            ? undefined
            : (info.toAddress || 'Unknown location'),
        });
      }
      if (classification) {
        await mobileApi.classifyTravelLog({
          travel_log_id: info.travelLogId,
          classification,
        });
      }
      toast.success(
        classification === 'personal'
          ? t('travel.markedPersonal')
          : classification === 'work'
            ? t('travel.savedWork')
            : t('travel.savedAdminFollow'),
      );
      onDismiss();
    } catch (err) {
      console.error('[TravelCompleted] Save failed:', err);
      toast.error(t('travel.couldNotSave'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-card rounded-t-3xl shadow-2xl border-t border-border/50 p-6 pb-10 animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-base">{t('travel.completed')}</h3>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>{formatDuration(info.hoursWorked)}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="p-2 rounded-xl hover:bg-muted/60 transition-colors"
            disabled={saving}
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="rounded-2xl bg-muted/40 border border-border/50 p-4 mb-4">
          <p className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground mb-1">
            {t('travel.destination')}
          </p>
          <p className="text-sm font-semibold text-foreground">
            {info.toAddress || t('travel.unknownPlace')}
          </p>
          {info.matchedBookingId && (
            <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
              <Sparkles className="w-3 h-3" />
              {t('travel.matchedBooking')}
            </span>
          )}
        </div>

        {suggestion && !smartResolved && (
          <SmartArrivalSuggestion
            suggestion={suggestion}
            travel={info}
            onAcceptedVisit={(v) => {
              onAcceptedVisit?.(v);
              setSmartResolved(true);
              onDismiss();
            }}
            onResolved={() => setSmartResolved(true)}
          />
        )}

        {!info.matchedBookingId && (
          <div className="mb-5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-2">
              <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
              {t('travel.whatDidYouDo')}
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t('travel.describePlaceholder')}
              className="w-full rounded-xl border border-border/60 bg-background px-4 py-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              rows={2}
              disabled={saving}
            />
          </div>
        )}

        {needsClassification ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground mb-1">
              {t('travel.wasItWork')}
            </p>
            <button
              onClick={() => persist('work')}
              disabled={saving}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <Briefcase className="w-4 h-4" />
              {t('travel.yesWork')}
            </button>
            <button
              onClick={() => persist('personal')}
              disabled={saving}
              className="w-full py-3 rounded-2xl bg-muted text-foreground font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <Home className="w-4 h-4" />
              {t('travel.noPersonal')}
            </button>
            <button
              onClick={() => persist(null)}
              disabled={saving}
              className="w-full py-2.5 rounded-2xl text-muted-foreground font-medium text-xs hover:bg-muted/40 transition-all disabled:opacity-50"
            >
              {t('travel.decideLater')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => persist('work')}
            disabled={saving}
            className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            {saving ? t('travel.saving') : t('travel.save')}
          </button>
        )}
      </div>
    </div>
  );
}
