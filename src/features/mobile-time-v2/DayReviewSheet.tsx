/**
 * DayReviewSheet — återanvändbar bottom-sheet för dagsgranskning + submit.
 *
 * Samma loader/preview/editor som MobileTimeReportQueue använder, men
 * inkapslat så att andra ytor (t.ex. WeekFlowMobilePanel) kan öppna en
 * enskild dag utan att ha egen sheet-state.
 *
 * Allt går genom V2-APIet: get-mobile-gps-day-view + submit-mobile-gps-day-v2.
 * Skriver ALDRIG till time_reports/workdays/location_time_entries/travel_time_logs.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MobileBackHeader } from '@/components/mobile-app/MobileHeader';
import { getMobileGpsDayView, submitMobileGpsDayV2 } from './mobileTimeV2Api';
import MobileDayReportPreview from './MobileDayReportPreview';
import ManualWorkSegmentsEditor from './ManualWorkSegmentsEditor';
import type {
  MobileGpsDayView,
  MobileGpsSubmissionStatus,
  ManualDayPayload,
} from './types';

interface Props {
  staffId: string;
  date: string | null;
  /** Förifyllt kommentar från admin (visas vid correction_requested). */
  reviewComment?: string | null;
  onClose: () => void;
  onSubmitted?: (date: string) => void;
}

function formatNiceDate(date: string): string {
  try {
    return format(parseISO(date), 'EEEE d MMMM', { locale: sv });
  } catch { return date; }
}

function sheetStatusLabel(s: MobileGpsSubmissionStatus): string {
  switch (s) {
    case 'not_submitted': return 'Förslag från GPS';
    case 'submitted':
    case 'edited':
    case 'ai_flagged':
    case 'needs_control':
    case 'needs_user_attention': return 'Väntar godkännande';
    case 'correction_requested': return 'Behöver kompletteras';
    case 'approved':
    case 'payroll_approved': return 'Attesterad';
    case 'rejected': return 'Avvisad';
    case 'withdrawn': return 'Återkallad';
    default: return s;
  }
}

const DayReviewSheet: React.FC<Props> = ({ staffId, date, reviewComment, onClose, onSubmitted }) => {
  const [dayView, setDayView] = useState<MobileGpsDayView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editMode, setEditMode] = useState(false);

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
    setEditMode(false);
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
  const isLocked = status === 'approved' || status === 'payroll_approved';

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

            {dayView && date && !editMode && (
              <MobileDayReportPreview
                date={date}
                data={dayView}
                status={status}
                visual={{ label: sheetStatusLabel(status), variant: 'outline' }}
                userComment={comment}
                onUserCommentChange={setComment}
                onSubmit={handleSubmit}
                onEdit={() => setEditMode(true)}
                isSubmitting={submitting}
              />
            )}

            {dayView && date && editMode && (
              <div className="space-y-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2"
                  onClick={() => setEditMode(false)}
                  disabled={submitting}
                >
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  Tillbaka till förslag
                </Button>
                <ManualWorkSegmentsEditor
                  date={date}
                  targets={dayView.manualTargets ?? { assignedTargets: [], locationTargets: [], searchableTargets: [] }}
                  suggestedSegments={dayView.segments ?? []}
                  userComment={comment}
                  onUserCommentChange={setComment}
                  onSubmit={handleSubmit}
                  isSubmitting={submitting}
                  disabled={isLocked}
                  disabledReason={isLocked ? 'Tidrapporten är attesterad och kan inte ändras.' : null}
                />
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default DayReviewSheet;
