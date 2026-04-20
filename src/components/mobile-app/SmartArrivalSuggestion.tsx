import { useState } from 'react';
import { Briefcase, UtensilsCrossed, ShoppingBag, MapPin, X } from 'lucide-react';
import type { ArrivalContextSuggestion } from '@/hooks/useArrivalContext';
import { mobileApi } from '@/services/mobileApiService';
import type { UnplannedVisit } from '@/hooks/useUnplannedSiteVisit';
import type { TravelCompletedInfo } from '@/hooks/useTravelDetection';
import { useMobileBookings } from '@/hooks/useMobileData';
import { toast } from 'sonner';

interface Props {
  suggestion: ArrivalContextSuggestion;
  travel: TravelCompletedInfo;
  onAcceptedVisit: (visit: UnplannedVisit) => void;
  onResolved: () => void; // close smart suggestion (fall back to base UI)
}

function formatSwedishDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('sv-SE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return iso;
  }
}

/**
 * SmartArrivalSuggestion — three render modes, picked by suggestion.kind.
 * Sits ABOVE the regular TravelCompletedDialog body. Never replaces it.
 */
export default function SmartArrivalSuggestion({
  suggestion,
  travel,
  onAcceptedVisit,
  onResolved,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const { data: bookings = [] } = useMobileBookings();

  const reject = async () => {
    if (suggestion.suggestion_id) {
      try {
        await mobileApi.rejectArrivalSuggestion({ suggestion_id: suggestion.suggestion_id });
      } catch {
        /* silent */
      }
    }
    onResolved();
  };

  // ── Scenario A — planlagt jobb, ej assignad ─────────────────────────
  if (suggestion.kind === 'unplanned_job_candidate') {
    const p = suggestion.payload as {
      booking_id: string;
      client: string;
      eventdate: string | null;
      address?: string | null;
    };
    const dateLabel = formatSwedishDate(p.eventdate);
    const trimmed = note.trim();

    const accept = async () => {
      if (trimmed.length < 3) {
        toast.error('Skriv en kort kommentar (minst 3 tecken)');
        return;
      }
      setBusy(true);
      try {
        const res = await mobileApi.acceptUnplannedSiteVisit({
          suggestion_id: suggestion.suggestion_id || undefined,
          travel_log_id: travel.travelLogId,
          booking_id: p.booking_id,
          note: trimmed,
        });
        if (res?.entry?.id) {
          onAcceptedVisit({
            entry_id: res.entry.id,
            booking_id: p.booking_id,
            client: p.client,
            lat: travel.toLat,
            lng: travel.toLng,
            started_at: res.entry.entered_at || new Date().toISOString(),
            note: trimmed,
          });
        }
        toast.success('Tid på plats registrerad');
        onResolved();
      } catch (err: any) {
        toast.error(err?.message || 'Kunde inte spara');
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 mb-4 animate-in fade-in duration-200">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-snug">
              Är du här i ett ärende kring det planerade jobbet på{' '}
              <span className="font-bold">{dateLabel}</span> ({p.client})?
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Du är inte tilldelad jobbet — vi registrerar bara att du var här.
            </p>
          </div>
          <button
            onClick={reject}
            disabled={busy}
            className="p-1.5 rounded-lg hover:bg-muted/60"
            aria-label="Avvisa förslag"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 200))}
          placeholder="Vad gör du där? (obligatoriskt)"
          rows={2}
          disabled={busy}
          className="mt-3 w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-muted-foreground">{note.length}/200</span>
        </div>

        <div className="flex gap-2 mt-2">
          <button
            onClick={accept}
            disabled={busy || trimmed.length < 3}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <Briefcase className="w-4 h-4" />
            Ja — kopplat till jobbet
          </button>
          <button
            onClick={reject}
            disabled={busy}
            className="px-4 py-2.5 rounded-xl bg-muted text-foreground font-semibold text-sm active:scale-[0.98] disabled:opacity-50"
          >
            Nej
          </button>
        </div>
      </div>
    );
  }

  // ── Scenario B — lunch ───────────────────────────────────────────────
  if (suggestion.kind === 'meal_break') {
    const p = suggestion.payload as { place_name?: string };
    const placeName = p.place_name || 'platsen';

    const acceptLunch = async () => {
      setBusy(true);
      try {
        const minutes = Math.max(5, Math.min(90, Math.round(travel.hoursWorked * 60) || 30));
        const res = await mobileApi.registerBreakFromTravel({
          suggestion_id: suggestion.suggestion_id || undefined,
          duration_minutes: minutes,
        });
        if (res.updated_time_report_id) {
          toast.success(`Paus registrerad (${res.minutes} min)`);
        } else {
          toast.success('Paus markerad');
        }
        onResolved();
      } catch (err: any) {
        toast.error(err?.message || 'Kunde inte registrera paus');
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 mb-4 animate-in fade-in duration-200">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
            <UtensilsCrossed className="w-4 h-4 text-amber-700 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-snug">
              Det ser ut som du stannade vid <span className="font-bold">{placeName}</span>. Vill du
              registrera tiden som lunch?
            </p>
          </div>
          <button onClick={reject} disabled={busy} className="p-1.5 rounded-lg hover:bg-muted/60">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={acceptLunch}
            disabled={busy}
            className="flex-1 py-2.5 rounded-xl bg-foreground text-background font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
          >
            Ja, lunch
          </button>
          <button
            onClick={reject}
            disabled={busy}
            className="px-4 py-2.5 rounded-xl bg-muted text-foreground font-semibold text-sm active:scale-[0.98] disabled:opacity-50"
          >
            Nej, jobb
          </button>
        </div>
      </div>
    );
  }

  // ── Scenario C — inköp ───────────────────────────────────────────────
  if (suggestion.kind === 'supply_store') {
    const p = suggestion.payload as { place_name?: string };
    const placeName = p.place_name || 'butiken';

    // Today + tomorrow bookings the user has access to, plus internal warehouse
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
    const todayBookings = bookings.filter((b) => b.assignment_dates?.includes(today));
    const tomorrowBookings = bookings.filter((b) => b.assignment_dates?.includes(tomorrow));
    const lager = bookings.find((b: any) => b.is_internal === true);

    const linkTo = async (target: {
      booking_id?: string;
      large_project_id?: string;
      location_id?: string;
      label: string;
    }) => {
      setBusy(true);
      try {
        await mobileApi.linkPurchaseIntentToProject({
          suggestion_id: suggestion.suggestion_id || undefined,
          travel_log_id: travel.travelLogId,
          booking_id: target.booking_id,
          large_project_id: target.large_project_id,
          location_id: target.location_id,
          supplier_name: placeName,
        });
        toast.success(`Inköp kopplat till ${target.label}`);
        onResolved();
      } catch (err: any) {
        toast.error(err?.message || 'Kunde inte koppla inköp');
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 mb-4 animate-in fade-in duration-200">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center flex-shrink-0">
            <ShoppingBag className="w-4 h-4 text-blue-700 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-snug">
              Handlade du på <span className="font-bold">{placeName}</span> åt något projekt?
            </p>
          </div>
          <button onClick={reject} disabled={busy} className="p-1.5 rounded-lg hover:bg-muted/60">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex flex-col gap-1.5 mt-3">
          {todayBookings.slice(0, 1).map((b) => (
            <button
              key={`t-${b.id}`}
              onClick={() => linkTo({ booking_id: b.id, label: `Idag — ${b.client}` })}
              disabled={busy}
              className="w-full py-2.5 px-3 rounded-xl bg-background border border-border/60 text-left text-sm font-semibold active:scale-[0.98] disabled:opacity-50"
            >
              Idag — {b.client}
            </button>
          ))}
          {tomorrowBookings.slice(0, 1).map((b) => (
            <button
              key={`m-${b.id}`}
              onClick={() => linkTo({ booking_id: b.id, label: `Imorgon — ${b.client}` })}
              disabled={busy}
              className="w-full py-2.5 px-3 rounded-xl bg-background border border-border/60 text-left text-sm font-semibold active:scale-[0.98] disabled:opacity-50"
            >
              Imorgon — {b.client}
            </button>
          ))}
          {lager && (
            <button
              onClick={() => linkTo({ booking_id: lager.id, label: 'Lager' })}
              disabled={busy}
              className="w-full py-2.5 px-3 rounded-xl bg-background border border-border/60 text-left text-sm font-semibold active:scale-[0.98] disabled:opacity-50"
            >
              Lager (alltid tillgängligt)
            </button>
          )}
          <button
            onClick={reject}
            disabled={busy}
            className="w-full py-2 text-xs text-muted-foreground font-medium hover:bg-muted/40 rounded-xl disabled:opacity-50"
          >
            Privat / Annat
          </button>
        </div>
      </div>
    );
  }

  return null;
}
