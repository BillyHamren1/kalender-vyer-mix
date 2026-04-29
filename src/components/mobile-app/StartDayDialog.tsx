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
import { Building2, MapPin, Search, Pencil, Calendar } from 'lucide-react';
import type { MobileBooking } from '@/services/mobileApiService';
import type { WorkTarget } from '@/hooks/useWorkSession';

export type StartDaySelection =
  | { kind: 'target'; target: WorkTarget; label: string }
  | { kind: 'manual'; text: string };

interface StartDayDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (selection: StartDaySelection) => void | Promise<void>;
  bookings: MobileBooking[];
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

export const StartDayDialog: React.FC<StartDayDialogProps> = ({
  open, onClose, onConfirm, bookings, starting,
}) => {
  const [search, setSearch] = useState('');
  const [manualText, setManualText] = useState('');
  const [showManual, setShowManual] = useState(false);

  const allTargets = useMemo(() => buildTargets(bookings), [bookings]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allTargets;
    return allTargets.filter(t =>
      t.label.toLowerCase().includes(q) ||
      (t.sublabel || '').toLowerCase().includes(q)
    );
  }, [allTargets, search]);

  const nearby = filtered.filter(t => t.nearby);
  const others = filtered.filter(t => !t.nearby);

  const handlePick = (item: { target: WorkTarget; label: string }) => {
    if (starting) return;
    void onConfirm({ kind: 'target', target: item.target, label: item.label });
  };

  const handleManualSubmit = () => {
    const txt = manualText.trim();
    if (!txt || starting) return;
    void onConfirm({ kind: 'manual', text: txt });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !starting) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Vart börjar du dagen?</DialogTitle>
          <DialogDescription>
            Välj projektet eller platsen du startar med. Vi kunde inte se det automatiskt via GPS.
          </DialogDescription>
        </DialogHeader>

        {!showManual && (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Sök projekt eller kund…"
                className="pl-8"
                disabled={starting}
              />
            </div>

            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-4 py-2">
                {nearby.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      Föreslagna (±1 dag)
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
                      Alla projekt
                    </h3>
                    <div className="space-y-1.5">
                      {others.map(item => (
                        <TargetRow key={item.key} item={item} onPick={handlePick} disabled={!!starting} />
                      ))}
                    </div>
                  </div>
                )}

                {filtered.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Inga matchande projekt. Skriv manuellt nedan.
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
              Skriv manuellt istället
            </Button>
          </>
        )}

        {showManual && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium block mb-1.5">
                Var är du? (Adress eller beskrivning)
              </label>
              <Input
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder="T.ex. Storgatan 12, kund X, lager…"
                autoFocus
                disabled={starting}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                En flagga skapas så arbetsledare kan koppla rätt projekt åt dig senare.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setShowManual(false)} disabled={starting} className="flex-1">
                Tillbaka
              </Button>
              <Button onClick={handleManualSubmit} disabled={starting || !manualText.trim()} className="flex-1">
                {starting ? 'Startar…' : 'Starta dagen'}
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
