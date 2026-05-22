import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  TrendingDown,
  Clock,
  CalendarClock,
  Lock,
  ChevronRight,
  CheckCheck,
  Filter,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { differenceInDays, parseISO } from 'date-fns';
import type { EconomyProjectInsight } from '@/types/economyOverview';
import { useAllAttestations, getAttestationCounts } from '@/hooks/useSupplierInvoiceAttestation';
import { useProjectBillingList, groupByBillingStatus } from '@/hooks/useProjectBilling';
import { useApproveTimeReport } from '@/hooks/useApproveTimeReport';
import {
  computeProjectEconomySignals,
  EMPTY_ATTEST_COUNTS,
  type ProjectEconomySignals,
} from '@/lib/economy/projectEconomyStatus';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);

// ─── Filter definitions ────────────────────────────────────────────────────

export type ActionFilter =
  | 'all'
  | 'new-invoices'
  | 'unattested'
  | 'unapproved-time'
  | 'margin-warning'
  | 'long-open'
  | 'ready-to-close'
  | 'blocked'
  | 'handed-over';

interface ActionItem {
  projectName: string;
  detail: string;
  amount?: number;
  badge?: string;
  navigateTo: string;
  projectId: string;
  /** For bulk time approval — report IDs */
  pendingTimeReportIds?: string[];
}

interface ActionSection {
  id: ActionFilter;
  title: string;
  icon: React.ReactNode;
  colorClass: string;
  items: ActionItem[];
  emptyText: string;
  /** Whether this section supports bulk approve */
  bulkApproveTime?: boolean;
}

interface ProjectLeaderActionBoardProps {
  projectInsights: EconomyProjectInsight[];
  /** Initial filter from URL or parent */
  initialFilter?: ActionFilter;
}

