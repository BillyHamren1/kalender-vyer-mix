import React from 'react';
import { AlertTriangle, PackagePlus, PackageMinus, Hash, Check, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePackingChangeRequests } from '@/hooks/usePackingChangeRequests';
import { describeChange, type PackingChangeRequest } from '@/lib/packing/shortNoticeChange';

interface Props {
  packingId: string;
}

const iconFor = (type: PackingChangeRequest['change_type']) => {
  if (type === 'item_added') return <PackagePlus className="h-4 w-4" />;
  if (type === 'item_removed') return <PackageMinus className="h-4 w-4" />;
  return <Hash className="h-4 w-4" />;
};

const PackingChangeRequestsPanel: React.FC<Props> = ({ packingId }) => {
  const { changes, apply } = usePackingChangeRequests(packingId);

  if (changes.length === 0) return null;

  const shortNotice = changes.filter((c) => c.urgency === 'short_notice');
  const normal = changes.filter((c) => c.urgency !== 'short_notice');
  const isUrgent = shortNotice.length > 0;
  const days = shortNotice[0]?.days_until_rig ?? null;

  const wrapperClass = isUrgent
    ? 'border-destructive/40 bg-destructive/5'
    : 'border-amber-500/30 bg-amber-500/5';
  const headingClass = isUrgent ? 'text-destructive' : 'text-amber-700';

  const renderRow = (change: PackingChangeRequest) => (
    <div
      key={change.id}
      className="flex items-center gap-3 py-2 border-t border-border/40 first:border-t-0"
    >
      <span className={isUrgent ? 'text-destructive' : 'text-amber-700'}>{iconFor(change.change_type)}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{describeChange(change)}</p>
        {change.sku && <p className="text-xs text-muted-foreground">{change.sku}</p>}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs gap-1"
        disabled={apply.isPending}
        onClick={() => apply.mutate({ ids: [change.id] })}
      >
        <Check className="h-3 w-3" />
        Ta emot
      </Button>
    </div>
  );

  return (
    <div className={`mb-6 rounded-2xl border p-5 ${wrapperClass}`}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-start gap-3">
          {isUrgent ? (
            <ShieldAlert className="h-5 w-5 mt-0.5 text-destructive" />
          ) : (
            <AlertTriangle className="h-5 w-5 mt-0.5 text-amber-600" />
          )}
          <div>
            <h3 className={`text-base font-semibold ${headingClass}`}>
              {isUrgent ? 'Kort varsel – bokningen har ändrats' : 'Bokningen har ändrats'}
              {isUrgent && days !== null && (
                <Badge variant="destructive" className="ml-2 align-middle">
                  {days <= 0 ? 'rigg idag/passerad' : `${days} dagar till rigg`}
                </Badge>
              )}
            </h3>
            <p className="text-sm text-muted-foreground">
              {isUrgent
                ? 'Packlistan uppdateras först när du tagit emot ändringarna. Kontroll och signering är blockerad tills dess.'
                : 'Ändringarna skrivs in i packlistan när du tar emot dem.'}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          disabled={apply.isPending}
          onClick={() => apply.mutate({ ids: changes.map((c) => c.id) })}
        >
          Ta emot alla ({changes.length})
        </Button>
      </div>

      <div className="rounded-xl bg-background/70 px-4 py-1">
        {shortNotice.map(renderRow)}
        {normal.length > 0 && shortNotice.length > 0 && (
          <p className="pt-3 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Övriga ändringar
          </p>
        )}
        {normal.map(renderRow)}
      </div>
    </div>
  );
};

export default PackingChangeRequestsPanel;
