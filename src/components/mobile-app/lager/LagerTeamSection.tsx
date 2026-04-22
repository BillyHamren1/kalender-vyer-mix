import { useEffect, useState } from 'react';
import { mobileApi } from '@/services/mobileApiService';
import { Users, Phone, Mail, Loader2 } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

const LagerTeamSection = () => {
  const { t } = useLanguage();
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    mobileApi.getLagerTeam()
      .then(res => setTeam(res.team || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <Users className="w-3.5 h-3.5 text-muted-foreground" />
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          {t('lager.teamToday')}
        </h2>
      </div>
      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : team.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-4 text-center">
          <p className="text-sm text-muted-foreground">{t('lager.noTeamActive')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {team.map((m: any) => (
            <div key={m.id} className="rounded-2xl border bg-card p-3 flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-primary-foreground shrink-0"
                style={{ backgroundColor: m.color || 'hsl(var(--primary))' }}
              >
                {(m.name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{m.name}</p>
                {m.role && <p className="text-xs text-muted-foreground truncate">{m.role}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {m.phone && (
                  <button
                    type="button"
                    onClick={() => { window.open(`tel:${m.phone}`, '_system') || (window.location.href = `tel:${m.phone}`); }}
                    className="p-2 rounded-lg hover:bg-muted active:scale-95"
                  >
                    <Phone className="w-4 h-4 text-primary" />
                  </button>
                )}
                {m.email && (
                  <button
                    type="button"
                    onClick={() => { window.open(`mailto:${m.email}`, '_system') || (window.location.href = `mailto:${m.email}`); }}
                    className="p-2 rounded-lg hover:bg-muted active:scale-95"
                  >
                    <Mail className="w-4 h-4 text-primary" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LagerTeamSection;