const ProjectLeaderActionBoard: React.FC<ProjectLeaderActionBoardProps> = ({ projectInsights, initialFilter }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlFilter = searchParams.get('filter') as ActionFilter | null;
  const [activeFilter, setActiveFilter] = useState<ActionFilter>(initialFilter || urlFilter || 'all');
  const { approveMutation } = useApproveTimeReport();

  const { data: allAttestations = [] } = useAllAttestations();
  const { data: billingItems = [] } = useProjectBillingList();
  const grouped = useMemo(() => groupByBillingStatus(billingItems), [billingItems]);

  // Group attestations by booking_id
  const attestByBooking = useMemo(() => {
    const map: Record<string, typeof allAttestations> = {};
    allAttestations.forEach(a => {
      if (!map[a.booking_id]) map[a.booking_id] = [];
      map[a.booking_id].push(a);
    });
    return map;
  }, [allAttestations]);

  // Compute signals per project
  const signalsMap = useMemo(() => {
    const map = new Map<string, ProjectEconomySignals>();
    projectInsights.forEach(p => {
      const bookingAttests = p.booking_id ? (attestByBooking[p.booking_id] || []) : [];
      const counts = bookingAttests.length > 0 ? getAttestationCounts(bookingAttests) : EMPTY_ATTEST_COUNTS;
      const billing = billingItems.find(b => b.project_id === p.id);
      const signals = computeProjectEconomySignals({
        summary: p.summary,
        attestCounts: counts,
        billingStatus: billing?.billing_status ?? null,
        budgetedHours: p.summary.budgetedHours,
        hourlyRate: p.summary.hourlyRate,
        timeReportsApproved: true,
        hasRecentEconomyData: true,
      });
      map.set(p.id, signals);
    });
    return map;
  }, [projectInsights, attestByBooking, billingItems]);

  // Only active projects
  const active = useMemo(() =>
    projectInsights.filter(p => p.status !== 'completed' && p.economyStatus !== 'economy-closed'),
    [projectInsights]
  );

  const sections: ActionSection[] = useMemo(() => {
    // 1. New supplier invoices
    const newInvoices: ActionItem[] = [];
    active.forEach(p => {
      const s = signalsMap.get(p.id);
      if (s && s.supplierInvoice.importedCount > 0) {
        newInvoices.push({
          projectName: p.name, detail: `${s.supplierInvoice.importedCount} nya fakturor`,
          navigateTo: p.navigateTo, projectId: p.id, badge: `${s.supplierInvoice.importedCount}`,
        });
      }
    });

    // 2. Unattested costs
    const unattested: ActionItem[] = [];
    active.forEach(p => {
      const s = signalsMap.get(p.id);
      if (s && s.supplierInvoice.unattestedCount > 0 && s.supplierInvoice.importedCount === 0) {
        unattested.push({
          projectName: p.name, detail: `${s.supplierInvoice.unattestedCount} inväntar attest`,
          navigateTo: p.navigateTo, projectId: p.id, badge: `${s.supplierInvoice.unattestedCount}`,
        });
      }
    });

    // 3. Unapproved time reports — include report IDs for bulk approve
    const unapprovedTime: ActionItem[] = [];
    active.forEach(p => {
      const pending = p.timeReports.flatMap(r => r.detailed_reports || []).filter(r => !r.approved);
      if (pending.length > 0) {
        unapprovedTime.push({
          projectName: p.name, detail: `${pending.length} tidrapporter väntar`,
          navigateTo: p.navigateTo, projectId: p.id, badge: `${pending.length}`,
          pendingTimeReportIds: pending.map(r => r.id),
        });
      }
    });

    // 4. Margin warnings
    const marginWarnings: ActionItem[] = [];
    active.forEach(p => {
      const s = signalsMap.get(p.id);
      if (s && (s.margin.level === 'warning' || s.margin.level === 'danger')) {
        marginWarnings.push({
          projectName: p.name, detail: `Marginal: ${s.margin.marginPercent.toFixed(0)}%`,
          amount: s.margin.marginAmount, navigateTo: p.navigateTo, projectId: p.id,
        });
      }
    });

    // 5. Long-open projects
    const longOpen: ActionItem[] = [];
    active.forEach(p => {
      if (!p.bookingCreatedAt) return;
      const days = differenceInDays(new Date(), parseISO(p.bookingCreatedAt));
      if (days > 90) {
        longOpen.push({
          projectName: p.name, detail: `Öppet i ${days} dagar`,
          navigateTo: p.navigateTo, projectId: p.id,
        });
      }
    });

    // 6. Ready to close — only projects where event date has passed
    const readyToClose: ActionItem[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    active.forEach(p => {
      const s = signalsMap.get(p.id);
      if (s && s.closure.canClose && s.handover.billingStatus === null) {
        // Must have an event date that has passed before it can be closed
        if (!p.eventdate) return;
        const eventDate = parseISO(p.eventdate);
        if (eventDate > today) return;

        readyToClose.push({
          projectName: p.name, detail: 'Alla krav uppfyllda', amount: s.revenue,
          navigateTo: p.navigateTo, projectId: p.id,
        });
      }
    });

    // 7. Blocked from closure
    const blocked: ActionItem[] = [];
    active.forEach(p => {
      const s = signalsMap.get(p.id);
      if (s && !s.closure.canClose && s.blockers.length > 0) {
        blocked.push({
          projectName: p.name, detail: s.blockers.map(b => b.detail || b.label).join(', '),
          navigateTo: p.navigateTo, projectId: p.id, badge: `${s.blockers.length}`,
        });
      }
    });

    // 8. Handed over
    const handedOver: ActionItem[] = grouped.handed_over_to_booking.map(b => ({
      projectName: b.project_name, detail: b.client_name || 'Överlämnad',
      amount: b.invoiceable_amount, navigateTo: `/project/${b.project_id}`, projectId: b.project_id,
    }));

    return [
      { id: 'new-invoices' as const, title: 'Nya leverantörsfakturor', icon: <FileText className="h-4 w-4" />, colorClass: 'text-sky-600', items: newInvoices, emptyText: 'Inga nya fakturor' },
      { id: 'unattested' as const, title: 'Oattesterade kostnader', icon: <AlertTriangle className="h-4 w-4" />, colorClass: 'text-amber-600', items: unattested, emptyText: 'Allt attesterat' },
      { id: 'unapproved-time' as const, title: 'Ej godkända tider', icon: <Clock className="h-4 w-4" />, colorClass: 'text-orange-600', items: unapprovedTime, emptyText: 'Alla tider godkända', bulkApproveTime: true },
      { id: 'margin-warning' as const, title: 'Marginalvarning', icon: <TrendingDown className="h-4 w-4" />, colorClass: 'text-red-600', items: marginWarnings, emptyText: 'Inga marginalvarningar' },
      { id: 'long-open' as const, title: 'Öppna länge (>90 dagar)', icon: <CalendarClock className="h-4 w-4" />, colorClass: 'text-violet-600', items: longOpen, emptyText: 'Inga gamla projekt' },
      { id: 'ready-to-close' as const, title: 'Redo att stänga', icon: <CheckCircle2 className="h-4 w-4" />, colorClass: 'text-green-600', items: readyToClose, emptyText: 'Inga projekt klara just nu' },
      { id: 'blocked' as const, title: 'Blockerade från stängning', icon: <Lock className="h-4 w-4" />, colorClass: 'text-red-600', items: blocked, emptyText: 'Inga blockerade projekt' },
      { id: 'handed-over' as const, title: 'Överlämnade till ekonomi', icon: <ArrowRight className="h-4 w-4" />, colorClass: 'text-purple-600', items: handedOver, emptyText: 'Inga överlämnade' },
    ];
  }, [active, signalsMap, grouped]);

  // Filter logic
  const visibleSections = useMemo(() => {
    if (activeFilter === 'all') return sections;
    return sections.filter(s => s.id === activeFilter);
  }, [sections, activeFilter]);

  const nonEmpty = visibleSections.filter(s => s.items.length > 0);
  const empty = visibleSections.filter(s => s.items.length === 0);
  const totalActions = sections.filter(s => s.items.length > 0).reduce((sum, s) => sum + s.items.length, 0);

  const handleFilterClick = (filterId: ActionFilter) => {
    const next = activeFilter === filterId ? 'all' : filterId;
    setActiveFilter(next);
    // Persist filter in URL for back-navigation context
    if (next === 'all') {
      searchParams.delete('filter');
    } else {
      searchParams.set('filter', next);
    }
    setSearchParams(searchParams, { replace: true });
  };

  // Bulk approve all time reports across all visible projects
  const handleBulkApproveAll = (section: ActionSection) => {
    const allIds = section.items.flatMap(item => item.pendingTimeReportIds || []);
    if (allIds.length === 0) return;
    approveMutation.mutate(allIds);
  };

  // Approve single project's time reports
  const handleApproveProject = (item: ActionItem) => {
    if (!item.pendingTimeReportIds?.length) return;
    approveMutation.mutate(item.pendingTimeReportIds);
  };

  return (
    <div className="space-y-4">
      {/* Header + summary */}
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-sm font-bold text-foreground tracking-tight">Kontrollcenter</h2>
        {totalActions > 0 ? (
          <Badge className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary border-primary/20">
            {totalActions} åtgärd{totalActions !== 1 ? 'er' : ''}
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
            Allt i ordning
          </Badge>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
        {sections.map(s => {
          const isActive = activeFilter === s.id;
          const count = s.items.length;
          return (
            <button
              key={s.id}
              onClick={() => handleFilterClick(s.id)}
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10.5px] font-semibold transition-colors border',
                isActive
                  ? 'bg-[hsl(270_45%_94%)] text-[hsl(280_55%_30%)] border-[hsl(270_40%_80%)]'
                  : count > 0
                    ? 'bg-white text-foreground/80 border-[hsl(270_18%_88%)] hover:bg-[hsl(270_35%_97%)] hover:border-[hsl(270_30%_82%)]'
                    : 'bg-transparent text-muted-foreground/50 border-transparent hover:bg-[hsl(270_35%_97%)]'
              )}
            >
              {s.icon}
              <span className="hidden sm:inline">{s.title}</span>
              {count > 0 && (
                <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3.5 tabular-nums ml-0.5">
                  {count}
                </Badge>
              )}
            </button>
          );
        })}
        {activeFilter !== 'all' && (
          <button
            onClick={() => handleFilterClick('all')}
            className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded-md text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" />
            Rensa
          </button>
        )}
      </div>

      {/* Action cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
        {nonEmpty.map(section => (
          <Card key={section.id} className="planning-card border-[hsl(270_20%_88%)]/70 hover:border-[hsl(270_30%_78%)] transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className={cn('p-1.5 rounded-lg bg-muted/60', section.colorClass)}>
                  {section.icon}
                </div>
                <h3 className="text-xs font-semibold text-foreground flex-1">{section.title}</h3>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 tabular-nums">
                  {section.items.length}
                </Badge>
              </div>

              {/* Bulk approve button for time reports */}
              {section.bulkApproveTime && section.items.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full mb-2 gap-1.5 text-[10px] h-7 border-green-200 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950/30"
                  onClick={() => handleBulkApproveAll(section)}
                  disabled={approveMutation.isPending}
                >
                  <CheckCheck className="h-3 w-3" />
                  Godkänn alla ({section.items.flatMap(i => i.pendingTimeReportIds || []).length} rapporter i {section.items.length} projekt)
                </Button>
              )}

              <div className="space-y-1 max-h-[220px] overflow-y-auto">
                {section.items.slice(0, 8).map((item, i) => (
                  <div
                    key={i}
                    className="w-full flex items-center gap-2 py-2 px-2.5 rounded-md hover:bg-muted/40 text-left text-xs transition-colors group"
                  >
                    <button
                      onClick={() => navigate(item.navigateTo)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
                        {item.projectName}
                      </p>
                      <p className="text-muted-foreground truncate text-[10px]">{item.detail}</p>
                    </button>
                    {item.badge && (
                      <Badge variant="outline" className="text-[9px] shrink-0 tabular-nums h-4 px-1">
                        {item.badge}
                      </Badge>
                    )}
                    {item.amount !== undefined && (
                      <span className="text-[10px] font-medium text-muted-foreground tabular-nums shrink-0">
                        {formatCurrency(item.amount)}
                      </span>
                    )}
                    {/* Per-project approve button for time reports */}
                    {section.bulkApproveTime && item.pendingTimeReportIds && item.pendingTimeReportIds.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 px-1.5 text-[9px] shrink-0 text-green-700 hover:text-green-800 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/30"
                        onClick={(e) => { e.stopPropagation(); handleApproveProject(item); }}
                        disabled={approveMutation.isPending}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                      </Button>
                    )}
                    <button onClick={() => navigate(item.navigateTo)} className="shrink-0">
                      <ChevronRight className="h-3 w-3 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                    </button>
                  </div>
                ))}
                {section.items.length > 8 && (
                  <p className="text-[10px] text-muted-foreground/50 text-center py-1">
                    +{section.items.length - 8} till
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty sections */}
      {empty.length > 0 && activeFilter === 'all' && (
        <div className="flex items-center gap-3 flex-wrap px-1">
          {empty.map(s => (
            <span key={s.id} className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
              <CheckCircle2 className="h-3 w-3 text-green-500/50" />
              {s.title}
            </span>
          ))}
        </div>
      )}

      {/* Empty state for filtered view */}
      {activeFilter !== 'all' && nonEmpty.length === 0 && (
        <Card className="border-border/30">
          <CardContent className="p-6 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-500/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{visibleSections[0]?.emptyText || 'Inga resultat'}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ProjectLeaderActionBoard;
