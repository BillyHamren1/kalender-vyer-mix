import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  TrendingDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EconomyProjectInsight } from '@/types/economyOverview';
import { useAllAttestations, getAttestationCounts } from '@/hooks/useSupplierInvoiceAttestation';
import { useProjectBillingList, groupByBillingStatus } from '@/hooks/useProjectBilling';
import {
  computeProjectEconomySignals,
  EMPTY_ATTEST_COUNTS,
  type AttestationCounts,
} from '@/lib/economy/projectEconomyStatus';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);

interface ActionItem {
  projectName: string;
  clientName: string;
  actionCount: number;
  amount: number;
  projectId?: string;
  bookingId?: string;
}

interface ActionSection {
  title: string;
  icon: React.ReactNode;
  iconBg: string;
  items: ActionItem[];
  emptyText: string;
}

interface ProjectLeaderActionBoardProps {
  projectInsights: EconomyProjectInsight[];
}

const ProjectLeaderActionBoard: React.FC<ProjectLeaderActionBoardProps> = ({ projectInsights }) => {
  const { data: allAttestations = [] } = useAllAttestations();
  const { data: billingItems = [] } = useProjectBillingList();
  const grouped = useMemo(() => groupByBillingStatus(billingItems), [billingItems]);

  // Group attestations by booking_id and compute counts per booking
  const attestByBooking = useMemo(() => {
    const map: Record<string, typeof allAttestations> = {};
    allAttestations.forEach(a => {
      if (!map[a.booking_id]) map[a.booking_id] = [];
      map[a.booking_id].push(a);
    });
    return map;
  }, [allAttestations]);

  // Compute signals per project using shared model
  const projectSignalsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeProjectEconomySignals>>();
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

  const sections: ActionSection[] = useMemo(() => {
    // 1. New supplier invoices (from shared signals)
    const newInvoiceProjects: ActionItem[] = [];
    projectInsights.forEach(p => {
      const signals = projectSignalsMap.get(p.id);
      if (signals && signals.supplierInvoice.importedCount > 0) {
        newInvoiceProjects.push({
          projectName: p.name,
          clientName: '—',
          actionCount: signals.supplierInvoice.importedCount,
          amount: 0,
          bookingId: p.booking_id || undefined,
          projectId: p.id,
        });
      }
    });

    // 2. Unattested costs
    const unattestedProjects: ActionItem[] = [];
    projectInsights.forEach(p => {
      const signals = projectSignalsMap.get(p.id);
      if (signals && signals.supplierInvoice.unattestedCount > 0 && signals.supplierInvoice.importedCount === 0) {
        unattestedProjects.push({
          projectName: p.name,
          clientName: '—',
          actionCount: signals.supplierInvoice.unattestedCount,
          amount: 0,
          bookingId: p.booking_id || undefined,
          projectId: p.id,
        });
      }
    });

    // 3. Margin warnings (from shared signals)
    const marginWarnings: ActionItem[] = projectInsights
      .filter(p => {
        const signals = projectSignalsMap.get(p.id);
        return signals && signals.margin.level === 'warning' || signals?.margin.level === 'danger';
      })
      .filter(p => p.economyStatus !== 'economy-closed')
      .map(p => ({
        projectName: p.name,
        clientName: '—',
        actionCount: 1,
        amount: projectSignalsMap.get(p.id)?.margin.marginAmount || 0,
        projectId: p.id,
      }));

    // 4. Ready to close (no blockers)
    const readyToClose: ActionItem[] = projectInsights
      .filter(p => {
        const signals = projectSignalsMap.get(p.id);
        return signals && signals.closure.canClose && signals.handover.billingStatus === 'draft';
      })
      .map(p => ({
        projectName: p.name,
        clientName: '—',
        actionCount: 0,
        amount: p.forecastRevenue,
        projectId: p.id,
      }));

    // 5. Handed over
    const handedOver: ActionItem[] = grouped.handed_over_to_booking.map(b => ({
      projectName: b.project_name,
      clientName: b.client_name || '—',
      actionCount: 0,
      amount: b.invoiceable_amount,
    }));

    return [
      {
        title: 'Nya leverantörsfakturor',
        icon: <FileText className="h-4 w-4 text-sky-600" />,
        iconBg: 'bg-sky-50 dark:bg-sky-950/30',
        items: newInvoiceProjects,
        emptyText: 'Inga nya leverantörsfakturor',
      },
      {
        title: 'Oattesterade kostnader',
        icon: <AlertTriangle className="h-4 w-4 text-amber-600" />,
        iconBg: 'bg-amber-50 dark:bg-amber-950/30',
        items: unattestedProjects,
        emptyText: 'Alla kostnader attesterade',
      },
      {
        title: 'Marginalvarning',
        icon: <TrendingDown className="h-4 w-4 text-red-600" />,
        iconBg: 'bg-red-50 dark:bg-red-950/30',
        items: marginWarnings,
        emptyText: 'Inga projekt med låg marginal',
      },
      {
        title: 'Redo för överlämning',
        icon: <CheckCircle2 className="h-4 w-4 text-green-600" />,
        iconBg: 'bg-green-50 dark:bg-green-950/30',
        items: readyToClose,
        emptyText: 'Inga projekt klara just nu',
      },
      {
        title: 'Överlämnade till Booking',
        icon: <ArrowRight className="h-4 w-4 text-purple-600" />,
        iconBg: 'bg-purple-50 dark:bg-purple-950/30',
        items: handedOver,
        emptyText: 'Inga överlämnade projekt',
      },
    ];
  }, [projectInsights, projectSignalsMap, grouped]);

  const totalActions = sections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">Åtgärder</h2>
        {totalActions > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
            {totalActions}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {sections.map((section) => (
          <Card key={section.title} className="border-border/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className={cn('p-1.5 rounded-lg', section.iconBg)}>
                  {section.icon}
                </div>
                <h3 className="text-xs font-semibold text-foreground">{section.title}</h3>
                {section.items.length > 0 && (
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5 ml-auto">
                    {section.items.length}
                  </Badge>
                )}
              </div>

              {section.items.length === 0 ? (
                <p className="text-xs text-muted-foreground/60 py-2">{section.emptyText}</p>
              ) : (
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                  {section.items.slice(0, 5).map((item, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-md hover:bg-muted/30 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground truncate">{item.projectName}</p>
                        <p className="text-muted-foreground truncate">{item.clientName}</p>
                      </div>
                      {item.actionCount > 0 && (
                        <Badge variant="outline" className="text-[9px] shrink-0">
                          {item.actionCount}
                        </Badge>
                      )}
                    </div>
                  ))}
                  {section.items.length > 5 && (
                    <p className="text-[10px] text-muted-foreground/60 text-center py-1">
                      +{section.items.length - 5} till
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ProjectLeaderActionBoard;
