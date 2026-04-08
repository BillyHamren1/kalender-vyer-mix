import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ChevronDown, ChevronRight, Package, Users, ShoppingCart, FileText, Receipt,
  Plus, Save, X, Pencil, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { BatchEconomyData } from '@/services/planningApiService';
import { createPurchase, updatePurchase, deletePurchase } from '@/services/planningApiService';
import { useQueryClient } from '@tanstack/react-query';

const fmt = (v: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);

interface BookingInfo {
  booking_id: string;
  display_name: string | null;
  booking?: {
    id?: string;
    client?: string;
    booking_number?: string | null;
  } | null;
}

interface Props {
  bookingEconomyData: Record<string, BatchEconomyData>;
  bookings: BookingInfo[];
  largeProjectId?: string;
}

/** Resolve a human-readable booking name. Always prefer real booking data over display_name. */
function resolveBookingName(id: string, bookings: BookingInfo[]): string {
  const b = bookings.find(b => b.booking_id === id);
  const client = b?.booking?.client?.trim();
  const bookingNumber = b?.booking?.booking_number?.trim();

  // Always prefer real data
  if (client) {
    const num = bookingNumber ? ` (#${bookingNumber})` : '';
    return `${client}${num}`;
  }
  if (bookingNumber) return `#${bookingNumber}`;

  // Fallback to display_name only if it's not a generic UUID-based name
  const displayName = b?.display_name?.trim();
  if (displayName && !/^Bokning\s+[0-9a-f-]{8,}$/i.test(displayName)) return displayName;

  return `Bokning ${id.slice(0, 8)}`;
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

/* ─── Editable product cost cell ─── */
function EditableCell({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value.toString());

  if (editing) {
    return (
      <Input
        type="number"
        className="h-7 text-xs text-right w-24"
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={() => { onSave(parseFloat(val) || 0); setEditing(false); }}
        onKeyDown={e => { if (e.key === 'Enter') { onSave(parseFloat(val) || 0); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
        autoFocus
      />
    );
  }

  return (
    <button
      onClick={() => { setVal(value.toString()); setEditing(true); }}
      className="text-xs text-right w-full cursor-pointer hover:bg-muted/60 rounded px-1 py-0.5 transition-colors"
      title="Klicka för att redigera"
    >
      {fmt(value)}
    </button>
  );
}

export const LargeProjectBookingEconomyBreakdown = ({ bookingEconomyData, bookings, largeProjectId }: Props) => {
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

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['large-project-booking-economy'] });
  };

  // Build merged list of all costs across bookings
  const mergedCosts = useMemo(() => {
    const all: { type: string; bookingId: string; bookingName: string; description: string; info: string; amount: number }[] = [];
    Object.entries(bookingEconomyData).forEach(([bookingId, data]) => {
      const bName = getBookingName(bookingId);

      // Products — include ALL, even zero-cost
      const products = extractProducts(data);
      products.forEach((p: any) => {
        const cost = p.total_cost ?? p.cost ?? ((p.assembly_cost || 0) + (p.handling_cost || 0) + (p.purchase_cost || 0));
        all.push({
          type: 'Produkt', bookingId, bookingName: bName,
          description: p.product_name || p.name || p.description || '—',
          info: `${p.quantity || 1} st`,
          amount: cost,
        });
      });

      // Staff / time reports
      const timeReports = Array.isArray(data.time_reports) ? data.time_reports : [];
      timeReports.forEach((r: any) => {
        all.push({
          type: 'Personal', bookingId, bookingName: bName,
          description: r.staff_name || 'Okänd',
          info: `${r.total_hours || r.hours_worked || 0}h`,
          amount: r.total_cost || 0,
        });
      });

      // Purchases
      const purchases = Array.isArray(data.purchases) ? data.purchases : [];
      purchases.forEach((p: any) => {
        all.push({
          type: 'Inköp', bookingId, bookingName: bName,
          description: p.description || '—',
          info: p.supplier || '—',
          amount: p.amount || 0,
        });
      });

      // Invoices
      const invoices = Array.isArray(data.invoices) ? data.invoices : [];
      invoices.forEach((inv: any) => {
        all.push({
          type: 'Faktura', bookingId, bookingName: bName,
          description: inv.supplier || '—',
          info: inv.invoice_number || '—',
          amount: Number(inv.invoiced_amount) || 0,
        });
      });

      // Supplier invoices (skip linked to avoid double-counting)
      const supplierInvoices = Array.isArray(data.supplier_invoices) ? data.supplier_invoices : [];
      supplierInvoices
        .filter((s: any) => !(s.is_final_link && s.linked_cost_id))
        .forEach((si: any) => {
          all.push({
            type: 'Lev.faktura', bookingId, bookingName: bName,
            description: si.invoice_data?.SupplierName || '—',
            info: si.invoice_data?.GivenNumber || '—',
            amount: Number(si.invoice_data?.Total) || 0,
          });
        });
    });
    return all;
  }, [bookingEconomyData, bookings]);

  const mergedTotal = mergedCosts.reduce((s, c) => s + c.amount, 0);

  return (
    <Card className="border-border/40">
      <CardHeader>
        <CardTitle className="text-base font-medium">Detaljerad ekonomi per bokning</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="per-booking" className="space-y-4">
          <TabsList className="h-9 p-0.5">
            <TabsTrigger value="per-booking" className="text-xs px-3">Per bokning</TabsTrigger>
            <TabsTrigger value="merged" className="text-xs px-3">Alla kostnader ({mergedCosts.length})</TabsTrigger>
          </TabsList>

          {/* ─── Per booking view ─── */}
          <TabsContent value="per-booking" className="space-y-3 mt-0">
            {Object.entries(bookingEconomyData).map(([bookingId, data]) => {
              const isExpanded = expandedBookings.has(bookingId);
              const products = extractProducts(data);
              const productSummary = data.product_costs?.summary;
              const timeReports = Array.isArray(data.time_reports) ? data.time_reports : [];
              const purchases = Array.isArray(data.purchases) ? data.purchases : [];
              const invoices = Array.isArray(data.invoices) ? data.invoices : [];
              const supplierInvoices = Array.isArray(data.supplier_invoices) ? data.supplier_invoices : [];

              const totalCost =
                (productSummary?.costs || 0) +
                timeReports.reduce((s: number, r: any) => s + (r.total_cost || 0), 0) +
                purchases.reduce((s: number, p: any) => s + (p.amount || 0), 0) +
                invoices.reduce((s: number, i: any) => s + (Number(i.invoiced_amount) || 0), 0) +
                supplierInvoices
                  .filter((s: any) => !(s.is_final_link && s.linked_cost_id))
                  .reduce((s: number, si: any) => s + (Number(si.invoice_data?.Total) || 0), 0);

              return (
                <div key={bookingId} className="border border-border/40 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleBooking(bookingId)}
                    className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      <span className="font-medium text-sm">{getBookingName(bookingId)}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                        {fmt(productSummary?.revenue || 0)} intäkt
                      </Badge>
                    </div>
                    <span className="text-sm font-semibold">{fmt(totalCost)} kostnad</span>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border/40 p-3 space-y-4 bg-muted/20">
                      {/* Products — editable costs */}
                      {products.length > 0 && (
                        <Section icon={<Package className="h-3.5 w-3.5" />} title="Produkter" total={productSummary?.costs || 0}>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Produkt</TableHead>
                                <TableHead className="text-xs text-right">Antal</TableHead>
                                <TableHead className="text-xs text-right">Intäkt</TableHead>
                                <TableHead className="text-xs text-right">Montage</TableHead>
                                <TableHead className="text-xs text-right">Hantering</TableHead>
                                <TableHead className="text-xs text-right">Inköp</TableHead>
                                <TableHead className="text-xs text-right">Tot. kostnad</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {products.map((p: any, i: number) => {
                                const assemblyCost = p.assembly_cost || 0;
                                const handlingCost = p.handling_cost || 0;
                                const purchaseCost = p.purchase_cost || 0;
                                const totalPCost = p.total_cost ?? p.cost ?? (assemblyCost + handlingCost + purchaseCost);
                                return (
                                  <TableRow key={i}>
                                    <TableCell className="text-xs font-medium">{p.product_name || p.name || p.description || '—'}</TableCell>
                                    <TableCell className="text-xs text-right">{p.quantity || 1}</TableCell>
                                    <TableCell className="text-xs text-right">{fmt(p.total_revenue || p.revenue || p.total_price || 0)}</TableCell>
                                    <TableCell className="text-xs text-right">{fmt(assemblyCost)}</TableCell>
                                    <TableCell className="text-xs text-right">{fmt(handlingCost)}</TableCell>
                                    <TableCell className="text-xs text-right">{fmt(purchaseCost)}</TableCell>
                                    <TableCell className="text-xs text-right font-semibold">{fmt(totalPCost)}</TableCell>
                                  </TableRow>
                                );
                              })}
                              <TableRow className="font-semibold border-t">
                                <TableCell colSpan={2} className="text-xs">Summa</TableCell>
                                <TableCell className="text-xs text-right">{fmt(productSummary?.revenue || 0)}</TableCell>
                                <TableCell colSpan={3}></TableCell>
                                <TableCell className="text-xs text-right">{fmt(productSummary?.costs || 0)}</TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </Section>
                      )}

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
                  )}
                </div>
              );
            })}
          </TabsContent>

          {/* ─── Merged view — all costs in one table ─── */}
          <TabsContent value="merged" className="mt-0">
            {mergedCosts.length === 0 ? (
              <p className="text-muted-foreground text-center py-8 text-sm">Inga kostnader registrerade i bokningarna</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Typ</TableHead>
                    <TableHead className="text-xs">Bokning</TableHead>
                    <TableHead className="text-xs">Beskrivning</TableHead>
                    <TableHead className="text-xs">Info</TableHead>
                    <TableHead className="text-xs text-right">Belopp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mergedCosts.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{c.type}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{c.bookingName}</TableCell>
                      <TableCell className="text-xs font-medium">{c.description}</TableCell>
                      <TableCell className="text-xs">{c.info}</TableCell>
                      <TableCell className="text-xs text-right font-medium">{fmt(c.amount)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold border-t-2">
                    <TableCell colSpan={4} className="text-xs">TOTALT</TableCell>
                    <TableCell className="text-xs text-right">{fmt(mergedTotal)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
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
