import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertTriangle,
  Check,
  ArrowLeft,
  Save,
  FileText,
  User,
  Calendar,
  Clock,
  Package,
  Truck,
  PlusCircle,
  Building2,
  ClipboardCheck,
  History,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import BillingStatusBadge from './BillingStatusBadge';
import { useBillingInvoiceData } from '@/hooks/useBillingInvoiceData';
import { useCreateFortnoxInvoice } from '@/hooks/useFortnoxInvoice';
import { useUpdateProjectBilling } from '@/hooks/useProjectBilling';
import type {
  ProjectBilling,
  BillingStatus,
  ReviewChecklist,
} from '@/hooks/useProjectBilling';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);

const formatDate = (d: string | null | undefined) => {
  if (!d) return '—';
  try { return format(new Date(d), 'd MMM yyyy', { locale: sv }); } catch { return '—'; }
};

const formatDateTime = (d: string | null | undefined) => {
  if (!d) return null;
  try { return format(new Date(d), 'd MMM yyyy HH:mm', { locale: sv }); } catch { return null; }
};

const CHECKLIST_ITEMS: { key: keyof ReviewChecklist; label: string }[] = [
  { key: 'hours_registered', label: 'Alla timmar registrerade' },
  { key: 'materials_included', label: 'Alla artiklar/material inkluderade' },
  { key: 'transport_included', label: 'Alla transporter inkluderade' },
  { key: 'additions_registered', label: 'Alla tillägg registrerade' },
  { key: 'client_info_correct', label: 'Kunduppgifter kompletta' },
  { key: 'deviation_checked', label: 'Avvikelse mot offert kontrollerad' },
  { key: 'invoice_info_complete', label: 'Fakturauppgifter kompletta' },
  { key: 'internal_note_added', label: 'Intern notering tillagd vid behov' },
  { key: 'ready_for_invoicing', label: 'Projekt klart för fakturering' },
];

interface Props {
  billing: ProjectBilling | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<ProjectBilling>) => void;
  onAdvanceStatus: (id: string, newStatus: BillingStatus) => void;
}

