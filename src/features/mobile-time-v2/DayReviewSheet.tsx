/**
 * DayReviewSheet — bottom-sheet som visar EN dags tidrapport.
 *
 * Hela innehållet renderas av UnifiedDayReportView — en sida med
 * arbetstid + tidslinje + kommentar + summering + skicka-in.
 * Inget separat redigerings-läge, ingen timme/minut-fördelning,
 * ingen GPS-debuginfo.
 *
 * Submit går genom V2-APIet (submit-mobile-gps-day-v2). Skriver
 * ALDRIG till time_reports/workdays/location_time_entries/travel_time_logs.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MobileBackHeader } from '@/components/mobile-app/MobileHeader';
import { getMobileGpsDayView, submitMobileGpsDayV2 } from './mobileTimeV2Api';
import UnifiedDayReportView from './UnifiedDayReportView';
import type {
  MobileGpsDayView,
  MobileGpsSubmissionStatus,
  ManualDayPayload,
} from './types';

interface Props {
  staffId: string;
  date: string | null;
  reviewComment?: string | null;
  onClose: () => void;
  onSubmitted?: (date: string) => void;
}

function formatNiceDate(date: string): string {
  try {
    return format(parseISO(date), 'EEEE d MMMM', { locale: sv });
  } catch { return date; }
}

const DayReviewSheet: React.FC<Props> = ({ staffId, date, reviewComment, onClose, onSubmitted }) => {
  const [dayView, setDayView] = useState<MobileGpsDayView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const view = await getMobileGpsDayView({ staffId, date: d });
      setDayView(view);
    } catch (err: any) {
      setError(err?.message || 'Kunde inte ladda dagen');
      setDayView(null);
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useEffect(() => {
    if (!date) return;
    setDayView(null);
    setComment('');
    void load(date);
  }, [date, load]);

  const handleSubmit = useCallback(async (input: ManualDayPayload) => {
    if (!date || !dayView) return;
    setSubmitting(true);
    try {
      await submitMobileGpsDayV2({
        staffId,
        date,
        userComment: input.comment ?? (comment.trim() || null),
        manualOverrides: [],
        expectedSourceSnapshotId: dayView.sourceSnapshotId,
        manualDay: input,
      });
      toast.success('Tidrapport inskickad – väntar godkännande');
      onSubmitted?.(date);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte skicka in');
    } finally {
      setSubmitting(false);
    }
  }, [date, dayView, staffId, comment, onClose, onSubmitted]);

  const status: MobileGpsSubmissionStatus =
    (dayView?.submission?.status ?? 'not_submitted') as MobileGpsSubmissionStatus;

  return (
    <Sheet open={date !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="bottom" className="h-[92dvh] p-0 flex flex-col rounded-t-2xl">
        <div className="flex-1 overflow-y-auto">
          <MobileBackHeader
            title={date ? formatNiceDate(date) : ''}
            onBack={onClose}
          />
          <div className="px-4 pt-4 pb-6 space-y-3">
            {reviewComment && status === 'correction_requested' && (
              <Card className="p-3 border-rose-200 bg-rose-50 text-rose-900">
                <p className="text-xs font-semibold uppercase tracking-wide mb-1">
                  Komplettering begärd
                </p>
                <p className="text-sm">{reviewComment}</p>
              </Card>
            )}

            {loading && !dayView && (
              <Card className="p-6 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Laddar dagen…
              </Card>
            )}
            {error && !loading && (
              <Card className="p-4 border-destructive/40 bg-destructive/5">
                <p className="text-sm font-medium text-destructive">Kunde inte ladda</p>
                <p className="text-xs text-muted-foreground mt-1">{error}</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => date && void load(date)}>
                  Försök igen
                </Button>
              </Card>
            )}

            {dayView && date && (
              <UnifiedDayReportView
                date={date}
                data={dayView}
                status={status}
                userComment={comment}
                onUserCommentChange={setComment}
                onSubmit={handleSubmit}
                isSubmitting={submitting}
              />
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default DayReviewSheet;
