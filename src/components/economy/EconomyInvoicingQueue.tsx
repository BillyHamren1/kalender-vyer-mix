import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Receipt, ChevronRight, ExternalLink, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import EconomyStatusBadge from './EconomyStatusBadge';
import type { EnrichedProject } from '@/hooks/useEconomyDashboard';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);

const formatDate = (d: string | null | undefined) => {
  if (!d) return '—';
  try { return format(new Date(d), 'd MMM yyyy', { locale: sv }); } catch { return '—'; }
};

const TYPE_BADGE_CLASSES: Record<string, string> = {
  small: 'bg-[hsl(var(--project-small))] text-[hsl(var(--project-small-foreground))] ring-1 ring-[hsl(var(--project-small-border))]',
  medium: 'bg-[hsl(var(--project-medium))] text-[hsl(var(--project-medium-foreground))] ring-1 ring-[hsl(var(--project-medium-border))]',
  large: 'bg-[hsl(var(--project-large))] text-[hsl(var(--project-large-foreground))] ring-1 ring-[hsl(var(--project-large-border))]',
};
const TYPE_LABELS: Record<string, string> = { small: 'Litet', medium: 'Medel', large: 'Stort' };

interface Props {
  readyForInvoicing: EnrichedProject[];
  partiallyInvoiced: EnrichedProject[];
  completedNotInvoiced: EnrichedProject[];
  onCloseProject?: (project: EnrichedProject) => void;
}

const InvoiceRow: React.FC<{ project: EnrichedProject; onClose?: () => void }> = ({ project, onClose }) => {
  const navigate = useNavigate();
  const link = project.projectSize === 'medium' ? `/economy/${project.id}` : project.navigateTo;
  const marginColor = project.projectedMarginPercent >= 20 ? 'text-green-600' : 
                       project.projectedMarginPercent >= 0 ? 'text-foreground' : 'text-destructive';

  return (
    <tr className="border-b border-border/30 hover:bg-muted/30 transition-colors group">
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("text-[9px] px-1 py-0 font-medium shrink-0", TYPE_BADGE_CLASSES[project.projectSize])}>
            {TYPE_LABELS[project.projectSize]}
          </Badge>
          <button onClick={() => navigate(link)} className="text-sm font-medium text-primary hover:underline truncate text-left">
            {project.name}
          </button>
        </div>
      </td>
      <td className="py-2.5 px-3 text-xs text-muted-foreground">{formatDate(project.eventdate)}</td>
      <td className="py-2.5 px-3 text-xs text-right font-medium">{formatCurrency(project.expectedRevenue)}</td>
      <td className="py-2.5 px-3 text-xs text-right text-green-600 font-medium">{formatCurrency(project.totalInvoiced)}</td>
      <td className="py-2.5 px-3 text-xs text-right font-bold text-primary">{formatCurrency(project.remainingToInvoice)}</td>
      <td className="py-2.5 px-3 text-xs text-right text-muted-foreground">{formatCurrency(project.totalCost)}</td>
      <td className={cn("py-2.5 px-3 text-xs text-right font-semibold", marginColor)}>
        {project.projectedMarginPercent.toFixed(0)}%
      </td>
      <td className="py-2.5 px-3">
        <EconomyStatusBadge status={project.economyStatus} />
      </td>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => navigate(link)}>
            <ExternalLink className="h-3 w-3 mr-1" />
            Öppna
          </Button>
          {onClose && !project.economyClosed && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-muted-foreground" onClick={onClose}>
              <Lock className="h-3 w-3 mr-1" />
              Stäng
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
};

const tabClass = "text-xs px-3 py-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md";

const EconomyInvoicingQueue: React.FC<Props> = ({ readyForInvoicing, partiallyInvoiced, completedNotInvoiced, onCloseProject }) => {
  const totalReady = readyForInvoicing.reduce((s, p) => s + p.remainingToInvoice, 0);

  const TableHeader = () => (
    <thead>
      <tr className="border-b bg-muted/20">
        <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Projekt</th>
        <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Datum</th>
        <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Förväntad</th>
        <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Fakturerat</th>
        <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Kvar</th>
        <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Kostnad</th>
        <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Marginal</th>
        <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
        <th className="py-2 px-3"></th>
      </tr>
    </thead>
  );

  const renderTable = (projects: EnrichedProject[]) => (
    projects.length === 0 ? (
      <p className="text-sm text-muted-foreground text-center py-8">Inga projekt i denna kategori</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <TableHeader />
          <tbody>
            {projects.map(p => (
              <InvoiceRow key={p.id} project={p} onClose={onCloseProject ? () => onCloseProject(p) : undefined} />
            ))}
          </tbody>
        </table>
      </div>
    )
  );

  return (
    <Card className="border-border/40">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Faktureringscenter</h2>
          </div>
          {totalReady > 0 && (
            <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
              {formatCurrency(totalReady)} redo att fakturera
            </Badge>
          )}
        </div>

        <Tabs defaultValue="ready" className="space-y-3">
          <TabsList className="h-auto p-1 bg-muted/40 gap-1">
            <TabsTrigger value="ready" className={tabClass}>
              Redo för fakturering ({readyForInvoicing.length})
            </TabsTrigger>
            <TabsTrigger value="partial" className={tabClass}>
              Delvis fakturerade ({partiallyInvoiced.length})
            </TabsTrigger>
            <TabsTrigger value="overdue" className={tabClass}>
              Försenade ({completedNotInvoiced.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ready">{renderTable(readyForInvoicing)}</TabsContent>
          <TabsContent value="partial">{renderTable(partiallyInvoiced)}</TabsContent>
          <TabsContent value="overdue">{renderTable(completedNotInvoiced)}</TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default EconomyInvoicingQueue;
