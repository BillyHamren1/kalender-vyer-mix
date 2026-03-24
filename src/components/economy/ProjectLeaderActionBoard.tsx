import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { differenceInDays, parseISO } from 'date-fns';
import type { EconomyProjectInsight } from '@/types/economyOverview';
import { useAllAttestations, getAttestationCounts } from '@/hooks/useSupplierInvoiceAttestation';
import { useProjectBillingList, groupByBillingStatus } from '@/hooks/useProjectBilling';
import {
  computeProjectEconomySignals,
  EMPTY_ATTEST_COUNTS,
  type ProjectEconomySignals,
} from '@/lib/economy/projectEconomyStatus';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);

interface ActionItem {
  projectName: string;
  detail: string;
  amount?: number;
  badge?: string;
  navigateTo: string;
  projectId: string;
}

interface ActionSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  colorClass: string;
  items: ActionItem[];
  emptyText: string;
}

interface ProjectLeaderActionBoardProps {
  projectInsights: EconomyProjectInsight[];
}

const ProjectLeaderActionBoard: React.FC<ProjectLeaderActionBoardProps> = ({ projectInsights }) => {
  const navigate = useNavigate();
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

  // Only active projects (not completed/closed)
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
          projectName: p.name,
          detail: `${s.supplierInvoice.importedCount} nya fakturor`,
          navigateTo: p.navigateTo,
          projectId: p.id,
          badge: `${s.supplierInvoice.importedCount}`,
        });
      }
    });

    // 2. Unattested costs
    const unattested: ActionItem[] = [];
    active.forEach(p => {
      const s = signalsMap.get(p.id);
      if (s && s.supplierInvoice.unattestedCount > 0 && s.supplierInvoice.importedCount === 0) {
        unattested.push({
          projectName: p.name,
          detail: `${s.supplierInvoice.unattestedCount} inväntar attest`,
          navigateTo: p.navigateTo,
          projectId: p.id,
          badge: `${s.supplierInvoice.unattestedCount}`,
        });
      }
    });

    // 3. Unapproved time reports
    const unapprovedTime: ActionItem[] = [];
    active.forEach(p => {
      const pending = p.timeReports.flatMap(r => r.detailed_reports || []).filter(r => !r.approved);
      if (pending.length > 0) {
        unapprovedTime.push({
          projectName: p.name,
          detail: `${pending.length} tidrapporter väntar`,
          navigateTo: p.navigateTo,
          projectId: p.id,
          badge: `${pending.length}`,
        });
      }
    });

    // 4. Margin warnings
    const marginWarnings: ActionItem[] = [];
    active.forEach(p => {
      const s = signalsMap.get(p.id);
      if (s && (s.margin.level === 'warning' || s.margin.level === 'danger')) {
        marginWarnings.push({
          projectName: p.name,
          detail: `Marginal: ${s.margin.marginPercent.toFixed(0)}%`,
          amount: s.margin.marginAmount,
          navigateTo: p.navigateTo,
          projectId: p.id,
        });
      }
    });

    // 5. Long-open projects (>90 days since booking created)
    const longOpen: ActionItem[] = [];
    active.forEach(p => {
      if (!p.bookingCreatedAt) return;
      const days = differenceInDays(new Date(), parseISO(p.bookingCreatedAt));
      if (days > 90) {
        longOpen.push({
          projectName: p.name,
          detail: `Öppet i ${days} dagar`,
          navigateTo: p.navigateTo,
          projectId: p.id,
        });
      }
    });

    // 6. Ready to close (no blockers)
    const readyToClose: ActionItem[] = [];
    active.forEach(p => {
      const s = signalsMap.get(p.id);
      if (s && s.closure.canClose && s.handover.billingStatus === null) {
        readyToClose.push({
          projectName: p.name,
          detail: 'Alla krav uppfyllda',
          amount: s.revenue,
          navigateTo: p.navigateTo,
          projectId: p.id,
        });
      }
    });

    // 7. Blocked from closure
    const blocked: ActionItem[] = [];
    active.forEach(p => {
      const s = signalsMap.get(p.id);
      if (s && !s.closure.canClose && s.blockers.length > 0) {
        blocked.push({
          projectName: p.name,
          detail: s.blockers.map(b => b.detail || b.label).join(', '),
          navigateTo: p.navigateTo,
          projectId: p.id,
          badge: `${s.blockers.length}`,
        });
      }
    });

    // 8. Handed over to booking
    const handedOver: ActionItem[] = grouped.handed_over_to_booking.map(b => ({
      projectName: b.project_name,
      detail: b.client_name || 'Överlämnad',
      amount: b.invoiceable_amount,
      navigateTo: `/project/${b.project_id}`,
      projectId: b.project_id,
    }));

    return [
      {
        id: 'new-invoices',
        title: 'Nya leverantörsfakturor',
        icon: <FileText className="h-4 w-4" />,
        colorClass: 'text-sky-600',
        items: newInvoices,
        emptyText: 'Inga nya fakturor',
      },
      {
        id: 'unattested',
        title: 'Oattesterade kostnader',
        icon: <AlertTriangle className="h-4 w-4" />,
        colorClass: 'text-amber-600',
        items: unattested,
        emptyText: 'Allt attesterat',
      },
      {
        id: 'unapproved-time',
        title: 'Ej godkända tider',
        icon: <Clock className="h-4 w-4" />,
        colorClass: 'text-orange-600',
        items: unapprovedTime,
        emptyText: 'Alla tider godkända',
      },
      {
        id: 'margin-warning',
        title: 'Marginalvarning',
        icon: <TrendingDown className="h-4 w-4" />,
        colorClass: 'text-red-600',
        items: marginWarnings,
        emptyText: 'Inga marginalvarningar',
      },
      {
        id: 'long-open',
        title: 'Öppna länge (>90 dagar)',
        icon: <CalendarClock className="h-4 w-4" />,
        colorClass: 'text-violet-600',
        items: longOpen,
        emptyText: 'Inga gamla projekt',
      },
      {
        id: 'ready-to-close',
        title: 'Redo att stänga',
        icon: <CheckCircle2 className="h-4 w-4" />,
        colorClass: 'text-green-600',
        items: readyToClose,
        emptyText: 'Inga projekt klara just nu',
      },
      {
        id: 'blocked',
        title: 'Blockerade från stängning',
        icon: <Lock className="h-4 w-4" />,
        colorClass: 'text-red-600',
        items: blocked,
        emptyText: 'Inga blockerade projekt',
      },
      {
        id: 'handed-over',
        title: 'Överlämnade till ekonomi',
        icon: <ArrowRight className="h-4 w-4" />,
        colorClass: 'text-purple-600',
        items: handedOver,
        emptyText: 'Inga överlämnade',
      },
    ];
  }, [active, signalsMap, grouped]);

  // Sections with items first, then empty ones
  const nonEmpty = sections.filter(s => s.items.length > 0);
  const empty = sections.filter(s => s.items.length === 0);
  const totalActions = nonEmpty.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <div className="space-y-4">
      {/* Summary counters */}
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
        {/* Quick counts for non-empty sections */}
        {nonEmpty.map(s => (
          <span key={s.id} className={cn('flex items-center gap-1 text-[10px] font-medium', s.colorClass)}>
            {s.icon}
            {s.items.length}
          </span>
        ))}
      </div>

      {/* Action cards — non-empty sections get full cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
        {nonEmpty.map(section => (
          <Card key={section.id} className="border-border/40 hover:border-border/60 transition-colors">
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

              <div className="space-y-1 max-h-[220px] overflow-y-auto">
                {section.items.slice(0, 6).map((item, i) => (
                  <button
                    key={i}
                    onClick={() => navigate(item.navigateTo)}
                    className="w-full flex items-center gap-2 py-2 px-2.5 rounded-md hover:bg-muted/40 text-left text-xs transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
                        {item.projectName}
                      </p>
                      <p className="text-muted-foreground truncate text-[10px]">{item.detail}</p>
                    </div>
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
                    <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0 group-hover:text-primary transition-colors" />
                  </button>
                ))}
                {section.items.length > 6 && (
                  <p className="text-[10px] text-muted-foreground/50 text-center py-1">
                    +{section.items.length - 6} till
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty sections — compact row */}
      {empty.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap px-1">
          {empty.map(s => (
            <span key={s.id} className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
              <CheckCircle2 className="h-3 w-3 text-green-500/50" />
              {s.title}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectLeaderActionBoard;