const BillingReviewDialog: React.FC<Props> = ({ billing, open, onClose, onSave, onAdvanceStatus }) => {
  const [checklist, setChecklist] = useState<ReviewChecklist>(billing?.review_checklist ?? {});
  const [notes, setNotes] = useState(billing?.internal_notes ?? '');
  const invoiceData = useBillingInvoiceData(open ? billing : null);
  const fortnoxInvoice = useCreateFortnoxInvoice();
  const updateBilling = useUpdateProjectBilling();

  React.useEffect(() => {
    if (billing) {
      setChecklist(billing.review_checklist ?? {});
      setNotes(billing.internal_notes ?? '');
    }
  }, [billing?.id]);

  if (!billing) {
    return (
      <Dialog open={false} onOpenChange={() => {}}>
        <DialogContent className="hidden"><DialogHeader><DialogTitle /></DialogHeader></DialogContent>
      </Dialog>
    );
  }

  const completedChecks = CHECKLIST_ITEMS.filter(c => checklist[c.key]).length;
  const allChecked = completedChecks === CHECKLIST_ITEMS.length;

  const warnings = useMemo(() => {
    const w: { text: string; severity: 'warning' | 'error' }[] = [];
    if (!billing.client_name) w.push({ text: 'Kunduppgifter saknas', severity: 'error' });
    if (billing.invoiceable_amount <= 0) w.push({ text: 'Fakturerbart belopp är 0', severity: 'error' });
    if (!billing.closed_at) w.push({ text: 'Stängningsdatum saknas', severity: 'warning' });
    if (billing.quoted_amount > 0) {
      const dev = Math.abs(billing.invoiceable_amount - billing.quoted_amount) / billing.quoted_amount;
      if (dev > 0.1) w.push({ text: `Belopp avviker ${(dev * 100).toFixed(0)}% från offert`, severity: 'warning' });
    }
    if (billing.total_cost <= 0) w.push({ text: 'Inga kostnader registrerade', severity: 'warning' });
    if (invoiceData.totalHours === 0 && !invoiceData.isLoading) w.push({ text: 'Inga timmar registrerade', severity: 'warning' });
    if (invoiceData.materials.length === 0 && !invoiceData.isLoading) w.push({ text: 'Inga artiklar registrerade', severity: 'warning' });
    if (completedChecks < CHECKLIST_ITEMS.length) w.push({ text: 'Kontrollpunkter ej slutförda', severity: 'warning' });
    return w;
  }, [billing, invoiceData, completedChecks]);

  const margin = billing.invoiceable_amount > 0
    ? ((billing.invoiceable_amount - billing.total_cost) / billing.invoiceable_amount * 100)
    : 0;

  const deviation = billing.quoted_amount > 0
    ? billing.invoiceable_amount - billing.quoted_amount
    : null;
  const deviationPct = billing.quoted_amount > 0
    ? ((billing.invoiceable_amount - billing.quoted_amount) / billing.quoted_amount * 100)
    : null;

  const handleSaveDraft = () => {
    onSave(billing.id, {
      review_checklist: checklist as any,
      internal_notes: notes,
      review_status: 'in_review',
    });
  };

  const handleNeedsCompletion = () => {
    onSave(billing.id, {
      review_checklist: checklist as any,
      internal_notes: notes,
      review_status: 'needs_completion',
      billing_status: 'draft',
    });
  };

  const handleCreateFortnoxInvoice = () => {
    // Build Fortnox payload from billing data
    const today = new Date().toISOString().split('T')[0];
    const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    const payload = {
      CustomerNumber: '',
      InvoiceDate: today,
      DueDate: dueDate,
      InvoiceRows: invoiceData.materials
        .filter(m => !m.is_package_component)
        .map(m => ({
          Description: m.name,
          Quantity: m.quantity,
          Price: m.unit_price,
          VAT: m.vat_rate ?? 25,
        })),
    };

    fortnoxInvoice.mutate(
      {
        payload,
        clientData: billing.client_name ? { name: billing.client_name } : undefined,
      },
      {
        onSuccess: (data) => {
          updateBilling.mutate({
            id: billing.id,
            billing_status: 'invoiced',
            external_invoice_id: data.fortnoxInvoiceId || null,
            invoice_number: data.invoiceNumber || null,
            invoice_date: today,
            invoiced_amount: billing.invoiceable_amount,
          } as any);
          onClose();
        },
      }
    );
  };

  const canApprove = billing.billing_status === 'draft';
  const canCreateFortnoxInvoice = billing.billing_status === 'ready';

  const errorCount = warnings.filter(w => w.severity === 'error').length;
  const warningCount = warnings.filter(w => w.severity === 'warning').length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        {/* ─── HEADER ─── */}
        <div className="px-6 pt-6 pb-4 border-b border-border/40 space-y-4">
          <DialogHeader className="space-y-0">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-lg font-semibold text-foreground">
                  {billing.project_name}
                </DialogTitle>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  {billing.client_name && (
                    <span className="text-sm text-muted-foreground">{billing.client_name}</span>
                  )}
                  <span className="text-xs text-muted-foreground/60 font-mono">
                    {billing.project_id.slice(0, 8)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <BillingStatusBadge status={billing.billing_status} />
                {errorCount > 0 && (
                  <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20">
                    {errorCount} fel
                  </Badge>
                )}
                {warningCount > 0 && errorCount === 0 && (
                  <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                    {warningCount} varningar
                  </Badge>
                )}
                {warnings.length === 0 && (
                  <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800">
                    Komplett
                  </Badge>
                )}
              </div>
            </div>
          </DialogHeader>

          {/* Quick info row */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1.5">
              <User className="h-3 w-3" /> {billing.project_leader || '—'}
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3" /> Stängd {formatDate(billing.closed_at)}
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3" /> Event {formatDate(billing.event_date)}
            </span>
            <span className="flex items-center gap-1.5 font-semibold text-foreground text-sm ml-auto">
              {formatCurrency(billing.invoiceable_amount)}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSaveDraft}>
              <Save className="h-3.5 w-3.5" /> Spara
            </Button>
            {canApprove && (
              <>
                <Button variant="outline" size="sm" className="gap-1.5 text-amber-600 border-amber-200 hover:bg-amber-50 dark:border-amber-800 dark:hover:bg-amber-950/30" onClick={handleNeedsCompletion}>
                  <ArrowLeft className="h-3.5 w-3.5" /> Komplettering
                </Button>
                <Button size="sm" className="gap-1.5" disabled={!allChecked} onClick={() => { handleSaveDraft(); onAdvanceStatus(billing.id, 'ready'); }}>
                  <Check className="h-3.5 w-3.5" /> Godkänn
                </Button>
              </>
            )}
            {canCreateFortnoxInvoice && (
              <Button
                size="sm"
                className="gap-1.5"
                onClick={handleCreateFortnoxInvoice}
                disabled={fortnoxInvoice.isPending}
              >
                <FileText className="h-3.5 w-3.5" />
                {fortnoxInvoice.isPending ? 'Skapar faktura…' : 'Skapa faktura i Fortnox'}
              </Button>
            )}
          </div>
        </div>

        {/* ─── TABS ─── */}
        <Tabs defaultValue="summary" className="flex-1 overflow-hidden flex flex-col">
          <div className="px-6 border-b border-border/40">
            <TabsList className="bg-transparent h-auto p-0 gap-0">
              <TabsTrigger value="summary" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2.5 text-xs font-medium">
                Sammanfattning
              </TabsTrigger>
              <TabsTrigger value="basis" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2.5 text-xs font-medium">
                Fakturaunderlag
              </TabsTrigger>
              <TabsTrigger value="customer" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2.5 text-xs font-medium">
                Kund & Faktura
              </TabsTrigger>
              <TabsTrigger value="review" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2.5 text-xs font-medium relative">
                Granskning
                {completedChecks < CHECKLIST_ITEMS.length && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-100 text-amber-700 text-[9px] font-bold dark:bg-amber-900/40 dark:text-amber-400">
                    {CHECKLIST_ITEMS.length - completedChecks}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* ═══ TAB 1: SAMMANFATTNING ═══ */}
            <TabsContent value="summary" className="p-6 space-y-6 mt-0">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <SummaryCard label="Offertvärde" value={formatCurrency(billing.quoted_amount)} />
                <SummaryCard label="Fakturerbart" value={formatCurrency(billing.invoiceable_amount)} primary />
                <SummaryCard label="Total kostnad" value={formatCurrency(billing.total_cost)} />
                <SummaryCard
                  label="Marginal"
                  value={`${formatCurrency(billing.invoiceable_amount - billing.total_cost)} (${margin.toFixed(0)}%)`}
                  variant={margin >= 20 ? 'positive' : margin >= 0 ? 'neutral' : 'negative'}
                />
              </div>

              <Card className="border-border/40">
                <CardContent className="p-4 space-y-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ekonomisk sammanfattning</h3>
                  <div className="space-y-2">
                    <FinRow label="Offertvärde" value={billing.quoted_amount} />
                    <FinRow label="Fakturerbart värde" value={billing.invoiceable_amount} bold />
                    <FinRow label="Registrerade timmar" value={invoiceData.totalTimeCost} sub={`${invoiceData.totalHours}h`} />
                    <FinRow label="Material/produkter" value={invoiceData.totalMaterialRevenue} />
                    <FinRow label="Rabatter/avdrag" value={-invoiceData.totalMaterialDiscount} negative={invoiceData.totalMaterialDiscount > 0} />
                    <FinRow label="Inköp/transport" value={invoiceData.totalPurchases} />
                    {billing.invoiced_amount > 0 && <FinRow label="Redan fakturerat" value={billing.invoiced_amount} muted />}
                    <Separator />
                    <FinRow label="Slutligt fakturabelopp" value={billing.invoiceable_amount} bold />
                  </div>
                </CardContent>
              </Card>

              {deviation !== null && (
                <Card className={cn(
                  'border-border/40',
                  Math.abs(deviationPct ?? 0) > 10 && 'border-amber-200/60 dark:border-amber-800/40'
                )}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      {Math.abs(deviationPct ?? 0) > 10 && (
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                      )}
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Avvikelse mot offert</p>
                        <p className={cn(
                          'text-sm font-semibold',
                          Math.abs(deviationPct ?? 0) > 10 ? 'text-amber-600' : 'text-foreground'
                        )}>
                          {deviation > 0 ? '+' : ''}{formatCurrency(deviation)} ({deviationPct! > 0 ? '+' : ''}{deviationPct!.toFixed(1)}%)
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {warnings.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avvikelser & Varningar</h3>
                  <div className="space-y-1.5">
                    {warnings.map((w) => (
                      <div key={w.text} className={cn(
                        'flex items-center gap-2 text-xs rounded-md px-3 py-2 border',
                        w.severity === 'error'
                          ? 'text-destructive bg-destructive/5 border-destructive/20'
                          : 'text-amber-600 bg-amber-50 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-800/40'
                      )}>
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        {w.text}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <HistoryTimeline billing={billing} />
            </TabsContent>

            {/* ═══ TAB 2: FAKTURAUNDERLAG ═══ */}
            <TabsContent value="basis" className="p-6 space-y-6 mt-0">
              {invoiceData.isLoading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Laddar underlag…</p>
              ) : (
                <>
                  <InvoiceBlock
                    icon={<Clock className="h-4 w-4" />}
                    title="Timmar"
                    count={invoiceData.timeEntries.length}
                    total={invoiceData.totalTimeCost}
                    subtitle={`${invoiceData.totalHours}h totalt`}
                    empty={invoiceData.timeEntries.length === 0}
                    emptyText="Inga timmar registrerade"
                  >
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground border-b border-border/40">
                          <th className="text-left py-2 font-medium">Personal</th>
                          <th className="text-left py-2 font-medium">Datum</th>
                          <th className="text-right py-2 font-medium">Timmar</th>
                          <th className="text-right py-2 font-medium">à-pris</th>
                          <th className="text-right py-2 font-medium">Summa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoiceData.timeEntries.map(t => (
                          <tr key={t.id} className="border-b border-border/20">
                            <td className="py-2 text-foreground">{t.staff_name}</td>
                            <td className="py-2 text-muted-foreground">{formatDate(t.work_date)}</td>
                            <td className="py-2 text-right text-foreground">{t.hours}h</td>
                            <td className="py-2 text-right text-muted-foreground">{formatCurrency(t.hourly_rate)}</td>
                            <td className="py-2 text-right font-medium text-foreground">{formatCurrency(t.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </InvoiceBlock>

                  <InvoiceBlock
                    icon={<Package className="h-4 w-4" />}
                    title="Material / Artiklar"
                    count={invoiceData.materials.filter(m => !m.is_package_component).length}
                    total={invoiceData.totalMaterialRevenue}
                    empty={invoiceData.materials.length === 0}
                    emptyText="Inga artiklar registrerade"
                  >
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground border-b border-border/40">
                          <th className="text-left py-2 font-medium">Artikel</th>
                          <th className="text-right py-2 font-medium">Antal</th>
                          <th className="text-right py-2 font-medium">à-pris</th>
                          <th className="text-right py-2 font-medium">Rabatt</th>
                          <th className="text-right py-2 font-medium">Summa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoiceData.materials.filter(m => !m.is_package_component).map(m => (
                          <tr key={m.id} className={cn(
                            'border-b border-border/20',
                            (m.unit_price === 0 && m.total_price === 0) && 'bg-amber-50/50 dark:bg-amber-950/10'
                          )}>
                            <td className="py-2 text-foreground">{m.name}</td>
                            <td className="py-2 text-right text-foreground">{m.quantity}</td>
                            <td className="py-2 text-right text-muted-foreground">{formatCurrency(m.unit_price)}</td>
                            <td className="py-2 text-right text-muted-foreground">{m.discount > 0 ? formatCurrency(m.discount) : '—'}</td>
                            <td className="py-2 text-right font-medium text-foreground">{formatCurrency(m.total_price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </InvoiceBlock>

                  <InvoiceBlock
                    icon={<Truck className="h-4 w-4" />}
                    title="Inköp & Transport"
                    count={invoiceData.purchases.length}
                    total={invoiceData.totalPurchases}
                    empty={invoiceData.purchases.length === 0}
                    emptyText="Inga inköp registrerade"
                  >
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground border-b border-border/40">
                          <th className="text-left py-2 font-medium">Beskrivning</th>
                          <th className="text-left py-2 font-medium">Leverantör</th>
                          <th className="text-left py-2 font-medium">Datum</th>
                          <th className="text-right py-2 font-medium">Belopp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoiceData.purchases.map(p => (
                          <tr key={p.id} className="border-b border-border/20">
                            <td className="py-2 text-foreground">{p.description}</td>
                            <td className="py-2 text-muted-foreground">{p.supplier || '—'}</td>
                            <td className="py-2 text-muted-foreground">{formatDate(p.purchase_date)}</td>
                            <td className="py-2 text-right font-medium text-foreground">{formatCurrency(p.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </InvoiceBlock>

                  <InvoiceBlock
                    icon={<PlusCircle className="h-4 w-4" />}
                    title="Tillägg / Ändringar"
                    count={0}
                    total={0}
                    empty
                    emptyText="Inga tillägg registrerade"
                  >
                    <div />
                  </InvoiceBlock>

                  <InvoiceBlock
                    icon={<Building2 className="h-4 w-4" />}
                    title="Underleverantörer / Externa kostnader"
                    count={0}
                    total={0}
                    empty
                    emptyText="Inga externa kostnader registrerade"
                  >
                    <div />
                  </InvoiceBlock>
                </>
              )}
            </TabsContent>

            {/* ═══ TAB 3: KUND & FAKTURA ═══ */}
            <TabsContent value="customer" className="p-6 space-y-6 mt-0">
              <Card className="border-border/40">
                <CardContent className="p-4 space-y-4">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Kunduppgifter</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <CustomerField label="Kundnamn" value={billing.client_name} required />
                    <CustomerField label="Organisationsnummer" value={null} />
                    <CustomerField label="Fakturaadress" value={null} />
                    <CustomerField label="E-post för faktura" value={null} />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/40">
                <CardContent className="p-4 space-y-4">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fakturainformation</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <CustomerField label="Referens / Märkning" value={billing.invoice_reference} />
                    <CustomerField label="Fakturanummer" value={billing.invoice_number} />
                    <CustomerField label="Betalvillkor" value={null} placeholder="30 dagar netto" />
                    <CustomerField label="Momsinställning" value="25%" />
                    <CustomerField label="PO-nummer" value={null} />
                    <CustomerField label="Extern faktura-ID" value={billing.external_invoice_id} />
                  </div>
                </CardContent>
              </Card>

              {!billing.client_name && (
                <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded-md px-3 py-2 border border-amber-200/60 dark:border-amber-800/40">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Kunduppgifter saknas — kontrollera innan fakturering
                </div>
              )}
            </TabsContent>

            {/* ═══ TAB 4: GRANSKNING ═══ */}
            <TabsContent value="review" className="p-6 space-y-6 mt-0">
              <Card className="border-border/40">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <ClipboardCheck className="h-3.5 w-3.5" />
                      Kontrollista för fakturagranskning
                    </h3>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                      {completedChecks}/{CHECKLIST_ITEMS.length}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {CHECKLIST_ITEMS.map((item) => (
                      <label key={item.key} className="flex items-center gap-3 py-2 px-2.5 rounded-md hover:bg-muted/30 transition-colors cursor-pointer">
                        <Checkbox
                          checked={!!checklist[item.key]}
                          onCheckedChange={(checked) =>
                            setChecklist(prev => ({ ...prev, [item.key]: !!checked }))
                          }
                        />
                        <span className={cn(
                          'text-sm',
                          checklist[item.key] ? 'text-muted-foreground line-through' : 'text-foreground'
                        )}>
                          {item.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/40">
                <CardContent className="p-4 space-y-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Interna anteckningar</h3>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="T.ex. &quot;fakturera enligt justerad offert&quot;, &quot;inväntar sista transportkostnad&quot;…"
                    className="min-h-[100px] text-sm resize-none"
                  />
                  {billing.internal_notes && billing.internal_notes !== notes && (
                    <div className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                      <Info className="h-3 w-3" />
                      Sparad notering: "{billing.internal_notes}"
                    </div>
                  )}
                </CardContent>
              </Card>

              {warnings.length > 0 && (
                <Card className="border-border/40">
                  <CardContent className="p-4 space-y-3">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avvikelser & Varningar</h3>
                    <div className="space-y-1.5">
                      {warnings.map((w) => (
                        <div key={w.text} className={cn(
                          'flex items-center gap-2 text-xs rounded-md px-3 py-2 border',
                          w.severity === 'error'
                            ? 'text-destructive bg-destructive/5 border-destructive/20'
                            : 'text-amber-600 bg-amber-50 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-800/40'
                        )}>
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          {w.text}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

/* ─── SUBCOMPONENTS ─── */

const SummaryCard: React.FC<{
  label: string;
  value: string;
  primary?: boolean;
  variant?: 'positive' | 'negative' | 'neutral';
}> = ({ label, value, primary, variant }) => (
  <Card className={cn(
    'border-border/40',
    primary && 'ring-1 ring-primary/20 border-primary/30'
  )}>
    <CardContent className="p-3.5">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={cn(
        'text-lg font-bold mt-1',
        variant === 'positive' && 'text-green-600',
        variant === 'negative' && 'text-destructive',
        variant === 'neutral' && 'text-foreground',
        primary && 'text-primary',
        !primary && !variant && 'text-foreground',
      )}>
        {value}
      </p>
    </CardContent>
  </Card>
);

const FinRow: React.FC<{
  label: string;
  value: number;
  bold?: boolean;
  negative?: boolean;
  muted?: boolean;
  sub?: string;
}> = ({ label, value, bold, negative, muted: isMuted, sub }) => (
  <div className="flex items-center justify-between">
    <span className={cn('text-sm', isMuted ? 'text-muted-foreground' : 'text-foreground')}>
      {label}
      {sub && <span className="text-xs text-muted-foreground ml-2">({sub})</span>}
    </span>
    <span className={cn(
      'text-sm',
      bold && 'font-semibold',
      negative && 'text-destructive',
      isMuted && 'text-muted-foreground',
    )}>
      {formatCurrency(value)}
    </span>
  </div>
);

const InvoiceBlock: React.FC<{
  icon: React.ReactNode;
  title: string;
  count: number;
  total: number;
  subtitle?: string;
  empty?: boolean;
  emptyText: string;
  children: React.ReactNode;
}> = ({ icon, title, count, total, subtitle, empty, emptyText, children }) => (
  <Card className="border-border/40">
    <CardContent className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{count}</Badge>
        </div>
        <div className="text-right">
          <span className="text-sm font-semibold text-foreground">{formatCurrency(total)}</span>
          {subtitle && <span className="text-xs text-muted-foreground ml-2">{subtitle}</span>}
        </div>
      </div>
      {empty ? (
        <div className="flex items-center justify-center py-6 text-xs text-muted-foreground/60">
          <Info className="h-3.5 w-3.5 mr-1.5" />
          {emptyText}
        </div>
      ) : (
        <div className="overflow-x-auto">{children}</div>
      )}
    </CardContent>
  </Card>
);

const CustomerField: React.FC<{
  label: string;
  value: string | null;
  required?: boolean;
  placeholder?: string;
}> = ({ label, value, required, placeholder }) => (
  <div className="space-y-1">
    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
      {label}
      {required && !value && <span className="text-destructive ml-1">*</span>}
    </p>
    <p className={cn(
      'text-sm',
      value ? 'text-foreground' : 'text-muted-foreground/50 italic'
    )}>
      {value || placeholder || 'Ej angivet'}
    </p>
  </div>
);

const HistoryTimeline: React.FC<{ billing: ProjectBilling }> = ({ billing }) => {
  const events = [
    { label: 'Projekt stängt', date: billing.closed_at, icon: <Calendar className="h-3 w-3" /> },
    { label: 'Granskning slutförd', date: billing.review_completed_at, icon: <ClipboardCheck className="h-3 w-3" /> },
    { label: 'Godkänd för fakturering', date: billing.approved_for_invoicing_at, icon: <Check className="h-3 w-3" /> },
  ];

  const hasAny = events.some(e => e.date);
  if (!hasAny) return null;

  return (
    <Card className="border-border/40">
      <CardContent className="p-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <History className="h-3.5 w-3.5" />
          Historik
        </h3>
        <div className="space-y-0">
          {events.map((ev, i) => {
            const dateStr = formatDateTime(ev.date);
            const isCompleted = !!dateStr;
            return (
              <div key={ev.label} className="flex items-start gap-3 relative">
                {i < events.length - 1 && (
                  <div className={cn(
                    'absolute left-[9px] top-5 w-px h-full',
                    isCompleted ? 'bg-primary/30' : 'bg-border/40'
                  )} />
                )}
                <div className={cn(
                  'w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0 mt-0.5',
                  isCompleted ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground/40'
                )}>
                  {ev.icon}
                </div>
                <div className="pb-4 min-w-0">
                  <p className={cn(
                    'text-xs font-medium',
                    isCompleted ? 'text-foreground' : 'text-muted-foreground/50'
                  )}>
                    {ev.label}
                  </p>
                  {dateStr && (
                    <p className="text-[10px] text-muted-foreground">{dateStr}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {billing.external_invoice_id && (
          <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/40">
            Extern faktura-ID: <span className="font-mono">{billing.external_invoice_id}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BillingReviewDialog;
