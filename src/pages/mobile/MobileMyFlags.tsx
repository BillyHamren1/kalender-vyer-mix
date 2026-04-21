/**
 * MobileMyFlags — "Mina avvikelser"
 * ─────────────────────────────────
 * Listar workday_flags som tillhör inloggad personal. Avvikelser är platsen
 * där systemet samlar saker det SETT men inte säkert kan avgöra själv. Här
 * ska personalen kunna svara med en kort förklaring så systemet vet vad det
 * faktiskt var (t.ex. "det var rast", "jag glömde stoppa timern").
 *
 * Designprinciper:
 *   • Avvikelser ändrar ALDRIG personalens rapporterade tid automatiskt —
 *     det här gränssnittet skickar bara en resolution_note + flaggar
 *     resolved=true via mobile-app-api. Admin kan sedan agera på noten.
 *   • Vi visar två sektioner: "Behöver svar" (needs_user_input) först,
 *     "Övriga öppna" sedan. Lösta avvikelser göms (admin-vyn äger historik).
 *   • Inline i mobilappen — assistenten skickar hit via "Visa alla"-länk.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Check, Loader2 } from 'lucide-react';
import { mobileApi, type WorkdayFlag } from '@/services/mobileApiService';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

// Human-readable labels per flag_type — keep in sync with the CHECK
// constraint in the workday_flags migration.
const FLAG_LABELS: Record<string, string> = {
  missing_break: 'Saknad rast',
  unclear_day_end: 'Oklart dagsslut',
  presence_without_report: 'Närvaro utan rapport',
  activity_ended_day_continues: 'Aktivitet avslutad — dagen fortsätter',
  geofence_presence_mismatch: 'Närvaro matchar inte rapport',
  team_time_deviation: 'Teamtidavvikelse',
  unreasonable_travel: 'Orimlig restid',
  time_gap: 'Tidslucka',
  missing_report: 'Saknad tidrapport',
  long_day: 'Extremt lång arbetsdag',
  overlapping_times: 'Överlappande tider',
  auto_closed_overnight: 'Arbetsdagen stängdes automatiskt',
  auto_closed_travel: 'Restimer stängdes automatiskt',
  auto_closed_report: 'Tidrapport stängdes automatiskt',
};

// Quick-reply chips per flag type. Keeps the staff in/out flow fast for
// the common cases without opening a free-text editor every time.
const QUICK_REPLIES: Record<string, string[]> = {
  missing_break: ['Det var rast', 'Jag jobbade hela tiden', 'Glömde rapportera rast'],
  unclear_day_end: ['Glömde stoppa timern', 'Jobbade till denna tid', 'Privat ärende'],
  presence_without_report: ['Glömde starta timern', 'Privat besök', 'Hämtade material'],
  activity_ended_day_continues: ['Bytte till annan plats', 'Tog rast och kom tillbaka', 'Dagen var slut'],
  geofence_presence_mismatch: ['GPS var fel', 'Stämmer som rapporterat', 'Behöver justera tid'],
};

export default function MobileMyFlags() {
  const navigate = useNavigate();
  const [flags, setFlags] = useState<WorkdayFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [openNote, setOpenNote] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await mobileApi.listWorkdayFlags({ resolved: false });
      setFlags(res.flags || []);
    } catch (err) {
      console.error('[MyFlags] load failed:', err);
      toast.error('Kunde inte ladda avvikelser');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const resolve = async (flag: WorkdayFlag, note: string) => {
    setResolvingId(flag.id);
    try {
      await mobileApi.resolveWorkdayFlag({
        flag_id: flag.id,
        resolution_source: 'staff',
        resolution_note: note,
      });
      toast.success('Tack! Avvikelsen är besvarad.');
      setFlags((prev) => prev.filter((f) => f.id !== flag.id));
    } catch (err) {
      console.error('[MyFlags] resolve failed:', err);
      toast.error('Kunde inte spara svaret');
    } finally {
      setResolvingId(null);
    }
  };

  const needsInput = flags.filter((f) => f.needs_user_input);
  const others = flags.filter((f) => !f.needs_user_input);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card/80 backdrop-blur-xl border-b border-border/60">
        <div className="flex items-center gap-3 p-4 max-w-lg mx-auto">
          <button
            onClick={() => navigate('/m/profile')}
            className="p-2 rounded-xl hover:bg-muted/60 transition-colors"
            aria-label="Tillbaka"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold">Mina avvikelser</h1>
            <p className="text-xs text-muted-foreground">
              {loading ? 'Laddar…' : `${flags.length} öppna`}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-6">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        )}

        {!loading && flags.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-primary" />
            </div>
            <p className="text-sm font-semibold">Inga öppna avvikelser</p>
            <p className="text-xs text-muted-foreground mt-1">
              Allt ser bra ut just nu.
            </p>
          </div>
        )}

        {needsInput.length > 0 && (
          <section>
            <h2 className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground mb-2 px-1">
              Behöver ditt svar
            </h2>
            <div className="space-y-2">
              {needsInput.map((flag) => (
                <FlagCard
                  key={flag.id}
                  flag={flag}
                  noteValue={openNote[flag.id] || ''}
                  onNoteChange={(v) => setOpenNote((p) => ({ ...p, [flag.id]: v }))}
                  onResolve={(note) => resolve(flag, note)}
                  resolving={resolvingId === flag.id}
                  highlight
                />
              ))}
            </div>
          </section>
        )}

        {others.length > 0 && (
          <section>
            <h2 className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground mb-2 px-1">
              Övriga öppna
            </h2>
            <div className="space-y-2">
              {others.map((flag) => (
                <FlagCard
                  key={flag.id}
                  flag={flag}
                  noteValue={openNote[flag.id] || ''}
                  onNoteChange={(v) => setOpenNote((p) => ({ ...p, [flag.id]: v }))}
                  onResolve={(note) => resolve(flag, note)}
                  resolving={resolvingId === flag.id}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

interface FlagCardProps {
  flag: WorkdayFlag;
  noteValue: string;
  onNoteChange: (v: string) => void;
  onResolve: (note: string) => void;
  resolving: boolean;
  highlight?: boolean;
}

function FlagCard({ flag, noteValue, onNoteChange, onResolve, resolving, highlight }: FlagCardProps) {
  const label = FLAG_LABELS[flag.flag_type] || flag.flag_type;
  const quickReplies = QUICK_REPLIES[flag.flag_type] || [];
  const dateLabel = format(new Date(flag.flag_date), 'EEE d MMM', { locale: sv });

  return (
    <article
      className={`rounded-2xl border p-4 ${
        highlight
          ? 'bg-orange-500/5 border-orange-500/30'
          : 'bg-card border-border/60'
      }`}
    >
      <div className="flex items-start gap-3 mb-2">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
          flag.severity === 'error' ? 'bg-destructive/10' : 'bg-orange-500/10'
        }`}>
          <AlertTriangle className={`w-4 h-4 ${
            flag.severity === 'error' ? 'text-destructive' : 'text-orange-500'
          }`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">{flag.title}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {label} · {dateLabel}
          </p>
        </div>
      </div>

      {flag.description && (
        <p className="text-xs text-muted-foreground mb-3 pl-11">{flag.description}</p>
      )}

      {/* Quick replies */}
      {quickReplies.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2 pl-11">
          {quickReplies.map((reply) => (
            <button
              key={reply}
              onClick={() => onResolve(reply)}
              disabled={resolving}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-muted hover:bg-muted/80 transition-colors disabled:opacity-50"
            >
              {reply}
            </button>
          ))}
        </div>
      )}

      {/* Free-text answer */}
      <div className="pl-11 mt-2 flex gap-2">
        <input
          type="text"
          value={noteValue}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="Eller skriv ett eget svar…"
          className="flex-1 rounded-xl border border-border/60 bg-background px-3 py-2 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
          disabled={resolving}
        />
        <button
          onClick={() => onResolve(noteValue || 'Bekräftat utan kommentar')}
          disabled={resolving}
          className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50"
        >
          {resolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Spara'}
        </button>
      </div>
    </article>
  );
}
