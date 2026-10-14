import { extraCostsTotal } from "@/lib/economy/bookingCosts";
import { BookingCostsPanel } from "./BookingCostsPanel";
import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ChevronDown, ChevronRight, Package, Users, ShoppingCart, FileText, Receipt,
  Plus, Save, X, Pencil, Trash2, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getLargeProjectBookingLabel } from '@/lib/largeProjectBookingLabel';
import { toast } from 'sonner';
import type { BatchEconomyData } from '@/services/planningApiService';
import { createPurchase, updatePurchase, deletePurchase } from '@/services/planningApiService';
import { useQueryClient } from '@tanstack/react-query';

const fmt = (v: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);

interface LocalProduct {
  id: string;
  booking_id: string;
  name: string;
  quantity: number;
  unit_price: number | null;
  total_price: number | null;
  assembly_cost: number | null;
  handling_cost: number | null;
  purchase_cost: number | null;
  parent_product_id: string | null;
  is_package_component: boolean | null;
  sku: string | null;
  sort_index: number | null;
}

interface BookingInfo {
  booking_id: string;
  display_name: string | null;
  booking?: {
    id?: string;
    client?: string;
    booking_number?: string | null;
    status?: string | null;
  } | null;
}

interface Props {
  bookingEconomyData: Record<string, BatchEconomyData>;
  bookings: BookingInfo[];
  largeProjectId?: string;
  localProducts?: LocalProduct[];
}

/** Resolve a human-readable booking name. Always prefer real booking data over display_name. */
function resolveBookingName(id: string, bookings: BookingInfo[]): string {
  const bookingLink = bookings.find((booking) => booking.booking_id === id);

  return getLargeProjectBookingLabel(
    bookingLink || {
      booking_id: id,
      display_name: null,
      booking: null,
    }
  );
}

/** Extract product list from batch data, handling multiple API formats */
function extractProducts(data: BatchEconomyData): any[] {
  const pc = data.product_costs;
  if (!pc) return [];
  // Try line_items first (new format), then products
  if (Array.isArray(pc.line_items)) return pc.line_items;
  if (Array.isArray((pc as any).products)) return (pc as any).products;
  return [];
}

/* ─── Inline editable purchase row ─── */
function EditablePurchaseRow({ purchase, onSaved, onDeleted }: {
  purchase: any;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(purchase.description || '');
  const [supplier, setSupplier] = useState(purchase.supplier || '');
  const [amount, setAmount] = useState((purchase.amount || 0).toString());
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePurchase(purchase.id, { description: desc, supplier: supplier || null, amount: parseFloat(amount) || 0 });
      toast.success('Inköp uppdaterat');
      setEditing(false);
      onSaved();
    } catch { toast.error('Kunde inte spara'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await deletePurchase(purchase.id);
      toast.success('Inköp borttaget');
      onDeleted();
    } catch { toast.error('Kunde inte ta bort'); }
    finally { setSaving(false); }
  };

  if (editing) {
    return (
      <TableRow>
        <TableCell><Input value={desc} onChange={e => setDesc(e.target.value)} className="h-7 text-xs" placeholder="Beskrivning" /></TableCell>
        <TableCell><Input value={supplier} onChange={e => setSupplier(e.target.value)} className="h-7 text-xs" placeholder="Leverantör" /></TableCell>
        <TableCell className="text-right"><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="h-7 text-xs text-right w-24 ml-auto" /></TableCell>
        <TableCell>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleSave} disabled={saving}><Save className="h-3 w-3" /></Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(false)}><X className="h-3 w-3" /></Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell className="text-xs font-medium">{purchase.description || '—'}</TableCell>
      <TableCell className="text-xs">{purchase.supplier || '—'}</TableCell>
      <TableCell className="text-xs text-right">{fmt(purchase.amount || 0)}</TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(true)}><Pencil className="h-3 w-3" /></Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={handleDelete} disabled={saving}><Trash2 className="h-3 w-3" /></Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

