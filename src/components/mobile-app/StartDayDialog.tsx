/**
 * StartDayDialog
 *
 * Visas när användaren tryckt "Starta dagen" och vi INTE auto-kunde matcha
 * en plats via GPS. Användaren MÅSTE välja något här innan dagen startar:
 *
 *   1. Föreslagna jobb (BSA / projektmedlemskap inom ±1 dag från idag).
 *   2. Sök bland alla aktiva projekt/bookings.
 *   3. Skriv manuellt → skapar workday_flag (unclear_start_target) och
 *      startar dagen utan aktivitetstimer (presence-only-läge).
 *
 * Dialogen returnerar valet via onConfirm. Faktisk start sker i parent
 * (HeaderStartEndDayButton) genom useTimerStartFlow.requestStart eller
 * useWorkDay.start + workdayFlag.
 */
import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Building2, MapPin, Search, Pencil, Calendar, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MobileBooking } from '@/services/mobileApiService';
import type { WorkTarget } from '@/hooks/useWorkSession';
import { useLanguage } from '@/i18n/LanguageContext';

export type StartDaySelection =
  | { kind: 'target'; target: WorkTarget; label: string; startedAtIso?: string }
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
   * Fasta platser (t.ex. Lager) som ALLTID ska kunna väljas som startmål,
   * även om personen inte är planerad på något jobb idag. Renderas överst
   * i listan så att Lager alltid finns inom räckhåll.
   */
  locations?: StartDayLocation[];
  starting?: boolean;
}

const todayIso = () => {
  const d = new Date();
  return d.toISOString().slice(0, 10);
};

const dateOffset = (iso: string, days: number) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

/** True if booking has any phase date within ±1 day of today. */
function isNearby(b: MobileBooking): boolean {
  const today = todayIso();
  const yesterday = dateOffset(today, -1);
  const tomorrow = dateOffset(today, 1);
  const allowed = new Set([yesterday, today, tomorrow]);
  const candidates = [b.rigdaydate, b.eventdate, b.rigdowndate, ...(b.assignment_dates || [])];
  return candidates.some((d) => d && allowed.has(d));
}

/**
 * Bygger en unik lista över targets från bookings.
 * Stora projekt aggregeras till ETT kort per large_project_id.
 */
function buildTargets(bookings: MobileBooking[]): Array<{ key: string; label: string; sublabel?: string; target: WorkTarget; nearby: boolean; date?: string | null }> {
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
        nearby,
        date,
      });
    } else {
      out.push({
        key: `booking:${b.id}`,
        label: b.client,
        sublabel: [b.booking_number, b.delivery_city].filter(Boolean).join(' • ') || undefined,
        target: { kind: 'booking', bookingId: b.id, client: b.client },
        nearby,
        date,
      });
    }
  }

  // Sort: nearby first, then by date ascending.
  out.sort((a, b) => {
    if (a.nearby !== b.nearby) return a.nearby ? -1 : 1;
    return (a.date || '').localeCompare(b.date || '');
  });

  return out;
}

type StartOffset = 'now' | 'm15' | 'm30' | 'custom';

