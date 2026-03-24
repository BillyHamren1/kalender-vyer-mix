import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FileText, RefreshCw, ChevronDown, ChevronUp, Check, X, Send } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AttestStatusBadge, SyncStatusBadge } from '@/components/economy/AttestStatusBadge';
import type { AttestStatus } from '@/components/economy/AttestStatusBadge';
import {
  useSupplierInvoiceAttestations,
  useEnsureAttestRecords,
  useAttestInvoice,
  useRejectInvoice,
  useLinkAttestation,
  usePushAttestToBooking,
  getAttestationCounts,
  type SupplierInvoiceAttestation,
} from '@/hooks/useSupplierInvoiceAttestation';
import type { SupplierInvoice, LinkedCostType, ProjectPurchase } from '@/types/projectEconomy';

interface ProductCostItem {
  id: string;
  product_name?: string;
  name?: string;
  purchase_cost: number;
  quantity: number;
}

interface SupplierInvoicesCardProps {
  supplierInvoices: SupplierInvoice[];
  onRefresh?: () => Promise<any>;
  purchases?: ProjectPurchase[];
  productCosts?: { products?: ProductCostItem[] } | null;
  onLinkInvoice?: (data: { id: string; linked_cost_type: LinkedCostType; linked_cost_id: string | null; is_final_link?: boolean }) => void;
  bookingId?: string | null;
  /** Project revenue — used to show margin impact per invoice */
  projectRevenue?: number;
}

const fmt = (v: number) =>
  v == null ? '–' : v === 0 ? '0' : v.toLocaleString('sv-SE');

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);

const STATUS_ORDER: AttestStatus[] = ['imported', 'needs_review', 'linked', 'attested', 'sent_to_booking', 'rejected'];
const STATUS_LABELS: Record<string, string> = {
  imported: 'Nya / ej granskade',
  needs_review: 'Att granska',
  linked: 'Kopplade — ej attesterade',
  attested: 'Attesterade',
  sent_to_booking: 'Skickade till Booking',
  rejected: 'Avvisade',
};

