/**
 * ViewAsPicker — admin-only "Visa som"-väljare i mobilen.
 *
 * Read-only impersonering av annan staff i samma org. Påverkar bara
 * de tre snapshot-vyerna (Idag, Tidrapport, Dagdetalj). Skrivvägar
 * fortsätter på inloggad användare.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Search, X } from 'lucide-react';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface StaffOption { id: string; name: string }

const ViewAsPicker: React.FC = () => {
  const { staff, isAdmin, viewAs, setViewAs } = useMobileAuth();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [options, setOptions] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !isAdmin) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('staff_members')
        .select('id, name')
        .order('name', { ascending: true })
        .limit(200);
      if (!cancelled) {
        setOptions((data ?? []).filter((s: any) => s.id && s.name));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, isAdmin]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((s) => s.name.toLowerCase().includes(needle));
  }, [options, q]);

  if (!isAdmin) return null;

  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-50 px-4 py-3 space-y-2 shadow-sm">
      <div className="flex items-start gap-2">
        <Eye className="w-4 h-4 mt-0.5 text-amber-700" />
        <div className="flex-1 min-w-0">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-amber-800">
            Visningsläge (admin)
          </h2>
          <p className="text-xs text-amber-900/80 mt-0.5">
            Visa Idag, Tidrapport och Dagdetalj som en annan person.
            Read-only — påverkar inte timer, lön eller projekt.
          </p>
          {viewAs && (
            <p className="text-xs text-amber-900 font-semibold mt-1.5">
              Visar nu: {viewAs.name}
            </p>
          )}
        </div>
        {viewAs && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-amber-900"
            onClick={() => setViewAs(null)}
          >
            <X className="w-3.5 h-3.5 mr-1" /> Återställ
          </Button>
        )}
      </div>

      {!open ? (
        <Button size="sm" variant="outline" className="w-full" onClick={() => setOpen(true)}>
          <Search className="w-3.5 h-3.5 mr-2" /> Välj person att visa
        </Button>
      ) : (
        <div className="space-y-2">
          <Input
            autoFocus
            placeholder="Sök namn…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="max-h-64 overflow-y-auto rounded-lg border bg-card divide-y">
            {loading && <div className="p-3 text-xs text-muted-foreground">Laddar…</div>}
            {!loading && filtered.length === 0 && (
              <div className="p-3 text-xs text-muted-foreground">Ingen träff.</div>
            )}
            {!loading && filtered.map((s) => {
              const isSelf = s.id === staff?.id;
              const isActive = s.id === viewAs?.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between ${
                    isActive ? 'bg-amber-100' : ''
                  }`}
                  onClick={() => {
                    setViewAs(isSelf ? null : { id: s.id, name: s.name });
                    setOpen(false);
                    setQ('');
                  }}
                >
                  <span>{s.name}{isSelf ? ' (du)' : ''}</span>
                  {isActive && <Eye className="w-3.5 h-3.5 text-amber-700" />}
                </button>
              );
            })}
          </div>
          <Button size="sm" variant="ghost" className="w-full" onClick={() => { setOpen(false); setQ(''); }}>
            Stäng
          </Button>
        </div>
      )}
    </div>
  );
};

export default ViewAsPicker;
export { ViewAsPicker };

export const ViewAsBanner: React.FC = () => {
  const { isViewingAs, viewAs, setViewAs } = useMobileAuth();
  if (!isViewingAs || !viewAs) return null;
  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between gap-3 text-xs font-semibold shadow">
      <div className="flex items-center gap-2 min-w-0">
        <Eye className="w-4 h-4 shrink-0" />
        <span className="truncate">Visar som {viewAs.name} · read-only</span>
      </div>
      <button
        type="button"
        onClick={() => setViewAs(null)}
        className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-950/10 hover:bg-amber-950/20"
      >
        <EyeOff className="w-3.5 h-3.5" /> Avsluta
      </button>
    </div>
  );
};
