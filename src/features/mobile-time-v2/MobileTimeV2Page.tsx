/**
 * MobileTimeV2Page — mobilens nya "Dagens GPS" tidrapportvy.
 *
 * Renderar färdig GPS Day View från `get-mobile-gps-day-view`. Buffrar
 * manuella tidsändringar lokalt (per segmentKey) tills användaren skickar
 * in dagen via `submit-mobile-gps-day-v2`. Använder INGA legacy
 * mobile-time-komponenter eller hooks.
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
  Satellite,
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

type OverrideMap = Record<string, MobileGpsManualOverride>;

interface StatusVisual {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  icon: React.ReactNode;
}

function statusVisual(status: MobileGpsSubmissionStatus): StatusVisual {
  switch (status) {
    case 'not_submitted':
      return { label: 'Ej inskickad', variant: 'outline', icon: <AlertCircle className="h-3.5 w-3.5" /> };
    case 'submitted':
      return { label: 'Inskickad', variant: 'secondary', icon: <CheckCircle2 className="h-3.5 w-3.5" /> };
    case 'correction_requested':
      return { label: 'Komplettering begärd', variant: 'destructive', icon: <AlertCircle className="h-3.5 w-3.5" /> };
    case 'approved':
      return { label: 'Godkänd', variant: 'default', icon: <CheckCircle2 className="h-3.5 w-3.5" /> };
    case 'payroll_approved':
      return { label: 'Låst för lön', variant: 'default', icon: <Lock className="h-3.5 w-3.5" /> };
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

  // Reset local buffer when the day or staff changes.
  React.useEffect(() => {
    setOverrides({});
    setUserComment('');
  }, [dateStr, staffId]);

  const submission = data?.submission ?? null;
  const status: MobileGpsSubmissionStatus = (submission?.status ?? 'not_submitted') as MobileGpsSubmissionStatus;
  const isLocked = status === 'approved' || status === 'payroll_approved';
  const isCorrection = status === 'correction_requested';

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
      toast.success('Dagen är inskickad');
      setOverrides({});
      setUserComment('');
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte skicka in dagen');
    } finally {
      setIsSubmitting(false);
    }
  }, [staffId, data, dateStr, overrides, userComment, refresh]);

  const isToday = isSameDay(date, new Date());

  return (
    <div className="flex flex-col min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="px-5 pt-6 pb-4 bg-card border-b">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
          <Satellite className="h-3.5 w-3.5" />
          Tidrapport
        </div>
        <h1 className="text-2xl font-semibold mt-1">Dagens GPS</h1>
        {data?.subtitle && (
          <p className="text-sm text-muted-foreground mt-1">{data.subtitle}</p>
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
        {/* Status banner */}
        {data && submission && (
          <div className="flex items-center justify-between gap-2">
            <Badge variant={statusVisual(status).variant} className="gap-1.5 px-2.5 py-1">
              {statusVisual(status).icon}
              {statusVisual(status).label}
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
                <p className="text-sm font-medium text-destructive">Komplettering begärd</p>
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
            Laddar dagens GPS…
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

        {/* Summary — totaler räknas ALDRIG om i appen, kommer alltid från backend */}
        {data && !isLoading && data.segments.length > 0 && (
          <Card className="p-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-semibold">{data.totals.totalDurationLabel}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Totalt</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">{data.subtitle.includes('Arbete') ? extractPart(data.subtitle, 'Arbete') : '—'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Arbete</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">{data.subtitle.includes('Resa') ? extractPart(data.subtitle, 'Resa') : '—'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Resa</p>
              </div>
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

        {/* Map — backend bygger map-data, appen renderar bara */}
        {data && !isLoading && (
          <MobileGpsDayMap map={data.map} />
        )}

        {/* Empty */}
        {data && !isLoading && data.segments.length === 0 && (
          <Card className="p-8 text-center">
            <Satellite className="h-8 w-8 text-muted-foreground/60 mx-auto mb-3" />
            <p className="text-sm font-medium">Ingen GPS registrerad för denna dag.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Här visas dagens GPS-segment när telefonen rapporterat positioner.
            </p>
          </Card>
        )}

        {/* Segments */}
        {data && data.segments.length > 0 && (
          <div className="space-y-2.5">
            {data.segments.map((seg) => {
              const buffered = overrides[seg.segmentKey];
              // VIKTIGT: appen räknar ALDRIG om duration eller durationLabel.
              // Vi visar bara nya start/sluttider och en "Osparad ändring"-flagga.
              // durationLabel/Minutes lämnas orörda — backend räknar om vid submit/refresh.
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

        {/* Submit */}
        {data && data.segments.length > 0 && (
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
                  ? 'Dagen är låst för lön och kan inte ändras.'
                  : 'Dagen är godkänd och kan inte ändras.'
                : null
            }
          />
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

function diffMinutes(startIso: string, endIso: string): number {
  try {
    const a = new Date(startIso).getTime();
    const b = new Date(endIso).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return Math.max(0, Math.round((b - a) / 60000));
  } catch {
    return 0;
  }
}

function minutesToLabel(m: number): string {
  const safe = Math.max(0, Math.round(m));
  const h = Math.floor(safe / 60);
  const mm = safe % 60;
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
}

export default MobileTimeV2Page;
