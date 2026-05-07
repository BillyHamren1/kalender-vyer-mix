/**
 * StartDayDialog
 *
 * Primärt flöde:
 *   1. Välj starttid (Nu eller valfri tid tidigare samma dag).
 *   2. Tryck "Starta arbetsdag" → workday startar utan projektkoppling.
 *      Geofence/backend snapshot kopplar projekt/plats automatiskt när
 *      användaren är på en känd arbetsplats.
 *
 * Sekundärt (valfritt) flöde under "Koppla projekt manuellt":
 *   - Välj jobb/plats direkt (samma timer-start som tidigare).
 *   - Eller skriv en fritext-anteckning (skapar workday_flag
 *     unclear_start_target). Workday startar i båda fallen.
 *
 * Dialogen returnerar valet via onConfirm. Faktisk start sker i parent
 * (MobileHeader / WorkDayPanel / TodayTab) genom useWorkDay.start eller
 * useTimerStartFlow.requestStart.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Building2, MapPin, Search, Pencil, Calendar, Clock, Play, ChevronDown, ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MobileBooking } from '@/services/mobileApiService';
import type { WorkTarget } from '@/hooks/useWorkSession';
import { useLanguage } from '@/i18n/LanguageContext';

export type StartDaySelection =
  /** Starta enbart arbetsdagen — projekt kopplas senare av geofence/backend. */
  | { kind: 'presence'; startedAtIso?: string }
  /** Starta arbetsdag + en aktivitetstimer på valt mål. */
  | { kind: 'target'; target: WorkTarget; label: string; startedAtIso?: string }
  /** Starta arbetsdag + workday_flag (unclear_start_target). */
  | { kind: 'manual'; text: string; startedAtIso?: string };

export interface StartDayLocation {
  id: string;
  name: string;
  address: string | null;
}

interface StartDayDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (selection: StartDaySelection) => void | Promise<void>;
  bookings: MobileBooking[];
  /**
   * Fasta platser (t.ex. Lager) som ALLTID ska kunna väljas som startmål
   * i den valfria projektsektionen.
   */
  locations?: StartDayLocation[];
  starting?: boolean;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const dateOffset = (iso: string, days: number) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

/** True if booking has any phase date within ±1 day of today. */
function isNearby(b: MobileBooking): boolean {
  const today = todayIso();
  const allowed = new Set([dateOffset(today, -1), today, dateOffset(today, 1)]);
  const candidates = [b.rigdaydate, b.eventdate, b.rigdowndate, ...(b.assignment_dates || [])];
  return candidates.some((d) => d && allowed.has(d));
}

/** Bygger en unik lista över targets från bookings. Stora projekt aggregeras. */
function buildTargets(bookings: MobileBooking[]) {
  const seenProjects = new Set<string>();
  const out: Array<{ key: string; label: string; sublabel?: string; target: WorkTarget; nearby: boolean; date?: string | null }> = [];

  for (const b of bookings) {
    const nearby = isNearby(b);
    const date = b.eventdate || b.rigdaydate || b.rigdowndate;

    if (b.large_project_id && b.large_project_name) {
      if (seenProjects.has(b.large_project_id)) continue;
      seenProjects.add(b.large_project_id);
      out.push({
        key: `project:${b.large_project_id}`,
        label: b.large_project_name,
        sublabel: b.delivery_city || b.deliveryaddress || undefined,
        target: { kind: 'project', largeProjectId: b.large_project_id, name: b.large_project_name },
        nearby, date,
      });
    } else {
      out.push({
        key: `booking:${b.id}`,
        label: b.client,
        sublabel: [b.booking_number, b.delivery_city].filter(Boolean).join(' • ') || undefined,
        target: { kind: 'booking', bookingId: b.id, client: b.client },
        nearby, date,
      });
    }
  }

  out.sort((a, b) => {
    if (a.nearby !== b.nearby) return a.nearby ? -1 : 1;
    return (a.date || '').localeCompare(b.date || '');
  });
  return out;
}

type StartMode = 'now' | 'custom';

