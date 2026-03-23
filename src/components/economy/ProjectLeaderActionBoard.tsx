import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  TrendingDown,
  Lock,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EconomyProjectInsight } from '@/types/economyOverview';
import { useAllAttestations, getAttestationCounts } from '@/hooks/useSupplierInvoiceAttestation';
import { useProjectBillingList, groupByBillingStatus } from '@/hooks/useProjectBilling';

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

  const attestCounts = useMemo(() => getAttestationCounts(allAttestations), [allAttestations]);

  // Group attestations by booking_id
  const attestByBooking = useMemo(() => {
    const map: Record<string, typeof allAttestations> = {};
    allAttestations.forEach(a => {
      if (!map[a.booking_id]) map[a.booking_id] = [];
      map[a.booking_id].push(a);
    });
    return map;
  }, [allAttestations]);

  const sections: ActionSection[] = useMemo(() => {
    // 1. New supplier invoices
    const newInvoiceProjects: ActionItem[] = [];
    Object.entries(attestByBooking).forEach(([bookingId, items]) => {
      const imported = items.filter(i => i.status === 'imported');
      if (imported.length > 0) {
        const project = projectInsights.find(p => p.booking_id === bookingId);
        newInvoiceProjects.push({
          projectName: project?.name || bookingId,
          clientName: project?.client || '—',
          actionCount: imported.length,
          amount: 0,
          bookingId,
        });
      }
    });

    // 2. Unattested costs
    const unattestedProjects: ActionItem[] = [];
    Object.entries(attestByBooking).forEach(([bookingId, items]) => {
      const linked = items.filter(i => i.status === 'linked');
      if (linked.length > 0) {
        const project = projectInsights.find(p => p.booking_id === bookingId);
        unattestedProjects.push({
          projectName: project?.name || bookingId,
          clientName: project?.client || '—',
          actionCount: linked.length,
          amount: 0,
          bookingId,
        });
      }
    });

    // 3. Margin warnings
    const marginWarnings: ActionItem[] = projectInsights
      .filter(p => p.marginPercent !== null && p.marginPercent < 10 && p.economyStatus !== 'economy-closed')
      .map(p => ({
        projectName: p.name,
        clientName: p.client || '—',
        actionCount: 1,
        amount: p.expectedRevenue - p.actualCost,
        projectId: p.id,
      }));

    // 4. Ready to close
    const readyToClose: ActionItem[] = grouped.draft
      .filter(b => {
        const bookingAttests = attestByBooking[b.booking_id || ''] || [];
        const unattested = bookingAttests.filter(a => a.status !== 'attested' && a.status !== 'sent_to_booking');
        return unattested.length === 0;
      })
      .map(b => ({
        projectName: b.project_name,
        clientName: b.client_name || '—',
        actionCount: 0,
        amount: b.invoiceable_amount,
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
  }, [projectInsights, attestByBooking, grouped]);

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
