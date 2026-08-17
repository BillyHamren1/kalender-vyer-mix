import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { PackingIntegrityIssue, PackingIntegrityResult } from '@/lib/packing/packingIntegrity';

interface PackingIntegrityBannerProps {
  integrity: PackingIntegrityResult | null;
  error?: Error | null;
  packingStatus?: string | null;
  onRefresh?: () => void | Promise<void>;
  compact?: boolean;
}

const issueText = (issue: PackingIntegrityIssue) => {
  switch (issue.type) {
    case 'missing_item':
      return `${issue.name}: finns i bokningen men saknas på packlistan (${issue.expectedQuantity ?? 0} st).`;
    case 'orphan_item':
      return `${issue.name}: finns på packlistan men inte längre i bokningens packbara rader.`;
    case 'quantity_mismatch':
      return `${issue.name}: packlista ${issue.actualQuantity ?? 0} st, bokning ${issue.expectedQuantity ?? 0} st.`;
    case 'duplicate_item':
      return `${issue.name}: förekommer flera gånger på packlistan.`;
    case 'excluded_source_item':
      return `${issue.name}: finns i bokningen men är exkluderad från den operativa packlistan.`;
    case 'manual_item':
      return `${issue.name}: manuell extrarad på packlistan (${issue.actualQuantity ?? 0} st).`;
    default:
      return issue.name;
  }
};

export const PackingIntegrityBanner = ({
  integrity,
  error = null,
  packingStatus,
  onRefresh,
  compact = false,
}: PackingIntegrityBannerProps) => {
  const [open, setOpen] = useState(false);

  if (error) {
    return (
      <div className="rounded-xl border-2 border-destructive/45 bg-destructive/5 px-4 py-3 flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-destructive">Packlistans integritet kunde inte verifieras</p>
          <p className="text-xs text-destructive/90 mt-0.5">Listan är blockerad tills kontrollen kan genomföras utan fel.</p>
        </div>
        {onRefresh && (
          <Button variant="outline" size="sm" className="h-8" onClick={() => onRefresh()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Försök igen
          </Button>
        )}
      </div>
    );
  }

  if (!integrity) {
    return (
      <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Kontrollerar packlistans underlag…
      </div>
    );
  }

  if (!integrity.sourceAvailable) {
    return (
      <div className="rounded-xl border border-amber-300/70 bg-amber-50/70 dark:bg-amber-950/20 px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Manuellt packunderlag</p>
          <p className="text-xs text-amber-800/90 dark:text-amber-200/80 mt-0.5">
            Ingen bokningskälla kunde jämföras. Kontrollera manuella rader innan packning eller utskrift.
          </p>
        </div>
        {onRefresh && (
          <Button variant="outline" size="sm" className="h-8" onClick={() => onRefresh()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Kontrollera igen
          </Button>
        )}
      </div>
    );
  }

  if (integrity.isExactMatch) {
    return (
      <div className="rounded-xl border border-emerald-300/70 bg-emerald-50/70 dark:bg-emerald-950/20 px-4 py-3 flex items-start gap-3">
        <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">Packlistan matchar bokningen</p>
          <p className="text-xs text-emerald-800/90 dark:text-emerald-200/80 mt-0.5">
            {integrity.expectedRows} packbara bokningsrader kontrollerade utan blockerande avvikelse
            {integrity.warningCount > 0 ? ` · ${integrity.warningCount} tydligt markerad extrarad/varning` : ''}.
          </p>
        </div>
        {onRefresh && !compact && (
          <Button variant="outline" size="sm" className="h-8" onClick={() => onRefresh()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Kontrollera igen
          </Button>
        )}
      </div>
    );
  }

  const activePacking = packingStatus && packingStatus !== 'planning';
  const blockingIssues = integrity.issues.filter((issue) => issue.severity === 'blocking');
  const warningIssues = integrity.issues.filter((issue) => issue.severity === 'warning');

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-xl border-2 border-destructive/45 bg-destructive/5 overflow-hidden">
        <div className="px-4 py-3 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-destructive">Packlistan får inte användas utan kontroll</p>
            <p className="text-xs text-destructive/90 mt-0.5">
              {integrity.blockingCount} blockerande avvikelse{integrity.blockingCount === 1 ? '' : 'r'} mellan bokningen och den operativa packlistan.
              {activePacking ? ' Packningen har redan startat, så listan ändras inte automatiskt.' : ' Öppning av sidan ändrar aldrig packlistan automatiskt.'}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onRefresh && (
              <Button variant="outline" size="sm" className="h-8" onClick={() => onRefresh()}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Kontrollera igen
              </Button>
            )}
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 px-2">
                Detaljer
                <ChevronDown className={`h-3.5 w-3.5 ml-1 transition-transform ${open ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>
        <CollapsibleContent>
          <div className="border-t border-destructive/20 bg-background/70 px-4 py-3 space-y-2">
            {blockingIssues.map((issue, index) => (
              <div key={`${issue.type}-${issue.bookingProductId || index}`} className="flex items-start gap-2 text-xs">
                <ShieldAlert className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                <span>{issueText(issue)}</span>
              </div>
            ))}
            {warningIssues.map((issue, index) => (
              <div key={`warning-${issue.type}-${issue.bookingProductId || index}`} className="flex items-start gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span>{issueText(issue)}</span>
              </div>
            ))}
            <div className="pt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CheckCircle2 className="h-3 w-3" />
              Kontroll är read-only: inga packrader har lagts till, ändrats eller tagits bort.
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

export default PackingIntegrityBanner;
