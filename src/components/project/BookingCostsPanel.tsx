import { fetchLiveBookingById } from "@/services/booking/liveBookingService";
import { extraCostAmount } from "@/lib/economy/bookingCosts";
export { extraCostAmount } from "@/lib/economy/bookingCosts";
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProductCostsCard } from './ProductCostsCard';
import { fetchProductCostOverrides } from '@/services/productCostOverrideService';
import { fetchProductCostsRemote, fetchBookingExtraCosts, updateBookingExtraCosts, updateBookingProductCosts, type BookingExtraCost, type BookingCostPatch } from '@/services/planningApiService';
import type { ProductCostSummary } from '@/services/productCostService';

const fields = ['assembly_cost', 'handling_cost', 'purchase_cost'] as const;
const fmt = (n: number) => n.toLocaleString('sv-SE');
export function legacyCostDifference(product: Record<string, unknown> | undefined, legacy: Record<string, unknown>) {
  const costs: BookingCostPatch = {}, expected: BookingCostPatch = {};
  if (!product) return { costs, expected };
  for (const field of fields) {
    const value = legacy[field];
    if (typeof value === 'number' && value !== product[field]) {
      costs[field] = value; expected[field] = product[field] as number;
    }
  }
  return { costs, expected };
}
function useCostRefresh(bookingId: string) {
  const client = useQueryClient();
  return () => Promise.all([
    client.invalidateQueries({ queryKey: ['product-costs', bookingId] }),
    client.invalidateQueries({ queryKey: ['booking-extra-costs', bookingId] }),
    client.invalidateQueries({ queryKey: ['large-project-booking-economy'] }),
  ]);
}
export function LegacyBookingCostsNotice({ projectId }: { projectId: string }) {
  const { data: legacy = [], error } = useQuery({ queryKey: ['product-cost-overrides', projectId], queryFn: () => fetchProductCostOverrides(projectId) });
  if (error) return <p role="alert">Tidigare lokala kostnader kunde inte kontrolleras.</p>;
  if (!legacy.length) return null;
  return <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">Det finns {legacy.length} tidigare lokala kostnadsändringar. Summeringen visar nu Booking. Öppna respektive bokning nedan för att jämföra och vid behov föra över tidigare värden. Inga tidigare värden har raderats.</div>;
}
export function BookingCostReconciliation({ bookingId, projectId }: { bookingId: string; projectId: string }) {
  const { data: legacy = [], error } = useQuery({ queryKey: ['product-cost-overrides', projectId], queryFn: () => fetchProductCostOverrides(projectId) });
  const { data } = useQuery<ProductCostSummary>({ queryKey: ['product-costs', bookingId], queryFn: () => fetchProductCostsRemote(bookingId) });
  const [saving, setSaving] = useState(false);
  const refresh = useCostRefresh(bookingId);
  const currency = data?.cost_currency || 'SEK';
  const differences = legacy.filter(row => !row.booking_id || row.booking_id === bookingId).map(row => {
    const product = data?.products.find(p => p.id === row.product_id);
    return { row, product, ...legacyCostDifference(product as unknown as Record<string, unknown>, row as unknown as Record<string, unknown>) };
  }).filter(item => !item.product || Object.keys(item.costs).length > 0);
  if (error) return <p role="alert">Tidigare lokala kostnadsändringar kunde inte läsas.</p>;
  if (!differences.length) return null;
  return <Card><CardHeader><CardTitle className="text-base">Tidigare lokala kostnadsändringar</CardTitle></CardHeader><CardContent className="space-y-3">
    <p className="text-sm text-muted-foreground">Observera: tidigare lokala ändringar avviker från Booking och ingår inte längre i summeringen. De finns kvar här för granskning. Jämför innan du för över en tidigare ändring.</p>
    {differences.map(({ row, product, costs, expected }) => <div key={row.id} className="rounded-lg border p-3 space-y-2">
      <p className="font-medium">{product?.product_name ?? `Ej matchad produktrad: ${row.product_id}`}</p>
      {fields.filter(field => row[field] !== null).map(field => <p className="text-sm" key={field}>{({ assembly_cost: 'Montage', handling_cost: 'Hantering', purchase_cost: 'Inköp' })[field]}: tidigare {fmt(Number(row[field]))} {currency} · Booking {product ? fmt(Number(product[field])) : 'saknar säker matchning'} {currency}</p>)}
      {product && <Button size="sm" disabled={saving} onClick={async () => {
        setSaving(true);
        try { await updateBookingProductCosts(bookingId, product.id, costs, expected); await refresh(); toast.success('Ändringen sparad på bokningen'); }
        catch { toast.error('Kunde inte föra över. Uppdatera och jämför igen.'); }
        finally { setSaving(false); }
      }}>För över tidigare ändring till bokningen</Button>}
    </div>)}
  </CardContent></Card>;
}

