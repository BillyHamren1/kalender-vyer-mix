/**
 * MobileTimeV2Page — startsida för /m/report.
 *
 * Två lägen:
 *   1) Rapportkö (default) — översikt över de senaste 14 dagarna
 *   2) Dagvy — när användaren öppnar en specifik dag
 *
 * Använder ENBART:
 *   - get-mobile-time-report-queue
 *   - get-mobile-gps-day-view
 *   - submit-mobile-gps-day-v2
 * Inga legacy mobile-time-komponenter, inga legacy tidtabeller.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeft, Loader2, RefreshCw, CheckCircle2, Lock, AlertCircle,
} from 'lucide-react';

import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useMobileGpsDayView } from './useMobileGpsDayView';
import { submitMobileGpsDayV2 } from './mobileTimeV2Api';
import type {
  MobileGpsDaySegment,
  MobileGpsManualOverride,
  MobileGpsSubmissionStatus,
  ManualWorkSegmentInput,
} from './types';
import MobileGpsSegmentCard from './MobileGpsSegmentCard';
import EditSegmentTimeSheet from './EditSegmentTimeSheet';
import SubmitGpsDayCard from './SubmitGpsDayCard';
import MobileGpsDayMap from './MobileGpsDayMap';
import MobileTimeReportQueue from './MobileTimeReportQueue';
import ManualWorkSegmentsEditor from './ManualWorkSegmentsEditor';

type OverrideMap = Record<string, MobileGpsManualOverride>;

interface StatusVisual {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  icon: React.ReactNode;
}

function statusVisual(status: MobileGpsSubmissionStatus, hasSegments: boolean): StatusVisual {
  switch (status) {
    case 'not_submitted':
      return hasSegments
        ? { label: 'Väntar på dig', variant: 'outline', icon: <AlertCircle className="h-3.5 w-3.5" /> }
        : { label: 'Rapportera manuellt', variant: 'outline', icon: <AlertCircle className="h-3.5 w-3.5" /> };
    case 'submitted':
      return { label: 'Väntar attest', variant: 'secondary', icon: <CheckCircle2 className="h-3.5 w-3.5" /> };
    case 'edited':
      return { label: 'Väntar attest · ändrad', variant: 'secondary', icon: <CheckCircle2 className="h-3.5 w-3.5" /> };
    case 'ai_flagged':
    case 'needs_control':
      return { label: 'Väntar kontroll', variant: 'secondary', icon: <AlertCircle className="h-3.5 w-3.5" /> };
    case 'needs_user_attention':
      return { label: 'Behöver din uppmärksamhet', variant: 'destructive', icon: <AlertCircle className="h-3.5 w-3.5" /> };
    case 'correction_requested':
      return { label: 'Behöver kompletteras', variant: 'destructive', icon: <AlertCircle className="h-3.5 w-3.5" /> };
    case 'approved':
      return { label: 'Godkänd', variant: 'default', icon: <CheckCircle2 className="h-3.5 w-3.5" /> };
    case 'payroll_approved':
      return { label: 'Godkänd', variant: 'default', icon: <Lock className="h-3.5 w-3.5" /> };
    case 'rejected':
      return { label: 'Avvisad', variant: 'destructive', icon: <AlertCircle className="h-3.5 w-3.5" /> };
    case 'withdrawn':
      return { label: 'Återkallad', variant: 'outline', icon: <AlertCircle className="h-3.5 w-3.5" /> };
    default:
      return { label: status, variant: 'outline', icon: null };
  }
}

// ============================================================================
// Dagvy — visas när en dag valts från kön
// ============================================================================
interface DayViewProps {
  date: string;
  onBack: () => void;
}

const DayView: React.FC<DayViewProps> = ({ date, onBack }) => {
  const { data, staffId, isLoading, error, refresh } = useMobileGpsDayView(date);

  const [overrides, setOverrides] = useState<OverrideMap>({});
  const [userComment, setUserComment] = useState<string>('');
  const [editingSegment, setEditingSegment] = useState<MobileGpsDaySegment | null>(null);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    setOverrides({});
    setUserComment('');
  }, [date, staffId]);

  const submission = data?.submission ?? null;
  const status: MobileGpsSubmissionStatus =
    (submission?.status ?? 'not_submitted') as MobileGpsSubmissionStatus;
  const isLocked = status === 'approved' || status === 'payroll_approved';
  const isCorrection = status === 'correction_requested';
  const hasSegments = (data?.segments?.length ?? 0) > 0;
  const hasSubmission = !!submission?.hasSubmission;
  const showManualReport = !!data && !isLoading && !hasSegments && !hasSubmission && !isLocked;
  const manualTargets = data?.manualTargets ?? {
    assignedTargets: [], locationTargets: [], searchableTargets: [],
  };

  const niceDate = useMemo(() => {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return format(dt, 'EEEE d MMMM yyyy');
  }, [date]);

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
        staffId, date,
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
  }, [staffId, data, date, overrides, userComment, refresh]);

  const handleSubmitManual = useCallback(
    async (input: { segments: ManualWorkSegmentInput[]; comment: string | null }) => {
      if (!staffId || !data) return;
      setIsSubmitting(true);
      try {
        await submitMobileGpsDayV2({
          staffId, date,
          userComment: input.comment ?? (userComment.trim() || null),
          manualOverrides: [],
          expectedSourceSnapshotId: data.sourceSnapshotId,
          manualDay: { segments: input.segments, comment: input.comment },
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
    [staffId, data, date, userComment, refresh],
  );

  const visual = statusVisual(status, hasSegments);

  return (
    <div className="flex flex-col min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 bg-card border-b">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground -ml-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Alla dagar
        </button>
        <h1 className="text-xl font-semibold mt-1.5 capitalize">{niceDate}</h1>
      </div>

      <div className="flex-1 px-4 pt-3 space-y-3 w-full min-w-0 max-w-full">
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
          <Card className="p-3.5 border-destructive/40 bg-destructive/5">
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

        {isLoading && !data && (
          <Card className="p-6 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Laddar dagen…
          </Card>
        )}

        {error && !isLoading && (
          <Card className="p-4 border-destructive/40 bg-destructive/5">
            <p className="text-sm font-medium text-destructive">Kunde inte ladda</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => void refresh()}>
              Försök igen
            </Button>
          </Card>
        )}

        {/* GPS-förslag */}
        {data && hasSegments && (
          <>
            <Card className="p-4">
              <div className="text-center">
                <p className="text-3xl font-semibold">{data.totals.totalDurationLabel}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Föreslaget</p>
              </div>
              <div className="mt-3 pt-3 border-t flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{data.segments.length} segment</span>
                {data.debug?.rawPingCount > 0 && (
                  <span>{data.debug.rawPingCount} GPS-pings</span>
                )}
              </div>
              {Object.keys(overrides).length > 0 && (
                <p className="mt-2 text-[11px] text-amber-600">
                  Osparade ändringar. Totalen uppdateras efter inskick.
                </p>
              )}
            </Card>

            <div className="space-y-2">
              {data.segments.map((seg) => {
                const buffered = overrides[seg.segmentKey];
                const displaySegment: MobileGpsDaySegment = buffered
                  ? {
                      ...seg,
                      currentStartTime: buffered.startIso ?? seg.currentStartTime,
                      currentEndTime: buffered.endIso ?? seg.currentEndTime,
                      manualOverride: { hasOverride: true, reason: buffered.reason ?? null },
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
          </>
        )}

        {/* Manuell rapport (inga GPS-förslag och ingen submission) */}
        {showManualReport && (
          <ManualWorkSegmentsEditor
            date={date}
            targets={manualTargets}
            userComment={userComment}
            onUserCommentChange={setUserComment}
            onSubmit={handleSubmitManual}
            isSubmitting={isSubmitting}
            disabled={isLocked}
            disabledReason={null}
          />
        )}

        {/* GPS-underlag — bara om det faktiskt finns pings */}
        {data && !isLoading && data.map?.hasPings && (
          <MobileGpsDayMap map={data.map} />
        )}
      </div>

      <EditSegmentTimeSheet
        segment={editingSegment}
        date={date}
        open={editSheetOpen}
        onOpenChange={setEditSheetOpen}
        onSave={handleSaveOverride}
        onClear={handleClearOverride}
        existingOverride={editingSegment ? overrides[editingSegment.segmentKey] ?? null : null}
      />
    </div>
  );
};

// ============================================================================
// Toppnivå
// ============================================================================
const MobileTimeV2Page: React.FC = () => {
  const { effectiveStaffId } = useMobileAuth();
  const staffId = effectiveStaffId ?? null;
  const [openDate, setOpenDate] = useState<string | null>(null);

  if (!staffId) {
    return (
      <div className="flex flex-col min-h-screen bg-background items-center justify-center p-8">
        <Card className="p-6 max-w-sm text-center">
          <p className="text-sm text-muted-foreground">Logga in för att se din tidrapport.</p>
        </Card>
      </div>
    );
  }

  if (openDate) {
    return <DayView date={openDate} onBack={() => setOpenDate(null)} />;
  }

  return (
    <MobileTimeReportQueue
      staffId={staffId}
      onOpenDay={(date) => setOpenDate(date)}
    />
  );
};

export default MobileTimeV2Page;
