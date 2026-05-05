import React, { useMemo, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Undo2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import type { DayBlock } from '@/lib/staff/dayBlockTimeline';
import type { ActualDayEventOverride } from '@/hooks/useActualDayEventOverrides';

const fmtHm = (iso?: string | null) => {
  if (!iso) return '';
  try { return format(new Date(iso), 'HH:mm'); } catch { return iso.slice(11, 16); }
};

const describeBlock = (b: DayBlock | undefined): { time: string; label: string; kind: string } => {
  if (!b) return { time: '—', label: '(rad ej längre i datat)', kind: '' };
  const time = b.endIso && b.endIso !== b.startIso ? `${fmtHm(b.startIso)}–${fmtHm(b.endIso)}` : fmtHm(b.startIso);
  if (b.kind === 'presence') {
    return { time, label: (b as any).title ?? (b as any).resolvedPlace?.label ?? 'Vistelse', kind: (b as any).presenceKind === 'project' ? 'Projekt' : 'Vistelse' };
  }
  if (b.kind === 'journey') {
    return { time, label: `${(b as any).fromLabel ?? ''} → ${(b as any).toLabel ?? ''}`.trim(), kind: 'Resa' };
  }
  return { time, label: (b as any).expectedLabel ?? 'Glapp', kind: 'Glapp' };
};

interface Props {
  overrides: ActualDayEventOverride[];
  blocks: DayBlock[];
  onRestore: (overrideId: string) => Promise<boolean | void> | void;
}

export const ExcludedEventsSection: React.FC<Props> = ({ overrides, blocks, onRestore }) => {
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});

  const blockById = useMemo(() => {
    const m = new Map<string, DayBlock>();
    for (const b of blocks) m.set(b.id, b);
    return m;
  }, [blocks]);

  const userIds = useMemo(
    () => Array.from(new Set(overrides.map(o => o.created_by).filter((x): x is string => !!x))),
    [overrides],
  );

  useEffect(() => {
    if (userIds.length === 0) return;
    const missing = userIds.filter(id => !(id in names));
    if (missing.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', missing);
      const next: Record<string, string> = { ...names };
      for (const r of data ?? []) {
        next[r.user_id] = r.full_name ?? r.email ?? r.user_id.slice(0, 8);
      }
      setNames(next);
    })();
  }, [userIds, names]);

  if (overrides.length === 0) return null;

  return (
    <section className="px-4 py-3 border-b bg-amber-50/40 dark:bg-amber-950/10">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200 hover:underline"
      >
        <Trash2 className="h-3 w-3" />
        Exkluderade händelser ({overrides.length})
        <span className="text-[10px] font-normal opacity-70 normal-case">
          {open ? '· dölj' : '· visa & återställ'}
        </span>
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5">
          {overrides
            .slice()
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map(o => {
              const desc = describeBlock(blockById.get(o.event_key));
              const who = o.created_by ? (names[o.created_by] ?? '…') : 'okänd';
              const when = (() => { try { return format(new Date(o.created_at), 'yyyy-MM-dd HH:mm'); } catch { return o.created_at; } })();
              return (
                <li
                  key={o.id}
                  className="flex items-center gap-2 text-xs bg-card border border-border rounded-md px-2.5 py-1.5"
                >
                  <span className="tabular-nums font-medium text-foreground shrink-0 w-[110px]">{desc.time}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0 w-[60px]">{desc.kind}</span>
                  <span className="truncate flex-1 text-foreground">{desc.label}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:block">
                    av {who} · {when}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    onClick={() => onRestore(o.id)}
                    title="Återställ raden i huvudjournalen"
                  >
                    <Undo2 className="h-3 w-3 mr-1" />
                    Återställ
                  </Button>
                </li>
              );
            })}
        </ul>
      )}
    </section>
  );
};

export default ExcludedEventsSection;
