/**
 * DayBlocksEditor — per-block tidslinje-editor i mobilens dags-sheet.
 *
 * Listar alla tidsblock som speglas från admin-sidan (snapshot.segments) och
 * låter personalen JUSTERA start/slut per projekt/booking/lager-block via
 * mobile-app-api `update_time_report` (samma write-path som admin använder).
 *
 * Mirror-Only-policy:
 *  - Vi summerar/tolkar ALDRIG dagen själva — listan kommer från snapshot.
 *  - Vi skriver endast till time_reports (officiell skrivväg).
 *  - Travel/location/unknown utan timeReportId visas read-only.
 *
 * Approved-block är låsta (server avvisar med 403; vi disablar UI:t).
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, Lock, MapPin, Plane, Building2, HelpCircle, AlertCircle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { mobileApi } from '@/services/mobileApiService';
import { formatStockholmHm } from '@/lib/staff/formatStockholmTime';
import { toast } from '@/hooks/use-toast';
import type { StaffDaySegment, StaffDaySnapshot } from '@/hooks/useStaffDaySnapshot';

interface Props {
  snapshot: StaffDaySnapshot;
  onChanged: () => void;
}

const KIND_ICON: Partial<Record<StaffDaySegment['kind'], any>> = {
  project: Building2,
  booking: Building2,
  warehouse: Building2,
  location: MapPin,
  travel: Plane,
  other_place: MapPin,
  unknown: HelpCircle,
};

const KIND_LABEL: Partial<Record<StaffDaySegment['kind'], string>> = {
  project: 'Projekt',
  booking: 'Projekt',
  warehouse: 'Lager',
  location: 'Plats',
  travel: 'Resa',
  other_place: 'Annan plats',
  unknown: 'Oklart',
  break: 'Rast',
  manual_adjustment: 'Justering',
  active: 'Pågår',
};

function minutesBetween(startHm: string, endHm: string): number {
  if (!/^\d{2}:\d{2}$/.test(startHm) || !/^\d{2}:\d{2}$/.test(endHm)) return 0;
  const [sh, sm] = startHm.split(':').map(Number);
  const [eh, em] = endHm.split(':').map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60;
  return diff;
}

function fmtDur(min: number): string {
  if (min <= 0) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const BlockRow: React.FC<{
  seg: StaffDaySegment;
  onSaved: () => void;
}> = ({ seg, onSaved }) => {
  const trId = seg.refs.timeReportId;
  const editable = !!trId && !seg.approved;
  const Icon = KIND_ICON[seg.kind] ?? HelpCircle;
  const kindLabel = KIND_LABEL[seg.kind] ?? seg.kind;

  const initialStart = formatStockholmHm(seg.startedAt);
  const initialEnd = seg.endedAt ? formatStockholmHm(seg.endedAt) : '';

  const [startHm, setStartHm] = useState(initialStart);
  const [endHm, setEndHm] = useState(initialEnd);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setStartHm(initialStart);
    setEndHm(initialEnd);
  }, [initialStart, initialEnd]);

  const dirty = editable && (startHm !== initialStart || endHm !== initialEnd);
  const dur = minutesBetween(startHm, endHm);
  const invalid = editable && (!startHm || !endHm || dur <= 0);

  const handleSave = async () => {
    if (!trId || !dirty || invalid) return;
    setSaving(true);
    try {
      await mobileApi.updateTimeReport({
        time_report_id: trId,
        start_time: startHm,
        end_time: endHm,
      });
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1600);
      onSaved();
      toast({ title: 'Sparat', description: `${seg.label} uppdaterad.` });
    } catch (err) {
      toast({
        title: 'Kunde inte spara',
        description: err instanceof Error ? err.message : 'Okänt fel',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn(
      'rounded-xl border px-3 py-2.5 transition-colors',
      seg.approved ? 'border-emerald-500/30 bg-emerald-500/5' :
        editable ? 'border-border bg-card' : 'border-border bg-muted/30',
    )}>
      <div className="flex items-start gap-2.5">
        <div className="shrink-0 w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center mt-0.5">
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">{kindLabel}</span>
            {seg.approved && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                <Lock className="w-2.5 h-2.5" /> Låst
              </span>
            )}
            {!editable && !seg.approved && (
              <span className="text-[10px] text-muted-foreground">Read-only</span>
            )}
          </div>
          <p className="text-sm font-bold text-foreground truncate mt-0.5">{seg.label}</p>

          <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center">
            <input
              type="time"
              value={startHm}
              disabled={!editable || saving}
              onChange={(e) => setStartHm(e.target.value)}
              className={cn(
                'rounded-md border border-border bg-background px-2 py-1.5 text-sm tabular-nums',
                (!editable || saving) && 'opacity-60',
              )}
            />
            <input
              type="time"
              value={endHm}
              disabled={!editable || saving}
              onChange={(e) => setEndHm(e.target.value)}
              className={cn(
                'rounded-md border border-border bg-background px-2 py-1.5 text-sm tabular-nums',
                (!editable || saving) && 'opacity-60',
              )}
            />
            <span className="text-[11px] tabular-nums text-muted-foreground px-1 whitespace-nowrap">
              {fmtDur(dur || seg.durationMinutes)}
            </span>
          </div>

          {editable && (
            <div className="mt-2 flex items-center justify-end gap-2">
              {invalid && dirty && (
                <span className="text-[11px] text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Ogiltig tid
                </span>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={!dirty || invalid || saving}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-bold',
                  'bg-primary text-primary-foreground active:opacity-80 transition-opacity',
                  (!dirty || invalid || saving) && 'opacity-40',
                )}
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> :
                  savedFlash ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                {savedFlash ? 'Sparat' : 'Spara'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const DayBlocksEditor: React.FC<Props> = ({ snapshot, onChanged }) => {
  const blocks = useMemo(() => {
    return (snapshot.segments ?? [])
      .filter((s) => s.kind !== 'break' && s.kind !== 'active' && !s.isActive)
      .slice()
      .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  }, [snapshot.segments]);

  if (blocks.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Tider per plats
        </p>
        <p className="text-[12px] text-muted-foreground mt-2">
          Ingen registrerad tid att justera. Använd "Skicka in dagen" ovan för manuell rapport.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-2.5">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Tider per plats
        </p>
        <p className="text-[11px] text-muted-foreground mt-1">
          Justera start/slut per projekt eller plats. Låsta block är godkända av admin.
        </p>
      </div>

      <div className="space-y-2">
        {blocks.map((seg, idx) => (
          <BlockRow
            key={`${seg.refs.timeReportId ?? seg.refs.travelLogId ?? seg.refs.locationEntryId ?? idx}-${seg.startedAt}`}
            seg={seg}
            onSaved={onChanged}
          />
        ))}
      </div>
    </section>
  );
};

export default DayBlocksEditor;
