import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Package, Users, ShoppingCart, FileText, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BatchEconomyData } from '@/services/planningApiService';

const fmt = (v: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);

interface BookingInfo {
  booking_id: string;
  display_name: string | null;
  booking?: {
    client?: string;
    booking_number?: string | null;
  } | null;
}

interface Props {
  bookingEconomyData: Record<string, BatchEconomyData>;
  bookings: BookingInfo[];
}

export const LargeProjectBookingEconomyBreakdown = ({ bookingEconomyData, bookings }: Props) => {
  const [expandedBookings, setExpandedBookings] = useState<Set<string>>(new Set());

  const toggleBooking = (id: string) => {
    setExpandedBookings(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getBookingName = (id: string) => {
    const b = bookings.find(b => b.booking_id === id);
    if (b?.display_name) return b.display_name;
    if (b?.booking?.client) {
      const num = b.booking.booking_number ? ` (#${b.booking.booking_number})` : '';
      return `${b.booking.client}${num}`;
    }
    return `Bokning ${id.slice(0, 8)}`;
  };

  return (
    <Card className="border-border/40">
      <CardHeader>
        <CardTitle className="text-base font-medium">Detaljerad ekonomi per bokning</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {Object.entries(bookingEconomyData).map(([bookingId, data]) => {
          const isExpanded = expandedBookings.has(bookingId);
          const products = data.product_costs?.products || [];
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
              {/* Booking header */}
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
                  {/* Products */}
                  {products.length > 0 && (
                    <Section icon={<Package className="h-3.5 w-3.5" />} title="Produkter" total={productSummary?.costs || 0}>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Produkt</TableHead>
                            <TableHead className="text-xs text-right">Antal</TableHead>
                            <TableHead className="text-xs text-right">Intäkt</TableHead>
                            <TableHead className="text-xs text-right">Kostnad</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {products.map((p: any, i: number) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs font-medium">{p.name || p.product_name || p.description || '—'}</TableCell>
                              <TableCell className="text-xs text-right">{p.quantity}</TableCell>
                              <TableCell className="text-xs text-right">{fmt(p.revenue || p.total_price || 0)}</TableCell>
                              <TableCell className="text-xs text-right">{fmt(p.cost || p.total_cost || 0)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="font-semibold border-t">
                            <TableCell colSpan={2} className="text-xs">Summa</TableCell>
                            <TableCell className="text-xs text-right">{fmt(productSummary?.revenue || 0)}</TableCell>
                            <TableCell className="text-xs text-right">{fmt(productSummary?.costs || 0)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </Section>
                  )}

                  {/* Time reports / Staff */}
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

                  {/* Purchases */}
                  {purchases.length > 0 && (
                    <Section icon={<ShoppingCart className="h-3.5 w-3.5" />} title="Inköp" total={purchases.reduce((s: number, p: any) => s + (p.amount || 0), 0)}>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Beskrivning</TableHead>
                            <TableHead className="text-xs">Leverantör</TableHead>
                            <TableHead className="text-xs text-right">Belopp</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {purchases.map((p: any, i: number) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs font-medium">{p.description}</TableCell>
                              <TableCell className="text-xs">{p.supplier || '-'}</TableCell>
                              <TableCell className="text-xs text-right">{fmt(p.amount || 0)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Section>
                  )}

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
                                  {isLinked ? (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0">Länkad</Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-[9px] px-1 py-0">Olänkad</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs text-right">{fmt(Number(si.invoice_data?.Total) || 0)}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </Section>
                  )}

                  {/* Empty state */}
                  {products.length === 0 && timeReports.length === 0 && purchases.length === 0 && invoices.length === 0 && supplierInvoices.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">Ingen detaljerad data tillgänglig för denna bokning</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
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
