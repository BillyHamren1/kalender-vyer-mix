/**
 * MobileTimeV2Page — startsida för /m/report.
 *
 * Två lägen:
 *   1) Rapportkö (default) — översikt över de senaste 14 dagarna
 *   2) Dagvy — när användaren öppnar en specifik dag
 *
 * Dagvyn använder den unified ManualWorkSegmentsEditor — användaren fyller
 * först i hela dagen (start/slut/rast) och fördelar sedan tid på block.
 * GPS-förslag blir initiala block (med sourceSegmentId) som kan ändras
 * eller tas bort med papperskorgen.
 *
 * Använder ENBART:
 *   - get-mobile-time-report-queue
 *   - get-mobile-gps-day-view
 *   - submit-mobile-gps-day-v2
 */
import React, { useCallback, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, RefreshCw, CheckCircle2, Lock, AlertCircle,
} from 'lucide-react';

import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useMobileGpsDayView } from './useMobileGpsDayView';
import { submitMobileGpsDayV2 } from './mobileTimeV2Api';
import type {
  MobileGpsSubmissionStatus,
  ManualDayPayload,
} from './types';
import MobileTimeReportQueue from './MobileTimeReportQueue';
import ManualWorkSegmentsEditor from './ManualWorkSegmentsEditor';
import MobileDayReportPreview from './MobileDayReportPreview';
import { MobileBackHeader } from '@/components/mobile-app/MobileHeader';
import { ArrowLeft } from 'lucide-react';

interface StatusVisual {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  icon: React.ReactNode;
}

function statusVisual(status: MobileGpsSubmissionStatus): StatusVisual {
  switch (status) {
    case 'not_submitted':
      return { label: 'Väntar på dig', variant: 'outline', icon: <AlertCircle className="h-3.5 w-3.5" /> };
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
// Dagvy
// ============================================================================
interface DayViewProps {
  date: string;
  onBack: () => void;
}

const DayView: React.FC<DayViewProps> = ({ date, onBack }) => {
  const { data, staffId, isLoading, error, refresh } = useMobileGpsDayView(date);

  const [userComment, setUserComment] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  React.useEffect(() => {
    setUserComment('');
  }, [date, staffId]);

  const submission = data?.submission ?? null;
  const status: MobileGpsSubmissionStatus =
    (submission?.status ?? 'not_submitted') as MobileGpsSubmissionStatus;
  const isLocked = status === 'approved' || status === 'payroll_approved';
  const isCorrection = status === 'correction_requested';
  const manualTargets = data?.manualTargets ?? {
    assignedTargets: [], locationTargets: [], searchableTargets: [],
  };
  const suggestedSegments = data?.segments ?? [];

  const niceDate = useMemo(() => {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return format(dt, 'EEEE d MMMM yyyy');
  }, [date]);

  const handleSubmit = useCallback(
    async (input: ManualDayPayload) => {
      if (!staffId || !data) return;
      setIsSubmitting(true);
      try {
        await submitMobileGpsDayV2({
          staffId, date,
          userComment: input.comment ?? (userComment.trim() || null),
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
    [staffId, data, date, userComment, refresh],
  );

  const visual = statusVisual(status);

  return (
    <div className="flex flex-col min-h-screen bg-background pb-28">
      <MobileBackHeader
        title={niceDate}
        subtitle={visual.label}
        onBack={onBack}
        rightAction={
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void refresh()}
            disabled={isLoading}
            aria-label="Uppdatera"
            className="h-9 w-9 rounded-xl text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        }
      />

      <div className="flex-1 px-4 pt-4 space-y-3 w-full min-w-0 max-w-full">
        {data && (
          <div className="flex items-center justify-between gap-2">
            <Badge variant={visual.variant} className="gap-1.5 px-2.5 py-1">
              {visual.icon}
              {visual.label}
            </Badge>
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

        {/* Unified day editor — alltid (när data finns och inte låst) */}
        {data && !isLoading && (
          <ManualWorkSegmentsEditor
            date={date}
            targets={manualTargets}
            suggestedSegments={suggestedSegments}
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

        {/* GPS-underlag — bara om det faktiskt finns pings */}
        {data && !isLoading && data.map?.hasPings && (
          <MobileGpsDayMap map={data.map} />
        )}
      </div>
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
