import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Receipt,
  Loader2,
  Search,
  MoreHorizontal,
  AlertTriangle,
  Check,
  FileText,
  Banknote,
  ArrowLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  useProjectBillingList,
  useUpdateProjectBilling,
  useAdvanceBillingStatus,
  groupByBillingStatus,
  type ProjectBilling,
  type BillingStatus,
} from '@/hooks/useProjectBilling';
import BillingKpiCards from './BillingKpiCards';
import BillingStatusBadge from './BillingStatusBadge';
import BillingReviewDialog from './BillingReviewDialog';
import { startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);

const formatDate = (d: string | null | undefined) => {
  if (!d) return '—';
  try { return format(new Date(d), 'd MMM yyyy', { locale: sv }); } catch { return '—'; }
};

type FilterTab = 'all' | BillingStatus;

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'Alla' },
  { key: 'under_review', label: 'Att granska' },
  { key: 'ready_to_invoice', label: 'Redo' },
  { key: 'invoice_created', label: 'Skapad' },
  { key: 'invoiced', label: 'Fakturerad' },
  { key: 'overdue', label: 'Förfallen' },
  { key: 'paid', label: 'Betald' },
];

/** Priority score — lower = higher priority in list */
function getPriority(item: ProjectBilling, isOverdue: boolean): number {
  const hasWarning = !item.client_name || item.invoiceable_amount <= 0;
  if (hasWarning) return 0;
  if (isOverdue) return 1;
  if (item.billing_status === 'under_review') return 2;
  if (item.billing_status === 'ready_to_invoice') return 3;
  if (item.billing_status === 'invoice_created') return 4;
  if (item.billing_status === 'invoiced') return 5;
  if (item.billing_status === 'partially_paid') return 6;
  if (item.billing_status === 'paid') return 10;
  return 7;
}

function getWarnings(item: ProjectBilling): string[] {
  const w: string[] = [];
  if (!item.client_name) w.push('Kund saknas');
  if (item.invoiceable_amount <= 0) w.push('Belopp 0 kr');
  if (item.total_cost <= 0) w.push('Kostnader saknas');
  if (!item.closed_at) w.push('Stängningsdatum saknas');
  if (item.quoted_amount > 0) {
    const dev = Math.abs(item.invoiceable_amount - item.quoted_amount) / item.quoted_amount;
    if (dev > 0.1) w.push('Avviker från offert');
  }
  return w;
}

