import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import BillingStatusBadge from './BillingStatusBadge';
import type { ProjectBilling, BillingStatus } from '@/hooks/useProjectBilling';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);

const formatDate = (d: string | null | undefined) => {
  if (!d) return '—';
  try { return format(new Date(d), 'd MMM yyyy', { locale: sv }); } catch { return '—'; }
};

interface ColumnDef {
  status: BillingStatus;
  label: string;
  emptyText: string;
}

const COLUMNS: ColumnDef[] = [
  { status: 'under_review', label: 'Att granska', emptyText: 'Inget att granska' },
  { status: 'ready_to_invoice', label: 'Redo att fakturera', emptyText: 'Inga redo' },
  { status: 'invoice_created', label: 'Faktura skapad', emptyText: 'Inga skapade' },
  { status: 'invoiced', label: 'Fakturerad', emptyText: 'Inga fakturerade' },
  { status: 'overdue', label: 'Förfallen / Obetald', emptyText: 'Inget förfallet' },
  { status: 'paid', label: 'Betald', emptyText: 'Inga betalda' },
];

interface Props {
  grouped: Record<BillingStatus, ProjectBilling[]>;
  onSelectProject: (billing: ProjectBilling) => void;
}

const BillingProjectCard: React.FC<{ billing: ProjectBilling; onClick: () => void }> = ({ billing, onClick }) => {
  const hasWarning = !billing.client_name || billing.invoiceable_amount <= 0;
  
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-lg border border-border/40 bg-card hover:bg-muted/30 transition-all hover:shadow-sm group',
        hasWarning && 'border-amber-200/60 dark:border-amber-800/40'
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
          {billing.project_name}
        </p>
        {hasWarning && (
          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 mt-1.5" title="Behöver granskas" />
        )}
      </div>
      <p className="text-xs text-muted-foreground truncate mb-2">
        {billing.client_name || 'Kund saknas'}
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">
          {formatCurrency(billing.invoiceable_amount)}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {formatDate(billing.closed_at)}
        </span>
      </div>
      {billing.due_date && billing.billing_status !== 'paid' && (
        <p className="text-[10px] text-muted-foreground mt-1">
          Förfaller: {formatDate(billing.due_date)}
        </p>
      )}
    </button>
  );
};

const BillingPipeline: React.FC<Props> = ({ grouped, onSelectProject }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {COLUMNS.map((col) => {
        const items = grouped[col.status] ?? [];
        const totalAmount = items.reduce((s, p) => s + (p.invoiceable_amount ?? 0), 0);
        
        return (
          <div key={col.status} className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-foreground">{col.label}</h3>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-medium">
                  {items.length}
                </Badge>
              </div>
            </div>
            {totalAmount > 0 && (
              <p className="text-[10px] text-muted-foreground px-1 font-medium">
                {formatCurrency(totalAmount)}
              </p>
            )}
            
            <div className="space-y-2 min-h-[120px]">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <FileText className="h-5 w-5 text-muted-foreground/20 mb-1.5" />
                  <p className="text-[11px] text-muted-foreground/60">{col.emptyText}</p>
                </div>
              ) : (
                items.map((billing) => (
                  <BillingProjectCard
                    key={billing.id}
                    billing={billing}
                    onClick={() => onSelectProject(billing)}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default BillingPipeline;