/* ─── Add purchase inline form ─── */
function AddPurchaseRow({ bookingId, onAdded }: { bookingId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState('');
  const [supplier, setSupplier] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <TableRow>
        <TableCell colSpan={4}>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setOpen(true)}>
            <Plus className="h-3 w-3 mr-1" /> Lägg till inköp
          </Button>
        </TableCell>
      </TableRow>
    );
  }

  const handleAdd = async () => {
    if (!desc || !amount) return;
    setSaving(true);
    try {
      await createPurchase({ booking_id: bookingId, description: desc, supplier: supplier || null, amount: parseFloat(amount) || 0 });
      toast.success('Inköp tillagt');
      setDesc(''); setSupplier(''); setAmount('');
      setOpen(false);
      onAdded();
    } catch { toast.error('Kunde inte lägga till inköp'); }
    finally { setSaving(false); }
  };

  return (
    <TableRow>
      <TableCell><Input value={desc} onChange={e => setDesc(e.target.value)} className="h-7 text-xs" placeholder="Beskrivning *" /></TableCell>
      <TableCell><Input value={supplier} onChange={e => setSupplier(e.target.value)} className="h-7 text-xs" placeholder="Leverantör" /></TableCell>
      <TableCell><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="h-7 text-xs text-right w-24 ml-auto" placeholder="0" /></TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleAdd} disabled={saving || !desc || !amount}><Save className="h-3 w-3" /></Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)}><X className="h-3 w-3" /></Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export const LargeProjectBookingEconomyBreakdown = ({ bookingEconomyData, bookings, largeProjectId, localProducts = [] }: Props) => {
  const [expandedBookings, setExpandedBookings] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const toggleBooking = (id: string) => {
    setExpandedBookings(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getBookingName = (id: string) => resolveBookingName(id, bookings);

  /** Get separate booking number + client name for table columns */
  const getBookingParts = (id: string): { bookingNumber: string; clientName: string } => {
    const link = bookings.find((b) => b.booking_id === id);
    const bookingNumber = link?.booking?.booking_number?.trim() || '';
    const clientName = link?.booking?.client?.trim()
      || link?.display_name?.trim()
      || '';
    return {
      bookingNumber: bookingNumber || `${id.slice(0, 8)}`,
      clientName: clientName || '—',
    };
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['large-project-booking-economy'] });
    queryClient.invalidateQueries({ queryKey: ['large-project-local-products'] });
  };

  // Aggregate all costs across all bookings into category buckets
  const mergedCategories = useMemo(() => {
    const buckets: Record<string, { label: string; amount: number; count: number }> = {
      extra: { label: 'Manuella bokningskostnader', amount: 0, count: 0 },
      assembly:  { label: 'Montage',             amount: 0, count: 0 },
      handling:  { label: 'Hantering',           amount: 0, count: 0 },
      purchase:  { label: 'Inköp (produkt)',     amount: 0, count: 0 },
      staff:     { label: 'Personal',            amount: 0, count: 0 },
      purchases: { label: 'Inköp (lösa)',        amount: 0, count: 0 },
      invoices:  { label: 'Fakturor',            amount: 0, count: 0 },
      supplier:  { label: 'Leverantörsfakturor', amount: 0, count: 0 },
    };

    Object.entries(bookingEconomyData).forEach(([bookingId, data]) => {
      // Products — split into assembly / handling / purchase
      const products = extractProducts(data);
      products.forEach((p: any) => {
        const qty = Number(p.quantity) || 0;
        const a = (Number(p.assembly_cost) || 0) * qty;
        const h = (Number(p.handling_cost) || 0) * qty;
        const pu = (Number(p.purchase_cost) || 0) * qty;
        if (a) { buckets.assembly.amount += a; buckets.assembly.count += 1; }
        if (h) { buckets.handling.amount += h; buckets.handling.count += 1; }
        if (pu) { buckets.purchase.amount += pu; buckets.purchase.count += 1; }
      });

      buckets.extra.amount += extraCostsTotal(data.product_costs?.extra_costs);
      buckets.extra.count += data.product_costs?.extra_costs?.length ?? 0;

      // Staff / time reports
      const timeReports = Array.isArray(data.time_reports) ? data.time_reports : [];
      timeReports.forEach((r: any) => {
        const c = Number(r.total_cost) || 0;
        buckets.staff.amount += c;
        buckets.staff.count += 1;
      });

      // Purchases
      const purchases = Array.isArray(data.purchases) ? data.purchases : [];
      purchases.forEach((p: any) => {
        buckets.purchases.amount += Number(p.amount) || 0;
        buckets.purchases.count += 1;
      });

      // Invoices
      const invoices = Array.isArray(data.invoices) ? data.invoices : [];
      invoices.forEach((inv: any) => {
        buckets.invoices.amount += Number(inv.invoiced_amount) || 0;
        buckets.invoices.count += 1;
      });

      // Supplier invoices (skip linked to avoid double-counting)
      const supplierInvoices = Array.isArray(data.supplier_invoices) ? data.supplier_invoices : [];
      supplierInvoices
        .filter((s: any) => !(s.is_final_link && s.linked_cost_id))
        .forEach((si: any) => {
          buckets.supplier.amount += Number(si.invoice_data?.Total) || 0;
          buckets.supplier.count += 1;
        });
    });

    return Object.values(buckets).filter(b => b.count > 0 || b.amount !== 0);
  }, [bookingEconomyData, bookings]);

  const mergedTotal = mergedCategories.reduce((s, c) => s + c.amount, 0);
  const mergedCount = mergedCategories.reduce((s, c) => s + c.count, 0);

  return (
    <Card className="border-border/40">
      <CardHeader>
        <CardTitle className="text-base font-medium">Detaljerad ekonomi per bokning</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="merged" className="space-y-4">
          <TabsList className="h-9 p-0.5">
            <TabsTrigger value="per-booking" className="text-xs px-3">Per bokning</TabsTrigger>
            <TabsTrigger value="merged" className="text-xs px-3">Alla kostnader ({mergedCount})</TabsTrigger>
          </TabsList>

          {/* ─── Per booking view (table) ─── */}
          <TabsContent value="per-booking" className="mt-0">
            {Object.keys(bookingEconomyData).length === 0 ? (
              <p className="text-muted-foreground text-center py-8 text-sm">
                Inga bokningar i projektet
              </p>
            ) : (
              <div className="rounded-lg border border-border/40 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-10"></TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Bokningsnummer
                      </TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Kund
                      </TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                        Intäkt
                      </TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                        Kostnad
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(bookingEconomyData).map(([bookingId, data]) => {
                      const isExpanded = expandedBookings.has(bookingId);
                      const products = extractProducts(data);
                      const productSummary = data.product_costs?.summary;
                      const timeReports = Array.isArray(data.time_reports) ? data.time_reports : [];
                      const purchases = Array.isArray(data.purchases) ? data.purchases : [];
                      const invoices = Array.isArray(data.invoices) ? data.invoices : [];
                      const supplierInvoices = Array.isArray(data.supplier_invoices) ? data.supplier_invoices : [];

                      const displayRevenue = productSummary?.revenue ?? 0;
                      const displayProductCosts = (productSummary?.costs ?? 0) + extraCostsTotal(data.product_costs?.extra_costs);

                      const totalCost =
                        displayProductCosts +
                        timeReports.reduce((s: number, r: any) => s + (r.total_cost || 0), 0) +
                        purchases.reduce((s: number, p: any) => s + (p.amount || 0), 0) +
                        invoices.reduce((s: number, i: any) => s + (Number(i.invoiced_amount) || 0), 0) +
                        supplierInvoices
                          .filter((s: any) => !(s.is_final_link && s.linked_cost_id))
                          .reduce((s: number, si: any) => s + (Number(si.invoice_data?.Total) || 0), 0);

                      const { bookingNumber, clientName } = getBookingParts(bookingId);
                      const bookingLink = bookings.find((b) => b.booking_id === bookingId);
                      const isCancelled = (bookingLink?.booking?.status || '').toUpperCase() === 'CANCELLED';

                      return (
                        <React.Fragment key={bookingId}>
                          <TableRow
                            onClick={() => toggleBooking(bookingId)}
                            className={cn(
                              "cursor-pointer hover:bg-muted/40 transition-colors",
                              isCancelled && "bg-destructive/5"
                            )}
                          >
                            <TableCell className="w-10">
                              {isExpanded
                                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                            </TableCell>
                            <TableCell className={cn("font-bold text-sm", isCancelled && "line-through text-muted-foreground")}>{bookingNumber}</TableCell>
                            <TableCell className={cn("font-semibold text-sm", isCancelled && "text-muted-foreground")}>
                              <div className="flex items-center gap-2">
                                {isCancelled && (
                                  <Badge className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-destructive/10 text-destructive ring-1 ring-destructive/30 flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    AVBOKAD
                                  </Badge>
                                )}
                                <span className={cn(isCancelled && "line-through")}>{clientName}</span>
                              </div>
                            </TableCell>
                            <TableCell className={cn("text-right text-sm font-medium tabular-nums", isCancelled && "line-through text-muted-foreground")}>
                              {new Intl.NumberFormat('sv-SE', { style: 'currency', currency: data.product_costs?.currency || 'SEK', maximumFractionDigits: 0 }).format(displayRevenue)}
                            </TableCell>
                            <TableCell className={cn("text-right text-sm font-semibold tabular-nums", isCancelled && "line-through text-muted-foreground")}>
                              {fmt(totalCost)}
                            </TableCell>
                          </TableRow>

                          {isExpanded && (
                            <TableRow className="hover:bg-transparent">
                              <TableCell colSpan={5} className="p-0">
                                <div className="border-t border-border/40 p-4 space-y-4 bg-muted/20">
                                  <BookingCostsPanel bookingId={bookingId} projectId={largeProjectId} />

                                  {/* Staff */}
                                  {timeReports.length > 0 && (
                                    <Section icon={<Users className="h-3.5 w-3.5" />} title="Personal" total={timeReports.reduce((s: number, r: any) => s + (r.total_cost || 0), 0)}>
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead className="text-xs">Namn</TableHead>
                                            <TableHead className="text-xs text-right">Timmar</TableHead>
                                            <TableHead className="text-xs text-right">Timpris</TableHead>
                                            <TableHead className="text-xs text-right">Kostnad</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {timeReports.map((r: any, i: number) => (
                                            <TableRow key={i}>
                                              <TableCell className="text-xs font-medium">{r.staff_name || r.staff_id?.slice(0, 8)}</TableCell>
                                              <TableCell className="text-xs text-right">{r.total_hours || r.hours_worked || 0}h</TableCell>
                                              <TableCell className="text-xs text-right">{fmt(r.hourly_rate || 0)}</TableCell>
                                              <TableCell className="text-xs text-right">{fmt(r.total_cost || 0)}</TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </Section>
                                  )}

                                  {/* Purchases — always editable, buttons always visible */}
                                  <Section icon={<ShoppingCart className="h-3.5 w-3.5" />} title="Inköp" total={purchases.reduce((s: number, p: any) => s + (p.amount || 0), 0)}>
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead className="text-xs">Beskrivning</TableHead>
                                          <TableHead className="text-xs">Leverantör</TableHead>
                                          <TableHead className="text-xs text-right">Belopp</TableHead>
                                          <TableHead className="text-xs w-20"></TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {purchases.map((p: any) => (
                                          <EditablePurchaseRow key={p.id} purchase={p} onSaved={invalidate} onDeleted={invalidate} />
                                        ))}
                                        <AddPurchaseRow bookingId={bookingId} onAdded={invalidate} />
                                      </TableBody>
                                    </Table>
                                  </Section>

                                  {/* Invoices */}
                                  {invoices.length > 0 && (
                                    <Section icon={<FileText className="h-3.5 w-3.5" />} title="Fakturor" total={invoices.reduce((s: number, i: any) => s + (Number(i.invoiced_amount) || 0), 0)}>
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead className="text-xs">Leverantör</TableHead>
                                            <TableHead className="text-xs">Fakturanr</TableHead>
                                            <TableHead className="text-xs text-right">Belopp</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {invoices.map((inv: any, i: number) => (
                                            <TableRow key={i}>
                                              <TableCell className="text-xs font-medium">{inv.supplier || '-'}</TableCell>
                                              <TableCell className="text-xs">{inv.invoice_number || '-'}</TableCell>
                                              <TableCell className="text-xs text-right">{fmt(Number(inv.invoiced_amount) || 0)}</TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </Section>
                                  )}

                                  {/* Supplier invoices */}
                                  {supplierInvoices.length > 0 && (
                                    <Section icon={<Receipt className="h-3.5 w-3.5" />} title="Leverantörsfakturor" total={
                                      supplierInvoices
                                        .filter((s: any) => !(s.is_final_link && s.linked_cost_id))
                                        .reduce((s: number, si: any) => s + (Number(si.invoice_data?.Total) || 0), 0)
                                    }>
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead className="text-xs">Leverantör</TableHead>
                                            <TableHead className="text-xs">Fakturanr</TableHead>
                                            <TableHead className="text-xs">Status</TableHead>
                                            <TableHead className="text-xs text-right">Belopp</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {supplierInvoices.map((si: any, i: number) => {
                                            const isLinked = si.is_final_link && si.linked_cost_id;
                                            return (
                                              <TableRow key={i} className={cn(isLinked && 'opacity-40 line-through')}>
                                                <TableCell className="text-xs font-medium">{si.invoice_data?.SupplierName || '-'}</TableCell>
                                                <TableCell className="text-xs">{si.invoice_data?.GivenNumber || si.given_number || '-'}</TableCell>
                                                <TableCell className="text-xs">
                                                  {isLinked
                                                    ? <Badge variant="outline" className="text-[9px] px-1 py-0">Länkad</Badge>
                                                    : <Badge variant="secondary" className="text-[9px] px-1 py-0">Olänkad</Badge>
                                                  }
                                                </TableCell>
                                                <TableCell className="text-xs text-right">{fmt(Number(si.invoice_data?.Total) || 0)}</TableCell>
                                              </TableRow>
                                            );
                                          })}
                                        </TableBody>
                                      </Table>
                                    </Section>
                                  )}

                                  {products.length === 0 && timeReports.length === 0 && purchases.length === 0 && invoices.length === 0 && supplierInvoices.length === 0 && (
                                    <p className="text-xs text-muted-foreground text-center py-4">Ingen detaljerad data tillgänglig</p>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* ─── Merged view — aggregated by category across all bookings ─── */}
          <TabsContent value="merged" className="mt-0">
            {mergedCategories.length === 0 ? (
              <p className="text-muted-foreground text-center py-8 text-sm">Inga kostnader registrerade i bokningarna</p>
            ) : (
              <div className="rounded-lg border border-border/40 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Kategori</TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Antal poster</TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Belopp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mergedCategories.map((c) => (
                      <TableRow key={c.label}>
                        <TableCell className="text-xs font-medium">{c.label}</TableCell>
                        <TableCell className="text-xs text-right text-muted-foreground">{c.count}</TableCell>
                        <TableCell className="text-xs text-right font-medium">{fmt(c.amount)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold border-t-2 bg-muted/30">
                      <TableCell className="text-xs">TOTALT</TableCell>
                      <TableCell className="text-xs text-right">{mergedCount}</TableCell>
                      <TableCell className="text-xs text-right">{fmt(mergedTotal)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

/* Small section wrapper */
function Section({ icon, title, total, children }: { icon: React.ReactNode; title: string; total: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {icon}
          {title}
        </div>
        <span className="text-xs font-semibold">{fmt(total)}</span>
      </div>
      {children}
    </div>
  );
}