export const SupplierInvoicesCard = ({
  supplierInvoices,
  onRefresh,
  purchases = [],
  productCosts,
  onLinkInvoice,
  bookingId,
  projectRevenue = 0,
}: SupplierInvoicesCardProps) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [attestComment, setAttestComment] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  const { data: attestations = [] } = useSupplierInvoiceAttestations(bookingId ?? null);
  const ensureRecords = useEnsureAttestRecords();
  const attestInvoice = useAttestInvoice();
  const rejectInvoice = useRejectInvoice();
  const linkAttest = useLinkAttestation();
  const pushToBooking = usePushAttestToBooking();

  // Ensure attest records exist when we have invoices
  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
      // After refreshing, ensure attest records
      if (bookingId && supplierInvoices.length > 0) {
        const ids = supplierInvoices.map(si => si.id);
        await ensureRecords.mutateAsync({ bookingId, supplierInvoiceIds: ids });
      }
      toast.success('Leverantörsfakturor uppdaterade');
    } catch {
      toast.error('Kunde inte uppdatera');
    } finally {
      setIsRefreshing(false);
    }
  }, [onRefresh, bookingId, supplierInvoices, ensureRecords]);

  // Build a map: supplier_invoice_id -> attestation
  const attestMap = useMemo(() => {
    const map: Record<string, SupplierInvoiceAttestation> = {};
    attestations.forEach(a => { map[a.supplier_invoice_id] = a; });
    return map;
  }, [attestations]);

  const counts = useMemo(() => getAttestationCounts(attestations), [attestations]);

  // Group invoices by attest status
  const groupedInvoices = useMemo(() => {
    const groups: Record<string, SupplierInvoice[]> = {};
    STATUS_ORDER.forEach(s => { groups[s] = []; });
    
    supplierInvoices.forEach(si => {
      const attest = attestMap[si.id];
      const status = attest?.status || 'imported';
      if (!groups[status]) groups[status] = [];
      groups[status].push(si);
    });
    
    return groups;
  }, [supplierInvoices, attestMap]);

  const total = supplierInvoices.reduce(
    (sum, si) => sum + (Number(si.invoice_data?.Total) || 0), 0
  );

  const products = productCosts?.products || [];

  const handleLinkChange = (invoiceId: string, value: string) => {
    if (!onLinkInvoice) return;
    if (value === '__none__') {
      onLinkInvoice({ id: invoiceId, linked_cost_type: null, linked_cost_id: null });
    } else {
      const [type, id] = value.split('::');
      onLinkInvoice({ id: invoiceId, linked_cost_type: type as LinkedCostType, linked_cost_id: id });
    }
    // Also update attest status to 'linked'
    const attest = attestMap[invoiceId];
    if (attest && (attest.status === 'imported' || attest.status === 'needs_review')) {
      linkAttest.mutate({ id: attest.id });
    }
  };

  const handleAttest = (si: SupplierInvoice) => {
    const attest = attestMap[si.id];
    if (!attest) return;
    attestInvoice.mutate({ id: attest.id, comment: attestComment || undefined });
    setAttestComment('');
    setExpandedId(null);
  };

  const handleReject = (si: SupplierInvoice) => {
    const attest = attestMap[si.id];
    if (!attest || !rejectReason.trim()) return;
    rejectInvoice.mutate({ id: attest.id, reason: rejectReason });
    setRejectReason('');
    setExpandedId(null);
  };

  const handlePushToBooking = (si: SupplierInvoice) => {
    const attest = attestMap[si.id];
    if (!attest) return;
    pushToBooking.mutate(attest);
  };

  if (supplierInvoices.length === 0) {
    return (
      <Card className="border-border/40">
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              Leverantörsfakturor
            </CardTitle>
            {onRefresh && (
              <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isRefreshing} className="h-8 w-8">
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-muted-foreground text-sm">
            Inga leverantörsfakturor hittades.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/40">
      <CardHeader className="py-3 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              Leverantörsfakturor
            </CardTitle>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
              {supplierInvoices.length}
            </Badge>
            {counts.unattested > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
                {counts.unattested} oattesterade
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-sm font-semibold text-foreground mr-2">{fmt(total)} kr</span>
            {onRefresh && (
              <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isRefreshing} className="h-8 w-8">
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-1 space-y-4">
        {STATUS_ORDER.map(status => {
          const invoices = groupedInvoices[status];
          if (!invoices || invoices.length === 0) return null;

          return (
            <div key={status}>
              <div className="flex items-center gap-2 mb-2">
                <AttestStatusBadge status={status} />
                <span className="text-xs text-muted-foreground">{STATUS_LABELS[status]}</span>
                <span className="text-[10px] text-muted-foreground/60 ml-auto">{invoices.length} st</span>
              </div>

              <div className="space-y-2">
                {invoices.map(si => {
                  const attest = attestMap[si.id];
                  const isExpanded = expandedId === si.id;
                  const invoiceAmount = Number(si.invoice_data?.Total) || 0;
                  const currentLinkValue = si.linked_cost_type && si.linked_cost_id
                    ? `${si.linked_cost_type}::${si.linked_cost_id}`
                    : '__none__';
                  const hasLinkingOptions = purchases.length > 0 || products.length > 0;

                  return (
                    <Card key={si.id} className={cn('border-border/30', isExpanded && 'ring-1 ring-primary/20')}>
                      <CardContent className="p-3">
                        <div
                          className="flex items-center gap-3 cursor-pointer"
                          onClick={() => setExpandedId(isExpanded ? null : si.id)}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground">
                                {si.invoice_data?.SupplierName || '—'}
                              </p>
                              <span className="text-xs text-muted-foreground font-mono">
                                #{si.invoice_data?.GivenNumber || si.given_number || '—'}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                              <span>{si.invoice_data?.InvoiceDate || '—'}</span>
                              {attest && attest.booking_sync_status !== 'pending' && (
                                <SyncStatusBadge status={attest.booking_sync_status} />
                              )}
                            </div>
                          </div>
                          <p className="text-sm font-semibold text-foreground whitespace-nowrap">
                            {fmt(invoiceAmount)} kr
                          </p>
                          {projectRevenue > 0 && (
                            <span className={cn(
                              'text-[10px] font-medium whitespace-nowrap',
                              (invoiceAmount / projectRevenue * 100) > 5 ? 'text-amber-600' : 'text-muted-foreground'
                            )}>
                              {(invoiceAmount / projectRevenue * 100).toFixed(1)}% av intäkt
                            </span>
                          )}
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                        </div>

                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-border/30 space-y-3">
                            {/* Linking */}
                            {hasLinkingOptions && onLinkInvoice && (
                              <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1 block">Koppling</label>
                                <Select value={currentLinkValue} onValueChange={(v) => handleLinkChange(si.id, v)}>
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Välj koppling..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">
                                      <span className="text-muted-foreground">Ingen koppling</span>
                                    </SelectItem>
                                    {purchases.length > 0 && (
                                      <SelectGroup>
                                        <SelectLabel>Inköp</SelectLabel>
                                        {purchases.map(p => (
                                          <SelectItem key={`purchase::${p.id}`} value={`purchase::${p.id}`}>
                                            {p.description} ({fmt(p.amount)} kr)
                                          </SelectItem>
                                        ))}
                                      </SelectGroup>
                                    )}
                                    {products.length > 0 && (
                                      <SelectGroup>
                                        <SelectLabel>Produkter (inköpskostnad)</SelectLabel>
                                        {products.map(pr => (
                                          <SelectItem key={`product::${pr.id}`} value={`product::${pr.id}`}>
                                            {pr.product_name || pr.name} ({fmt(pr.purchase_cost * pr.quantity)} kr)
                                          </SelectItem>
                                        ))}
                                      </SelectGroup>
                                    )}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}

                            {/* Attest actions */}
                            {attest && (attest.status === 'imported' || attest.status === 'needs_review' || attest.status === 'linked') && (
                              <div className="space-y-2">
                                <Textarea
                                  value={attestComment}
                                  onChange={e => setAttestComment(e.target.value)}
                                  placeholder="Kommentar (valfritt)..."
                                  className="min-h-[60px] text-xs resize-none"
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    className="gap-1.5 text-xs"
                                    onClick={() => handleAttest(si)}
                                    disabled={attestInvoice.isPending}
                                  >
                                    <Check className="h-3 w-3" /> Attestera
                                  </Button>
                                  <div className="flex-1">
                                    <Textarea
                                      value={rejectReason}
                                      onChange={e => setRejectReason(e.target.value)}
                                      placeholder="Anledning till avvisning..."
                                      className="min-h-[32px] text-xs resize-none mb-1"
                                    />
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="gap-1.5 text-xs text-red-600 border-red-200 hover:bg-red-50"
                                      onClick={() => handleReject(si)}
                                      disabled={rejectInvoice.isPending || !rejectReason.trim()}
                                    >
                                      <X className="h-3 w-3" /> Avvisa
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Push to booking */}
                            {attest && attest.status === 'attested' && attest.booking_sync_status === 'pending' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 text-xs"
                                onClick={() => handlePushToBooking(si)}
                                disabled={pushToBooking.isPending}
                              >
                                <Send className="h-3 w-3" /> Skicka attest till Booking
                              </Button>
                            )}

                            {/* Show attest details */}
                            {attest && attest.attested_at && (
                              <div className="text-xs text-muted-foreground bg-green-50/50 dark:bg-green-950/10 rounded-md px-3 py-2 border border-green-200/40 dark:border-green-800/30">
                                <p>Attesterad av {attest.attested_by} · {new Date(attest.attested_at).toLocaleDateString('sv-SE')}</p>
                                {attest.attest_comment && <p className="mt-1 italic">"{attest.attest_comment}"</p>}
                              </div>
                            )}

                            {attest && attest.rejected_at && (
                              <div className="text-xs text-muted-foreground bg-red-50/50 dark:bg-red-950/10 rounded-md px-3 py-2 border border-red-200/40 dark:border-red-800/30">
                                <p>Avvisad av {attest.rejected_by} · {new Date(attest.rejected_at).toLocaleDateString('sv-SE')}</p>
                                {attest.reject_reason && <p className="mt-1 italic">"{attest.reject_reason}"</p>}
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