function pad(n: number) { return String(n).padStart(2, '0'); }
function nowHHMM(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Resolves chosen mode/HH:MM → ISO. "now" returns undefined (= server uses now).
 *  Custom HH:MM is interpreted on today; future times collapse to undefined. */
function resolveStartedAtIso(mode: StartMode, customHHMM: string): string | undefined {
  if (mode === 'now') return undefined;
  const m = /^(\d{1,2}):(\d{2})$/.exec(customHHMM.trim());
  if (!m) return undefined;
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  const candidate = new Date();
  candidate.setHours(h, min, 0, 0);
  if (candidate.getTime() > Date.now()) return undefined;
  return candidate.toISOString();
}

export const StartDayDialog: React.FC<StartDayDialogProps> = ({
  open, onClose, onConfirm, bookings, locations = [], starting,
}) => {
  const { t } = useLanguage();
  const [mode, setMode] = useState<StartMode>('now');
  const [customHHMM, setCustomHHMM] = useState<string>(nowHHMM);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [manualText, setManualText] = useState('');

  // Reset transient state whenever dialog reopens.
  useEffect(() => {
    if (open) {
      setMode('now');
      setCustomHHMM(nowHHMM());
      setShowProjectPicker(false);
      setShowManual(false);
      setSearch('');
      setManualText('');
    }
  }, [open]);

  const allTargets = useMemo(() => buildTargets(bookings), [bookings]);
  const locationTargets = useMemo(
    () => locations.map((loc) => ({
      key: `location:${loc.id}`,
      label: loc.name,
      sublabel: loc.address || undefined,
      target: { kind: 'location' as const, locationId: loc.id, name: loc.name },
    })),
    [locations],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allTargets;
    return allTargets.filter(t =>
      t.label.toLowerCase().includes(q) || (t.sublabel || '').toLowerCase().includes(q));
  }, [allTargets, search]);

  const filteredLocations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return locationTargets;
    return locationTargets.filter(t =>
      t.label.toLowerCase().includes(q) || (t.sublabel || '').toLowerCase().includes(q));
  }, [locationTargets, search]);

  const nearby = filtered.filter(t => t.nearby);
  const others = filtered.filter(t => !t.nearby);

  const startedAtIso = () => resolveStartedAtIso(mode, customHHMM);

  const handlePresence = () => {
    if (starting) return;
    void onConfirm({ kind: 'presence', startedAtIso: startedAtIso() });
  };

  const handlePick = (item: { target: WorkTarget; label: string }) => {
    if (starting) return;
    void onConfirm({
      kind: 'target',
      target: item.target,
      label: item.label,
      startedAtIso: startedAtIso(),
    });
  };

  const handleManualSubmit = () => {
    const txt = manualText.trim();
    if (!txt || starting) return;
    void onConfirm({ kind: 'manual', text: txt, startedAtIso: startedAtIso() });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !starting) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle>{t('startDay.title')}</DialogTitle>
          <DialogDescription>
            Starta arbetsdagen — projekt och plats kopplas automatiskt när du
            är på en känd arbetsplats.
          </DialogDescription>
        </DialogHeader>

        {/* ─────────── Starttid ─────────── */}
        <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            Starttid
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              { key: 'now', label: 'Starta nu' },
              { key: 'custom', label: 'Välj starttid' },
            ] as Array<{ key: StartMode; label: string }>).map(opt => (
              <button
                key={opt.key}
                type="button"
                disabled={starting}
                onClick={() => setMode(opt.key)}
                className={cn(
                  'h-10 rounded-lg text-sm font-semibold border transition-colors',
                  mode === opt.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border hover:bg-accent',
                  starting && 'opacity-50',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {mode === 'custom' && (
            <div className="space-y-1">
              <Input
                type="time"
                value={customHHMM}
                onChange={(e) => setCustomHHMM(e.target.value)}
                disabled={starting}
                className="h-10 text-base tabular-nums"
                step={60}
              />
              <p className="text-[11px] text-muted-foreground">
                Välj valfri tid tidigare samma dag.
              </p>
            </div>
          )}
        </div>

        {/* ─────────── Primär CTA ─────────── */}
        <Button
          size="lg"
          className="w-full h-12 rounded-xl text-sm font-bold gap-2"
          onClick={handlePresence}
          disabled={starting}
        >
          <Play className="w-4 h-4 fill-current" />
          {starting ? 'Startar…' : 'Starta arbetsdag'}
        </Button>
        <p className="text-[11px] text-muted-foreground -mt-1 text-center">
          Plats moniteras efter start. Projekt kopplas automatiskt på arbetsplats.
        </p>

        {/* ─────────── Valfritt: koppla projekt manuellt ─────────── */}
        <div className="rounded-xl border border-dashed border-border">
          <button
            type="button"
            onClick={() => setShowProjectPicker((v) => !v)}
            disabled={starting}
            className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>Koppla projekt manuellt (valfritt)</span>
            {showProjectPicker
              ? <ChevronUp className="w-4 h-4" />
              : <ChevronDown className="w-4 h-4" />}
          </button>

          {showProjectPicker && !showManual && (
            <div className="px-3 pb-3 space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('startDay.searchPlaceholder')}
                  className="pl-8 h-9"
                  disabled={starting}
                />
              </div>

              <ScrollArea className="max-h-64">
                <div className="space-y-3 py-1 pr-2">
                  {filteredLocations.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                        <MapPin className="w-3 h-3" />
                        {t('startDay.fixedLocations')}
                      </h3>
                      <div className="space-y-1.5">
                        {filteredLocations.map(item => (
                          <TargetRow key={item.key} item={item} onPick={handlePick} disabled={!!starting} />
                        ))}
                      </div>
                    </div>
                  )}
                  {nearby.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                        <Calendar className="w-3 h-3" />
                        {t('startDay.suggested')}
                      </h3>
                      <div className="space-y-1.5">
                        {nearby.map(item => (
                          <TargetRow key={item.key} item={item} onPick={handlePick} disabled={!!starting} />
                        ))}
                      </div>
                    </div>
                  )}
                  {others.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                        {t('startDay.allProjects')}
                      </h3>
                      <div className="space-y-1.5">
                        {others.map(item => (
                          <TargetRow key={item.key} item={item} onPick={handlePick} disabled={!!starting} />
                        ))}
                      </div>
                    </div>
                  )}
                  {filtered.length === 0 && filteredLocations.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      {t('startDay.noMatch')}
                    </p>
                  )}
                </div>
              </ScrollArea>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowManual(true)}
                disabled={starting}
                className="w-full text-xs"
              >
                <Pencil className="w-3.5 h-3.5 mr-1.5" />
                {t('startDay.manualToggle')}
              </Button>
            </div>
          )}

          {showProjectPicker && showManual && (
            <div className="px-3 pb-3 space-y-2">
              <label className="text-xs font-medium block">
                {t('startDay.manualLabel')}
              </label>
              <Input
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder={t('startDay.manualPlaceholder')}
                autoFocus
                disabled={starting}
                className="h-9"
              />
              <p className="text-[11px] text-muted-foreground">
                {t('startDay.manualHelp')}
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowManual(false)} disabled={starting} className="flex-1 text-xs">
                  {t('startDay.back')}
                </Button>
                <Button size="sm" onClick={handleManualSubmit} disabled={starting || !manualText.trim()} className="flex-1 text-xs">
                  {starting ? t('startDay.starting') : t('startDay.confirm')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const TargetRow: React.FC<{
  item: { key: string; label: string; sublabel?: string; target: WorkTarget; date?: string | null };
  onPick: (item: { target: WorkTarget; label: string }) => void;
  disabled: boolean;
}> = ({ item, onPick, disabled }) => {
  const Icon = item.target.kind === 'location' ? MapPin : Building2;
  return (
    <button
      type="button"
      onClick={() => onPick(item)}
      disabled={disabled}
      className="w-full text-left flex items-start gap-2.5 p-2.5 rounded-lg border border-border hover:bg-accent active:scale-[0.99] transition-all disabled:opacity-50"
    >
      <Icon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{item.label}</div>
        {item.sublabel && (
          <div className="text-[11px] text-muted-foreground truncate">{item.sublabel}</div>
        )}
      </div>
      {item.date && (
        <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">{item.date}</span>
      )}
    </button>
  );
};

export default StartDayDialog;
