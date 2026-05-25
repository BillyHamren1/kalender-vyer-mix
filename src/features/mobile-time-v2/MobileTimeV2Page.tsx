/**
 * MobileTimeV2Page — mobilens "Dagens tidrapport".
 *
 * Renderar färdig Day View från `get-mobile-gps-day-view`. Buffrar manuella
 * tidsändringar lokalt (per segmentKey) tills användaren skickar in dagen
 * via `submit-mobile-gps-day-v2`. Kan även skicka in en manuell tidrapport
 * när GPS-underlag saknas. Använder INGA legacy mobile-time-komponenter eller
 * hooks och INGA legacy tidtabeller.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { format, addDays, subDays, isSameDay } from 'date-fns';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Loader2,
  ClipboardList,
  RefreshCw,
  CheckCircle2,
  Lock,
  AlertCircle,
} from 'lucide-react';

import { useMobileGpsDayView } from './useMobileGpsDayView';
import { submitMobileGpsDayV2 } from './mobileTimeV2Api';
import type {
  MobileGpsDaySegment,
  MobileGpsManualOverride,
  MobileGpsSubmissionStatus,
} from './types';
import MobileGpsSegmentCard from './MobileGpsSegmentCard';
import EditSegmentTimeSheet from './EditSegmentTimeSheet';
import SubmitGpsDayCard from './SubmitGpsDayCard';
import MobileGpsDayMap from './MobileGpsDayMap';
import ManualDayReportCard from './ManualDayReportCard';

type OverrideMap = Record<string, MobileGpsManualOverride>;

interface StatusVisual {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  icon: React.ReactNode;
}

function statusVisual(
  status: MobileGpsSubmissionStatus,
  hasSegments: boolean,
): StatusVisual {
  switch (status) {
    case 'not_submitted':
      return hasSegments
        ? { label: 'Väntar på att du skickar in', variant: 'outline', icon: <AlertCircle className="h-3.5 w-3.5" /> }
        : { label: 'Ingen föreslagen tid', variant: 'outline', icon: <AlertCircle className="h-3.5 w-3.5" /> };
    case 'submitted':
      return { label: 'Väntar attest', variant: 'secondary', icon: <CheckCircle2 className="h-3.5 w-3.5" /> };
    case 'edited':
      return { label: 'Väntar attest · ändrad', variant: 'secondary', icon: <CheckCircle2 className="h-3.5 w-3.5" /> };
    case 'ai_flagged':
      return { label: 'Väntar attest · kontroll', variant: 'secondary', icon: <AlertCircle className="h-3.5 w-3.5" /> };
    case 'needs_user_attention':
      return { label: 'Behöver din uppmärksamhet', variant: 'destructive', icon: <AlertCircle className="h-3.5 w-3.5" /> };
    case 'needs_control':
      return { label: 'Väntar kontroll', variant: 'secondary', icon: <AlertCircle className="h-3.5 w-3.5" /> };
    case 'correction_requested':
      return { label: 'Behöver kompletteras', variant: 'destructive', icon: <AlertCircle className="h-3.5 w-3.5" /> };
    case 'approved':
      return { label: 'Godkänd', variant: 'default', icon: <CheckCircle2 className="h-3.5 w-3.5" /> };
    case 'payroll_approved':
      return { label: 'Godkänd för utbetalning', variant: 'default', icon: <Lock className="h-3.5 w-3.5" /> };
    case 'rejected':
      return { label: 'Avvisad', variant: 'destructive', icon: <AlertCircle className="h-3.5 w-3.5" /> };
    case 'withdrawn':
      return { label: 'Återkallad', variant: 'outline', icon: <AlertCircle className="h-3.5 w-3.5" /> };
    default:
      return { label: status, variant: 'outline', icon: null };
  }
}

const MobileTimeV2Page: React.FC = () => {
  const [date, setDate] = useState<Date>(new Date());
  const dateStr = useMemo(() => format(date, 'yyyy-MM-dd'), [date]);

  const { data, staffId, isLoading, error, refresh } = useMobileGpsDayView(dateStr);

  const [overrides, setOverrides] = useState<OverrideMap>({});
  const [userComment, setUserComment] = useState<string>('');
  const [editingSegment, setEditingSegment] = useState<MobileGpsDaySegment | null>(null);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    setOverrides({});
    setUserComment('');
  }, [dateStr, staffId]);

  const submission = data?.submission ?? null;
  const status: MobileGpsSubmissionStatus =
    (submission?.status ?? 'not_submitted') as MobileGpsSubmissionStatus;
  const isLocked = status === 'approved' || status === 'payroll_approved';
  const isCorrection = status === 'correction_requested';
  const hasSegments = (data?.segments?.length ?? 0) > 0;
  const hasSubmission = !!submission?.hasSubmission;
  const showManualReport = !!data && !isLoading && !hasSegments && !hasSubmission && !isLocked;

  const subtitle = useMemo(() => {
    if (!data) return '';
    if (hasSubmission) return data.subtitle || '';
    if (hasSegments) return 'Granska förslaget, justera vid behov och skicka in.';
    return 'Ingen föreslagen tid hittades. Fyll i tiden manuellt.';
  }, [data, hasSegments, hasSubmission]);

  const handleEdit = useCallback((seg: MobileGpsDaySegment) => {
    setEditingSegment(seg);
    setEditSheetOpen(true);
  }, []);

  const handleSaveOverride = useCallback((override: MobileGpsManualOverride) => {
    setOverrides((prev) => ({ ...prev, [override.segmentKey]: override }));
  }, []);

  const handleClearOverride = useCallback((segmentKey: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[segmentKey];
      return next;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!staffId || !data) return;
    setIsSubmitting(true);
    try {
      const manualOverrides = Object.values(overrides);
      await submitMobileGpsDayV2({
        staffId,
        date: dateStr,
        userComment: userComment.trim() || null,
        manualOverrides,
        expectedSourceSnapshotId: data.sourceSnapshotId,
      });
      toast.success('Tidrapporten är inskickad');
      setOverrides({});
      setUserComment('');
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte skicka in tidrapporten');
    } finally {
      setIsSubmitting(false);
    }
  }, [staffId, data, dateStr, overrides, userComment, refresh]);

  const handleSubmitManual = useCallback(
    async (input: { startTime: string; endTime: string; breakMinutes: number }) => {
      if (!staffId || !data) return;
      setIsSubmitting(true);
      try {
        await submitMobileGpsDayV2({
          staffId,
          date: dateStr,
          userComment: userComment.trim() || null,
          manualOverrides: [],
          expectedSourceSnapshotId: data.sourceSnapshotId,
          manualDay: input,
        });
        toast.success('Tidrapporten är inskickad');
        setUserComment('');
        await refresh();
      } catch (err: any) {
        toast.error(err?.message || 'Kunde inte skicka in tidrapporten');
      } finally {
        setIsSubmitting(false);
      }
    },
    [staffId, data, dateStr, userComment, refresh],
  );

  const isToday = isSameDay(date, new Date());
  const visual = statusVisual(status, hasSegments);

  return (
    <div className="flex flex-col min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="px-5 pt-6 pb-4 bg-card border-b">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
          <ClipboardList className="h-3.5 w-3.5" />
          Tidrapport
        </div>
        <h1 className="text-2xl font-semibold mt-1">Dagens tidrapport</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        )}

        {/* Date picker */}
        <div className="flex items-center justify-between gap-2 mt-4">
          <Button
            size="icon"
            variant="outline"
            onClick={() => setDate((d) => subDays(d, 1))}
            aria-label="Föregående dag"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 text-center">
            <div className="font-medium flex items-center justify-center gap-2">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              {format(date, 'EEEE d MMMM yyyy')}
            </div>
            {!isToday && (
              <button
                onClick={() => setDate(new Date())}
                className="text-xs text-primary mt-0.5 hover:underline"
              >
                Gå till idag
              </button>
            )}
          </div>
          <Button
            size="icon"
            variant="outline"
            onClick={() => setDate((d) => addDays(d, 1))}
            aria-label="Nästa dag"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 px-5 pt-4 space-y-4 w-full min-w-0 max-w-full box-border">
        {/* Status banner — visa alltid för tydlighet */}
        {data && (
          <div className="flex items-center justify-between gap-2">
            <Badge variant={visual.variant} className="gap-1.5 px-2.5 py-1">
              {visual.icon}
              {visual.label}
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        )}

        {isCorrection && submission?.reviewComment && (
          <Card className="p-4 border-destructive/40 bg-destructive/5">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-destructive">Behöver kompletteras</p>
                <p className="text-sm text-foreground/80 mt-1 whitespace-pre-wrap">
                  {submission.reviewComment}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Loading */}
        {isLoading && !data && (
          <Card className="p-6 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Laddar dagens tidrapport…
          </Card>
        )}

        {/* Error */}
        {error && !isLoading && (
          <Card className="p-4 border-destructive/40 bg-destructive/5">
            <p className="text-sm font-medium text-destructive">Kunde inte ladda dagen</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => void refresh()}>
              Försök igen
            </Button>
          </Card>
        )}

        {/* Summary — totaler från backend */}
        {data && !isLoading && hasSegments && (
          <Card className="p-4">
            <div className="text-center">
              <p className="text-3xl font-semibold">{data.totals.totalDurationLabel}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total tid</p>
            </div>
            <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
              <span>{data.segments.length} segment</span>
              {data.debug?.rawPingCount > 0 && (
                <span>{data.debug.rawPingCount} GPS-pings</span>
              )}
            </div>
            {Object.keys(overrides).length > 0 && (
              <p className="mt-2 text-xs text-amber-600">
                Osparade ändringar finns. Totalen uppdateras efter inskick.
              </p>
            )}
          </Card>
        )}

        {/* Segments */}
        {data && hasSegments && (
          <div className="space-y-2.5">
            {data.segments.map((seg) => {
              const buffered = overrides[seg.segmentKey];
              const displaySegment: MobileGpsDaySegment = buffered
                ? {
                    ...seg,
                    currentStartTime: buffered.startIso ?? seg.currentStartTime,
                    currentEndTime: buffered.endIso ?? seg.currentEndTime,
                    manualOverride: {
                      hasOverride: true,
                      reason: buffered.reason ?? null,
                    },
                  }
                : seg;
              return (
                <MobileGpsSegmentCard
                  key={seg.segmentKey}
                  segment={displaySegment}
                  hasUnsavedOverride={!!buffered}
                  onEdit={handleEdit}
                  disabled={isLocked}
                />
              );
            })}
          </div>
        )}

        {/* Submit — GPS-förslag finns */}
        {data && hasSegments && (
          <SubmitGpsDayCard
            segmentCount={data.segments.length}
            totalLabel={data.totals.totalDurationLabel}
            overrideCount={Object.keys(overrides).length}
            userComment={userComment}
            onUserCommentChange={setUserComment}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            disabled={isLocked}
            disabledReason={
              isLocked
                ? status === 'payroll_approved'
                  ? 'Tidrapporten är godkänd för utbetalning och kan inte ändras.'
                  : 'Tidrapporten är godkänd och kan inte ändras.'
                : null
            }
          />
        )}

        {/* Manuell rapport när GPS/förslag saknas */}
        {showManualReport && (
          <>
            <Card className="p-4">
              <p className="text-sm font-medium">Ingen föreslagen tid hittades</p>
              <p className="text-xs text-muted-foreground mt-1">
                Du kan ändå fylla i dagens arbetstid manuellt och skicka in.
              </p>
            </Card>
            <ManualDayReportCard
              date={dateStr}
              userComment={userComment}
              onUserCommentChange={setUserComment}
              onSubmitManual={handleSubmitManual}
              isSubmitting={isSubmitting}
              disabled={isLocked}
              disabledReason={null}
            />
          </>
        )}

        {/* GPS-underlag (kompakt, kan fällas ut) */}
        {data && !isLoading && (
          <MobileGpsDayMap map={data.map} />
        )}
      </div>

      <EditSegmentTimeSheet
        segment={editingSegment}
        date={dateStr}
        open={editSheetOpen}
        onOpenChange={setEditSheetOpen}
        onSave={handleSaveOverride}
        onClear={handleClearOverride}
        existingOverride={editingSegment ? overrides[editingSegment.segmentKey] ?? null : null}
      />
    </div>
  );
};

// Inga lokala duration- eller totalberäkningar i denna fil.
// Backend (`get-mobile-gps-day-view` / `submit-mobile-gps-day-v2`) äger all tidsräkning.

export default MobileTimeV2Page;