export function BookingExtraCostsCard({ bookingId }: { bookingId: string }) {
  const query = useQuery({ queryKey: ['booking-extra-costs', bookingId], queryFn: () => fetchBookingExtraCosts(bookingId) });
  const [draft, setDraft] = useState<BookingExtraCost[] | null>(null);
  const [expected, setExpected] = useState<BookingExtraCost[] | null>(null);
  const [saving, setSaving] = useState(false);
  const refresh = useCostRefresh(bookingId);
  const currency = query.data?.cost_currency || 'SEK';
  const rows = draft ?? query.data?.extra_costs ?? [];
  const edit = (next: BookingExtraCost[]) => { if (draft === null) setExpected(query.data?.extra_costs ?? null); setDraft(next); };
  const update = (id: string, key: keyof BookingExtraCost, value: string | number) => edit(rows.map(row => row.id === id ? { ...row, [key]: value } : row));
  if (query.isLoading) return <p>Läser manuella kostnader…</p>;
  if (query.error) return <p role="alert">Kunde inte läsa manuella kostnader. <Button variant="outline" onClick={() => query.refetch()}>Försök igen</Button></p>;
  return <Card><CardHeader><CardTitle className="text-base">Manuella kostnader på bokningen</CardTitle></CardHeader><CardContent className="space-y-4">
    <p className="text-sm text-muted-foreground">Samma kostnadsrader som i Booking.</p>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Beskrivning','Belopp','Antal','Pris/st','Rabatt %','Montage/st','Hantering/st','Inköp/st',''].map((label,i) => <th key={i} className="p-2 text-left">{label}</th>)}</tr></thead><tbody>
    {rows.map(row => <tr key={row.id}><td className="p-1"><Input aria-label="Beskrivning" value={row.label} disabled={saving} onChange={e => update(row.id, 'label', e.target.value)} /></td>
      {(['amount','quantity','unit_price','discount',...fields] as const).map(key => <td key={key} className="p-1"><Input aria-label={key} type="number" min="0" max={key === 'discount' ? 100 : undefined} className="min-w-24" disabled={saving} value={row[key] ?? ''} onChange={e => update(row.id, key, Number(e.target.value))} /></td>)}
      <td><Button variant="ghost" disabled={saving} onClick={() => edit(rows.filter(r => r.id !== row.id))}>Ta bort</Button></td></tr>)}
    </tbody></table></div>
    <p className="font-semibold">Totalt: {fmt(rows.reduce((sum, row) => sum + extraCostAmount(row), 0))} {currency}</p>
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={saving} onClick={() => edit([...rows, { id: crypto.randomUUID(), label: '', amount: 0 }])}>Lägg till kostnad</Button>
      {draft !== null && <><Button disabled={saving} onClick={async () => {
        if (draft.some(row => !row.label.trim() || Object.entries(row).some(([key,value]) => key !== 'id' && key !== 'label' && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (key === 'discount' && value > 100))))) { toast.error('Fyll i beskrivning och giltiga belopp'); return; }
        setSaving(true);
        try { await updateBookingExtraCosts(bookingId, draft, expected); setDraft(null); await refresh(); toast.success('Kostnader sparade på bokningen'); }
        catch { toast.error('Kunde inte spara. Någon kan ha ändrat bokningen. Dina ändringar finns kvar.'); }
        finally { setSaving(false); }
      }}>{saving ? 'Sparar…' : 'Spara kostnader'}</Button><Button variant="ghost" disabled={saving} onClick={() => { setDraft(null); query.refetch(); }}>Avbryt och läs om</Button></>}
    </div>
  </CardContent></Card>;
}
export function BookingCostsPanel({ bookingId, projectId }: { bookingId: string; projectId?: string }) {
  const query = useQuery<ProductCostSummary>({ queryKey: ['product-costs', bookingId], queryFn: () => fetchProductCostsRemote(bookingId) });
  const refresh = useCostRefresh(bookingId);
  return <div className="space-y-4">
    {query.error && <p role="alert">Kunde inte läsa produktkostnader. <Button onClick={() => query.refetch()}>Försök igen</Button></p>}
    {query.isLoading && <p>Läser produktkostnader…</p>}
    {projectId && <BookingCostReconciliation bookingId={bookingId} projectId={projectId} />}
    {query.data && <ProductCostsCard productCosts={query.data} onRefresh={query.refetch} onUpdateProductCost={async ({ productId, costs }) => {
      const product = query.data.products.find(p => p.id === productId);
      if (!product) return;
      const expected: BookingCostPatch = {};
      for (const field of fields) if (field in costs) expected[field] = product[field];
      if (Object.values(costs).some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) { toast.error('Ange en giltig kostnad'); return; }
      try { await updateBookingProductCosts(bookingId, productId, costs, expected); await refresh(); toast.success('Kostnad sparad på bokningen'); }
      catch { toast.error('Kunde inte spara. Uppdatera och kontrollera kostnaden.'); }
    }} />}
    <BookingExtraCostsCard key={bookingId} bookingId={bookingId} />
  </div>;
}

export function BookingCostsHeading({ bookingId }: { bookingId: string }) {
  const { data } = useQuery({ queryKey: ['booking-costs-heading', bookingId], queryFn: () => fetchLiveBookingById(bookingId) });
  const label = data ? [data.booking_number, data.client].filter(Boolean).join(' · ') : '';
  return <h3 className="font-medium mb-3">{label || 'Bokningskostnader'}</h3>;
}
