import { useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { PackingIntegrityIssue, PackingIntegrityResult } from '@/lib/packing/packingIntegrity';

interface PackingIntegrityBannerProps {
  integrity: PackingIntegrityResult | null;
  error?: Error | null;
  packingId?: string;
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
      return `${issue.name}: borttagen från den operativa packlistan i planeringsläget.`;
    case 'manual_item':
      return `${issue.name}: manuell extrarad på packlistan (${issue.actualQuantity ?? 0} st).`;
    case 'wms_only_item':
      return `${issue.name}: saknar motsvarande packbar bokningsrad (${issue.actualQuantity ?? 0} st).`;
    default:
      return issue.name;
  }
};

export const PackingIntegrityBanner = ({
  integrity,
  error = null,
  onRefresh,
}: PackingIntegrityBannerProps) => {
  const [open, setOpen] = useState(false);

  if (!error && (!integrity || integrity.isExactMatch)) return null;

  const sourceUnavailable = Boolean(integrity && !integrity.sourceAvailable);
  const issues = integrity?.issues ?? [];
  const problemCount = integrity
    ? integrity.blockingCount + integrity.warningCount
    : 1;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col items-end">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-amber-600 hover:text-amber-700"
          aria-label={`Visa problem med packlistan (${problemCount})`}
          title="Visa problem med packlistan"
        >
          <AlertTriangle className="h-5 w-5" />
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="w-full">
        <div className="mt-2 rounded-md border border-amber-300/70 bg-amber-50/70 px-4 py-3 dark:bg-amber-950/20">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Problem med packlistan</p>
              {error ? (
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-200/80">
                  Packlistans underlag kunde inte kontrolleras.
                </p>
              ) : sourceUnavailable ? (
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-200/80">
                  Underlaget kunde inte jämföras. Kontrollera listan manuellt.
                </p>
              ) : (
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-200/80">
                  {integrity?.blockingCount ?? 0} blockerande avvikelse{integrity?.blockingCount === 1 ? '' : 'r'} hittades.
                </p>
              )}
            </div>
            {onRefresh && (
              <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => onRefresh()}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Kontrollera igen
              </Button>
            )}
          </div>

          {issues.length > 0 && (
            <div className="mt-3 space-y-2 border-t border-amber-300/50 pt-3">
              {issues.map((issue, index) => (
                <div
                  key={`${issue.type}-${issue.bookingProductId || index}`}
                  className="flex items-start gap-2 text-xs text-foreground"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>{issueText(issue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default PackingIntegrityBanner;