const BillingSection: React.FC = () => {
  const { data: billingItems = [], isLoading } = useProjectBillingList();
  const updateBilling = useUpdateProjectBilling();
  const { advance } = useAdvanceBillingStatus();
  const [selectedBilling, setSelectedBilling] = useState<ProjectBilling | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const grouped = useMemo(() => groupByBillingStatus(billingItems), [billingItems]);

  // Build a set of overdue IDs for quick lookup
  const overdueIds = useMemo(() => new Set(grouped.overdue.map(i => i.id)), [grouped.overdue]);

  const paidThisMonth = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    return grouped.paid.filter(p => {
      if (!p.invoice_paid_at) return false;
      const d = new Date(p.invoice_paid_at);
      return isWithinInterval(d, { start: monthStart, end: monthEnd });
    });
  }, [grouped.paid]);

  const sentUnpaid = useMemo(
    () => [...grouped.invoiced, ...grouped.invoice_created],
    [grouped.invoiced, grouped.invoice_created]
  );

  // Filtered & sorted list
  const filteredItems = useMemo(() => {
    let items = billingItems;

    // Tab filter
    if (activeTab === 'overdue') {
      items = grouped.overdue;
    } else if (activeTab !== 'all') {
      items = grouped[activeTab] ?? [];
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i =>
        i.project_name.toLowerCase().includes(q) ||
        (i.client_name?.toLowerCase().includes(q)) ||
        i.project_id.toLowerCase().includes(q) ||
        (i.invoice_number?.toLowerCase().includes(q)) ||
        (i.project_leader?.toLowerCase().includes(q))
      );
    }

    // Sort by priority
    return [...items].sort((a, b) => {
      const pa = getPriority(a, overdueIds.has(a.id));
      const pb = getPriority(b, overdueIds.has(b.id));
      if (pa !== pb) return pa - pb;
      // Secondary: most recent first
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [billingItems, activeTab, searchQuery, grouped, overdueIds]);

  const handleSave = (id: string, updates: Partial<ProjectBilling>) => {
    updateBilling.mutate({ id, ...updates } as any);
  };

  const handleAdvance = (id: string, newStatus: BillingStatus) => {
    advance(id, newStatus);
    setSelectedBilling(null);
  };

  const handleQuickAdvance = (item: ProjectBilling, newStatus: BillingStatus) => {
    advance(item.id, newStatus);
  };

  if (isLoading) {
    return (
      <Card className="border-border/40">
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const hasAnyItems = billingItems.length > 0;

  // Tab counts
  const tabCounts: Record<FilterTab, number> = {
    all: billingItems.length,
    not_ready: grouped.not_ready.length,
    under_review: grouped.under_review.length,
    ready_to_invoice: grouped.ready_to_invoice.length,
    invoice_created: grouped.invoice_created.length,
    invoiced: grouped.invoiced.length,
    partially_paid: grouped.partially_paid.length,
    paid: grouped.paid.length,
    overdue: grouped.overdue.length,
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Receipt className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold text-foreground">Fakturering</h2>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-medium ml-1">
          {billingItems.length}
        </Badge>
      </div>

      {!hasAnyItems ? (
        <Card className="border-border/40">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Receipt className="h-10 w-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Inga projekt i faktureringskön</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Projekt som stängs operativt visas här automatiskt för granskning
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI cards */}
          <BillingKpiCards
            underReview={grouped.under_review}
            readyToInvoice={grouped.ready_to_invoice}
            invoiced={sentUnpaid}
            overdue={grouped.overdue}
            paidThisMonth={paidThisMonth}
            onFilterClick={(filter) => setActiveTab(filter)}
            activeFilter={activeTab}
          />

          {/* Filter tabs + Search */}
          <Card className="border-border/40">
            <CardContent className="p-0">
              {/* Tabs row */}
              <div className="flex items-center justify-between border-b border-border/40 px-4">
                <div className="flex items-center gap-0 overflow-x-auto">
                  {TABS.map(tab => {
                    const count = tabCounts[tab.key];
                    const isActive = activeTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={cn(
                          'px-3 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap',
                          isActive
                            ? 'border-primary text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                        )}
                      >
                        {tab.label}
                        {count > 0 && (
                          <span className={cn(
                            'ml-1.5 text-[10px] px-1.5 py-0 rounded-full',
                            isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                          )}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="relative shrink-0 ml-3">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Sök projekt, kund…"
                    className="h-8 w-48 pl-8 text-xs border-border/40"
                  />
                </div>
              </div>

              {/* Table */}
              {filteredItems.length === 0 ? (
                <EmptyState tab={activeTab} searchQuery={searchQuery} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/40">
                        <th className="text-left py-2.5 px-4 w-8"></th>
                        <th className="text-left py-2.5 px-4">Projekt</th>
                        <th className="text-left py-2.5 px-4 hidden md:table-cell">Kund</th>
                        <th className="text-left py-2.5 px-4 hidden lg:table-cell">Ansvarig</th>
                        <th className="text-left py-2.5 px-4">Status</th>
                        <th className="text-right py-2.5 px-4">Belopp</th>
                        <th className="text-left py-2.5 px-4 hidden lg:table-cell">Stängd</th>
                        <th className="text-left py-2.5 px-4 hidden xl:table-cell">Förfaller</th>
                        <th className="text-right py-2.5 px-4 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map(item => (
                        <BillingRow
                          key={item.id}
                          item={item}
                          isOverdue={overdueIds.has(item.id)}
                          onOpen={() => setSelectedBilling(item)}
                          onQuickAdvance={handleQuickAdvance}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Review dialog */}
      <BillingReviewDialog
        billing={selectedBilling}
        open={!!selectedBilling}
        onClose={() => setSelectedBilling(null)}
        onSave={handleSave}
        onAdvanceStatus={handleAdvance}
      />
    </div>
  );
};

/* ─── TABLE ROW ─── */
const BillingRow: React.FC<{
  item: ProjectBilling;
  isOverdue: boolean;
  onOpen: () => void;
  onQuickAdvance: (item: ProjectBilling, status: BillingStatus) => void;
}> = ({ item, isOverdue, onOpen, onQuickAdvance }) => {
  const warnings = getWarnings(item);
  const displayStatus = isOverdue ? 'overdue' as BillingStatus : item.billing_status;

  return (
    <tr
      onClick={onOpen}
      className={cn(
        'border-b border-border/20 hover:bg-muted/20 transition-colors cursor-pointer group',
        warnings.length > 0 && 'bg-amber-50/30 dark:bg-amber-950/5'
      )}
    >
      {/* Warning indicator */}
      <td className="py-3 px-4">
        {warnings.length > 0 ? (
          <span
            className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/30"
            title={warnings.join(', ')}
          >
            <AlertTriangle className="h-3 w-3 text-amber-600" />
          </span>
        ) : (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100/60 dark:bg-green-900/20">
            <Check className="h-3 w-3 text-green-600/70" />
          </span>
        )}
      </td>

      {/* Project name */}
      <td className="py-3 px-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate max-w-[240px] group-hover:text-primary transition-colors">
            {item.project_name}
          </p>
          <p className="text-xs text-muted-foreground truncate max-w-[240px] md:hidden mt-0.5">
            {item.client_name || 'Kund saknas'}
          </p>
        </div>
      </td>

      {/* Client */}
      <td className="py-3 px-4 hidden md:table-cell">
        <p className={cn(
          'text-sm truncate max-w-[160px]',
          item.client_name ? 'text-foreground' : 'text-muted-foreground/50 italic'
        )}>
          {item.client_name || 'Saknas'}
        </p>
      </td>

      {/* Leader */}
      <td className="py-3 px-4 hidden lg:table-cell">
        <p className="text-sm text-muted-foreground truncate max-w-[120px]">
          {item.project_leader || '—'}
        </p>
      </td>

      {/* Status */}
      <td className="py-3 px-4">
        <BillingStatusBadge status={displayStatus} />
      </td>

      {/* Amount */}
      <td className="py-3 px-4 text-right">
        <p className="text-sm font-semibold text-foreground whitespace-nowrap">
          {formatCurrency(item.invoiceable_amount)}
        </p>
      </td>

      {/* Closed date */}
      <td className="py-3 px-4 hidden lg:table-cell">
        <p className="text-xs text-muted-foreground whitespace-nowrap">
          {formatDate(item.closed_at)}
        </p>
      </td>

      {/* Due date */}
      <td className="py-3 px-4 hidden xl:table-cell">
        {item.due_date ? (
          <p className={cn(
            'text-xs whitespace-nowrap',
            isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'
          )}>
            {formatDate(item.due_date)}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/40">—</p>
        )}
      </td>

      {/* Actions */}
      <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
        <QuickActions item={item} onAdvance={onQuickAdvance} onOpen={onOpen} />
      </td>
    </tr>
  );
};

/* ─── QUICK ACTIONS DROPDOWN ─── */
const QuickActions: React.FC<{
  item: ProjectBilling;
  onAdvance: (item: ProjectBilling, status: BillingStatus) => void;
  onOpen: () => void;
}> = ({ item, onAdvance, onOpen }) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onOpen} className="gap-2 text-xs">
          <ChevronRight className="h-3.5 w-3.5" />
          Öppna granskning
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {item.billing_status === 'under_review' && (
          <>
            <DropdownMenuItem onClick={() => onAdvance(item, 'ready_to_invoice')} className="gap-2 text-xs">
              <Check className="h-3.5 w-3.5" />
              Godkänn för fakturering
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAdvance(item, 'under_review')} className="gap-2 text-xs text-amber-600">
              <ArrowLeft className="h-3.5 w-3.5" />
              Markera för komplettering
            </DropdownMenuItem>
          </>
        )}
        {item.billing_status === 'ready_to_invoice' && (
          <DropdownMenuItem onClick={() => onAdvance(item, 'invoice_created')} className="gap-2 text-xs">
            <FileText className="h-3.5 w-3.5" />
            Markera faktura skapad
          </DropdownMenuItem>
        )}
        {item.billing_status === 'invoice_created' && (
          <DropdownMenuItem onClick={() => onAdvance(item, 'invoiced')} className="gap-2 text-xs">
            <Receipt className="h-3.5 w-3.5" />
            Markera som fakturerad
          </DropdownMenuItem>
        )}
        {(item.billing_status === 'invoiced' || item.billing_status === 'overdue') && (
          <DropdownMenuItem onClick={() => onAdvance(item, 'paid')} className="gap-2 text-xs">
            <Banknote className="h-3.5 w-3.5" />
            Markera som betald
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/* ─── EMPTY STATE ─── */
const EMPTY_TEXTS: Record<FilterTab, { title: string; sub: string }> = {
  all: { title: 'Inga projekt i faktureringskön', sub: 'Projekt som stängs operativt visas här automatiskt' },
  not_ready: { title: 'Inga projekt ej redo', sub: '' },
  under_review: { title: 'Inga projekt att granska just nu', sub: 'Alla projekt har passerat granskningsstadiet' },
  ready_to_invoice: { title: 'Alla godkända projekt är redan fakturerade', sub: 'Granska fler projekt för att få dem redo' },
  invoice_created: { title: 'Inga fakturor skapade', sub: 'Godkänn projekt för att skapa fakturaunderlag' },
  invoiced: { title: 'Inga utestående fakturor', sub: 'Alla fakturor är antingen betalda eller ej skapade' },
  partially_paid: { title: 'Inga delbetalda', sub: '' },
  paid: { title: 'Inga betalda projekt denna period', sub: 'Betalda projekt visas här' },
  overdue: { title: 'Inga förfallna fakturor', sub: 'Alla utestående fakturor är inom betalningsvillkoren' },
};

const EmptyState: React.FC<{ tab: FilterTab; searchQuery: string }> = ({ tab, searchQuery }) => {
  if (searchQuery.trim()) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Search className="h-8 w-8 text-muted-foreground/20 mb-2" />
        <p className="text-sm font-medium text-muted-foreground">Inga resultat för "{searchQuery}"</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Prova med annat sökord</p>
      </div>
    );
  }
  const { title, sub } = EMPTY_TEXTS[tab];
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Receipt className="h-8 w-8 text-muted-foreground/20 mb-2" />
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {sub && <p className="text-xs text-muted-foreground/70 mt-1">{sub}</p>}
    </div>
  );
};

export default BillingSection;
