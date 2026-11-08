import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import WarehouseBookingDetail from './WarehouseBookingDetail';

const state = vi.hoisted(() => ({ items: [] as any[] }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useParams: () => ({ bookingId: 'fixture-booking' }) }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({ isLoading: false, data:
    queryKey[0] === 'warehouse-booking-detail' ? { id: 'fixture-booking', booking_number: 'QA-12', client: 'Fixture', status: 'CONFIRMED' } :
    queryKey[0] === 'warehouse-booking-packings' ? [{ id: 'fixture-packing', name: 'Fixture', status: 'pending' }] : [] }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/hooks/usePackingList', () => ({ usePackingList: () => ({ items: state.items, integrity: null, integrityError: null, isLoading: false, refetchItems: vi.fn() }) }));
vi.mock('@/components/project/BookingInfoExpanded', () => ({ default: () => null }));
vi.mock('@/components/packing/ManualPackingChecklist', () => ({ default: () => null }));
vi.mock('@/components/packing/PackingIntegrityBanner', () => ({ default: () => null }));
vi.mock('@/components/warehouse/WarehouseBookingQuickOpen', () => ({ default: () => null }));
vi.mock('@/components/ui/button', () => ({ Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button> }));
vi.mock('@/components/ui/badge', () => ({ Badge: ({ children }: any) => <span>{children}</span> }));
vi.mock('@/components/ui/card', () => ({ Card: ({ children }: any) => <div>{children}</div>, CardContent: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/lib/utils', () => ({ cn: (...values: any[]) => values.filter(Boolean).join(' ') }));

function packageItems(packed = false) {
  const quantities = [4, 1, 4, 4, 4, 1, 8, 4, 1, 1, 4];
  return Array.from({ length: 6 }, (_, index) => {
    const parentId = `package-${index}`;
    const row = (id: string, quantity: number, parent_product_id: string | null) => ({
      id, quantity_to_pack: quantity, quantity_packed: packed ? quantity : 0,
      excluded: false, is_packable: true, product: { id, parent_product_id },
    });
    return [row(parentId, 1, null), ...quantities.map((quantity, component) => row(`${parentId}-${component}`, quantity, parentId)), row(`canvas-${index}`, 1, parentId)];
  }).flat();
}

describe('Warehouse booking packing summary', () => {
  afterEach(cleanup);
  beforeEach(() => { state.items = []; });

  it('counts 222 physical units while six package headers remain presentation rows', () => {
    state.items = packageItems();
    render(<WarehouseBookingDetail />);
    expect(screen.getByText('0 av 222 packade · 0% klart')).toBeTruthy();
    expect(screen.getByText('0/222 st · 0%')).toBeTruthy();
    expect(screen.queryByText(/228/)).toBeNull();
  });

  it('uses effective packability and retains excluded rows outside both totals', () => {
    state.items = packageItems();
    state.items.push(
      { id: 'nonpackable', quantity_to_pack: 50, quantity_packed: 50, is_packable: false, excluded: false },
      { id: 'retired', quantity_to_pack: 70, quantity_packed: 70, is_packable: true, excluded: true },
    );
    render(<WarehouseBookingDetail />);
    expect(screen.getByText('0 av 222 packade · 0% klart')).toBeTruthy();
    expect(screen.getByText('0/222 st · 0%')).toBeTruthy();
  });

  it('reports completion from physical children even while visual headers stay unpacked', () => {
    state.items = packageItems(true);
    state.items.filter(item => item.product.parent_product_id === null).forEach(item => { item.quantity_packed = 0; });
    render(<WarehouseBookingDetail />);
    expect(screen.getByText('222 av 222 packade · 100% klart')).toBeTruthy();
    expect(screen.getByText('222/222 st · 100%')).toBeTruthy();
  });

  it('keeps a standalone manual row countable and clamps overpacking', () => {
    state.items = [{ id: 'manual', quantity_to_pack: 3, quantity_packed: 8, excluded: false }];
    render(<WarehouseBookingDetail />);
    expect(screen.getByText('3 av 3 packade · 100% klart')).toBeTruthy();
  });
});