function pad(n: number) { return String(n).padStart(2, '0'); }
function nowHHMM(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** Returns ISO for a chosen offset, or undefined if "now". Custom HH:MM is
 *  resolved against today; if it's in the future we fall back to now. */
function resolveStartedAtIso(offset: StartOffset, customHHMM: string): string | undefined {
  if (offset === 'now') return undefined;
  const now = new Date();
  if (offset === 'm15') return new Date(now.getTime() - 15 * 60_000).toISOString();
  if (offset === 'm30') return new Date(now.getTime() - 30 * 60_000).toISOString();
  // custom
  const m = /^(\d{1,2}):(\d{2})$/.exec(customHHMM.trim());
  if (!m) return undefined;
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  const candidate = new Date(now);
  candidate.setHours(h, min, 0, 0);
  if (candidate.getTime() > now.getTime()) return undefined; // never in future
  return candidate.toISOString();
}

export const StartDayDialog: React.FC<StartDayDialogProps> = ({
  open, onClose, onConfirm, bookings, locations = [], starting,
}) => {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [manualText, setManualText] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [startOffset, setStartOffset] = useState<StartOffset>('now');
  const [customHHMM, setCustomHHMM] = useState<string>(nowHHMM);

  const allTargets = useMemo(() => buildTargets(bookings), [bookings]);

  // Lager och andra fasta platser ska ALLTID finnas som val, oavsett
  // planering. De renderas i en egen sektion överst.
  const locationTargets = useMemo(
    () => locations.map((loc) => ({
      key: `location:${loc.id}`,
      label: loc.name,
      sublabel: loc.address || undefined,
      target: { kind: 'location' as const, locationId: loc.id, name: loc.name },
    })),
    [locations]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allTargets;
    return allTargets.filter(t =>
      t.label.toLowerCase().includes(q) ||
      (t.sublabel || '').toLowerCase().includes(q)
    );
  }, [allTargets, search]);

  const filteredLocations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return locationTargets;
    return locationTargets.filter(t =>
      t.label.toLowerCase().includes(q) ||
      (t.sublabel || '').toLowerCase().includes(q)
    );
  }, [locationTargets, search]);


  const nearby = filtered.filter(t => t.nearby);
  const others = filtered.filter(t => !t.nearby);

  const currentStartedAtIso = () => resolveStartedAtIso(startOffset, customHHMM);

  const handlePick = (item: { target: WorkTarget; label: string }) => {
    if (starting) return;
    void onConfirm({
      kind: 'target',
      target: item.target,
      label: item.label,
      startedAtIso: currentStartedAtIso(),
    });
  };

  const handleManualSubmit = () => {
    const txt = manualText.trim();
    if (!txt || starting) return;
    void onConfirm({ kind: 'manual', text: txt, startedAtIso: currentStartedAtIso() });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !starting) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('startDay.title')}</DialogTitle>
          <DialogDescription>
            {t('startDay.description')}
          </DialogDescription>
        </DialogHeader>

        {/* Start-time picker — applies to both target and manual flows. */}
        <div className="rounded-xl border border-border bg-muted/30 p-2.5 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            Starttid
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {([
              { key: 'now', label: 'Nu' },
              { key: 'm15', label: '−15 min' },
              { key: 'm30', label: '−30 min' },
              { key: 'custom', label: 'Välj tid' },
            ] as Array<{ key: StartOffset; label: string }>).map(opt => (
              <button
                key={opt.key}
                type="button"
                disabled={starting}
                onClick={() => setStartOffset(opt.key)}
                className={cn(
                  'h-9 rounded-lg text-xs font-semibold border transition-colors',
                  startOffset === opt.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border hover:bg-accent',
                  starting && 'opacity-50',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {startOffset === 'custom' && (
            <Input
              type="time"
              value={customHHMM}
              onChange={(e) => setCustomHHMM(e.target.value)}
              disabled={starting}
              className="h-9"
            />
          )}
        </div>

        {!showManual && (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('startDay.searchPlaceholder')}
                className="pl-8"
                disabled={starting}
              />
            </div>

            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-4 py-2">
                {filteredLocations.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" />
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
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
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
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
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
                  <p className="text-sm text-muted-foreground text-center py-6">
                    {t('startDay.noMatch')}
                  </p>
                )}
              </div>
            </ScrollArea>

            <Button
              variant="outline"
              onClick={() => setShowManual(true)}
              disabled={starting}
              className="w-full"
            >
              <Pencil className="w-4 h-4 mr-2" />
              {t('startDay.manualToggle')}
            </Button>
          </>
        )}

        {showManual && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium block mb-1.5">
                {t('startDay.manualLabel')}
              </label>
              <Input
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder={t('startDay.manualPlaceholder')}
                autoFocus
                disabled={starting}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                {t('startDay.manualHelp')}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setShowManual(false)} disabled={starting} className="flex-1">
                {t('startDay.back')}
              </Button>
              <Button onClick={handleManualSubmit} disabled={starting || !manualText.trim()} className="flex-1">
                {starting ? t('startDay.starting') : t('startDay.confirm')}
              </Button>
            </div>
          </div>
        )}
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
      className="w-full text-left flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-accent active:scale-[0.99] transition-all disabled:opacity-50"
    >
      <Icon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{item.label}</div>
        {item.sublabel && (
          <div className="text-xs text-muted-foreground truncate">{item.sublabel}</div>
        )}
      </div>
      {item.date && (
        <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">{item.date}</span>
      )}
    </button>
  );
};

export default StartDayDialog;
