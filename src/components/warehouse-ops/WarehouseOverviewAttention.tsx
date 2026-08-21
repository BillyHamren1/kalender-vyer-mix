import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, AlertCircle, Info, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { OpsAttention } from '@/hooks/useWarehouseOpsRange';

interface Props {
  items: OpsAttention[];
  maxItems?: number;
  compact?: boolean;
}

const levelConfig: Record<OpsAttention['level'], { icon: typeof AlertTriangle; color: string; bg: string }> = {
  critical: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-500/5' },
  warning: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-500/5' },
  info: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-500/5' },
};

const WarehouseOverviewAttention: React.FC<Props> = ({ items, maxItems = 5, compact = false }) => {
  const navigate = useNavigate();
  const visible = items.slice(0, maxItems);
  const hasMore = items.length > maxItems;

  if (visible.length === 0) {
    if (compact) return null;
    return (
      <section className="mb-5 rounded-xl border border-border/60 bg-card p-4">
        <header className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <h2 className="text-sm font-semibold text-[hsl(var(--heading))]">Kräver uppmärksamhet</h2>
        </header>
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          Inget kritiskt just nu — allt rullar enligt plan.
        </p>
      </section>
    );
  }

  if (compact) {
    return (
      <section className="rounded-lg border border-amber-200 bg-amber-50/40 overflow-hidden">
        <div className="h-7 px-2.5 flex items-center gap-2 border-b border-amber-200/70">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
          <span className="text-[11px] font-bold uppercase tracking-wide">Kräver uppmärksamhet</span>
          <span className="text-[10px] font-semibold text-amber-800">{items.length}</span>
          {hasMore && <button className="ml-auto text-[10px] font-semibold text-amber-800 hover:underline" onClick={() => navigate('/warehouse/packing')}>Visa alla</button>}
        </div>
        <div className="divide-y divide-amber-200/50">
          {visible.map((it) => {
            const cfg = levelConfig[it.level];
            const Icon = cfg.icon;
            const clickable = !!it.jobId;
            return (
              <div key={it.id} className={cn('min-h-8 px-2.5 flex items-center gap-2 text-[11px]', clickable && 'cursor-pointer hover:bg-amber-100/50')} onClick={() => clickable && navigate(`/warehouse/packing/${it.jobId}`)}>
                <Icon className={cn('h-3 w-3 shrink-0', cfg.color)} />
                <span className="font-semibold truncate max-w-[260px]">{it.title}</span>
                <span className="text-muted-foreground truncate flex-1">{it.detail}</span>
                {clickable && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className="mb-5 rounded-xl border border-border/60 bg-card overflow-hidden">
      <header className="px-4 py-2.5 border-b border-border/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <h2 className="text-sm font-semibold text-[hsl(var(--heading))]">Kräver uppmärksamhet</h2>
        </div>
        <span className="text-xs text-muted-foreground">{items.length} st</span>
      </header>
      <ul className="divide-y divide-border/40">
        {visible.map((it) => {
          const cfg = levelConfig[it.level];
          const Icon = cfg.icon;
          const clickable = !!it.jobId;
          return (
            <li key={it.id} className={cn('flex items-center gap-3 px-4 py-2.5', cfg.bg, clickable && 'cursor-pointer hover:bg-accent/40')} onClick={() => clickable && navigate(`/warehouse/packing/${it.jobId}`)}>
              <Icon className={cn('h-4 w-4 shrink-0', cfg.color)} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{it.title}</div>
                <div className="text-xs text-muted-foreground truncate">{it.detail}</div>
              </div>
              {clickable && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs shrink-0" onClick={(e) => { e.stopPropagation(); navigate(`/warehouse/packing/${it.jobId}`); }}>
                  Öppna <ChevronRight className="h-3 w-3 ml-0.5" />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {hasMore && <button className="w-full text-left px-4 py-2 text-xs font-medium text-primary hover:underline border-t border-border/60" onClick={() => navigate('/warehouse/packing')}>Visa alla {items.length} →</button>}
    </section>
  );
};

export default WarehouseOverviewAttention;
