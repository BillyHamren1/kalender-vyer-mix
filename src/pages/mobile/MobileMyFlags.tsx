/**
 * MobileMyFlags — "My flags"
 * ─────────────────────────────────
 * Lists workday_flags for the logged-in staff. See ARCH docs for design.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Check, Loader2 } from 'lucide-react';
import { mobileApi, type WorkdayFlag } from '@/services/mobileApiService';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { sv, enUS } from 'date-fns/locale';
import { useLanguage, } from '@/i18n/LanguageContext';
import type { TranslationKey } from '@/i18n/translations';

const FLAG_LABEL_KEYS: Record<string, TranslationKey> = {
  missing_break: 'flags.type.missing_break',
  unclear_day_end: 'flags.type.unclear_day_end',
  presence_without_report: 'flags.type.presence_without_report',
  activity_ended_day_continues: 'flags.type.activity_ended_day_continues',
  geofence_presence_mismatch: 'flags.type.geofence_presence_mismatch',
  team_time_deviation: 'flags.type.team_time_deviation',
  unreasonable_travel: 'flags.type.unreasonable_travel',
  time_gap: 'flags.type.time_gap',
  missing_report: 'flags.type.missing_report',
  long_day: 'flags.type.long_day',
  overlapping_times: 'flags.type.overlapping_times',
  auto_closed_overnight: 'flags.type.auto_closed_overnight',
  auto_closed_travel: 'flags.type.auto_closed_travel',
  auto_closed_report: 'flags.type.auto_closed_report',
};

const QUICK_REPLY_KEYS: Record<string, TranslationKey[]> = {
  missing_break: ['flags.reply.itWasBreak', 'flags.reply.workedAll', 'flags.reply.forgotBreak'],
  unclear_day_end: ['flags.reply.forgotStop', 'flags.reply.workedUntil', 'flags.reply.privateErrand'],
  presence_without_report: ['flags.reply.forgotStart', 'flags.reply.privateVisit', 'flags.reply.pickedUpMaterial'],
  activity_ended_day_continues: ['flags.reply.switchedPlace', 'flags.reply.breakAndBack', 'flags.reply.dayWasDone'],
  geofence_presence_mismatch: ['flags.reply.gpsWrong', 'flags.reply.matchesReport', 'flags.reply.needAdjust'],
};

export default function MobileMyFlags() {
  const navigate = useNavigate();
  const { t, locale } = useLanguage();
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
      toast.error(t('flags.couldNotLoad'));
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
      toast.success(t('flags.thanks'));
      setFlags((prev) => prev.filter((f) => f.id !== flag.id));
    } catch (err) {
      console.error('[MyFlags] resolve failed:', err);
      toast.error(t('flags.couldNotSave'));
    } finally {
      setResolvingId(null);
    }
  };

  const needsInput = flags.filter((f) => f.needs_user_input);
  const others = flags.filter((f) => !f.needs_user_input);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-card/80 backdrop-blur-xl border-b border-border/60">
        <div className="flex items-center gap-3 p-4 max-w-lg mx-auto">
          <button
            onClick={() => navigate('/m/profile')}
            className="p-2 rounded-xl hover:bg-muted/60 transition-colors"
            aria-label={t('common.back')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold">{t('flags.title')}</h1>
            <p className="text-xs text-muted-foreground">
              {loading ? t('flags.loading') : t('flags.openCount', { n: flags.length })}
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
            <p className="text-sm font-semibold">{t('flags.noOpen')}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('flags.allGood')}
            </p>
          </div>
        )}

        {needsInput.length > 0 && (
          <section>
            <h2 className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground mb-2 px-1">
              {t('flags.needsYourAnswer')}
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
                  locale={locale}
                />
              ))}
            </div>
          </section>
        )}

        {others.length > 0 && (
          <section>
            <h2 className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground mb-2 px-1">
              {t('flags.otherOpen')}
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
                  locale={locale}
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
  locale: 'sv' | 'en';
}

function FlagCard({ flag, noteValue, onNoteChange, onResolve, resolving, highlight, locale }: FlagCardProps) {
  const { t } = useLanguage();
  const labelKey = FLAG_LABEL_KEYS[flag.flag_type];
  const label = labelKey ? t(labelKey) : flag.flag_type;
  const quickKeys = QUICK_REPLY_KEYS[flag.flag_type] || [];
  const dateFnsLocale = locale === 'en' ? enUS : sv;
  const dateLabel = format(new Date(flag.flag_date), 'EEE d MMM', { locale: dateFnsLocale });

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

      {quickKeys.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2 pl-11">
          {quickKeys.map((key) => {
            const reply = t(key);
            return (
              <button
                key={key}
                onClick={() => onResolve(reply)}
                disabled={resolving}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-muted hover:bg-muted/80 transition-colors disabled:opacity-50"
              >
                {reply}
              </button>
            );
          })}
        </div>
      )}

      <div className="pl-11 mt-2 flex gap-2">
        <input
          type="text"
          value={noteValue}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder={t('flags.writeYourOwn')}
          className="flex-1 rounded-xl border border-border/60 bg-background px-3 py-2 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
          disabled={resolving}
        />
        <button
          onClick={() => onResolve(noteValue || t('flags.confirmedNoComment'))}
          disabled={resolving}
          className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50"
        >
          {resolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('common.save')}
        </button>
      </div>
    </article>
  );
}
