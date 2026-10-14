import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
import { extraCostAmount, legacyCostDifference } from './BookingCostsPanel';

describe('shared Booking cost interpretation', () => {
  it('uses the same manual breakdown fallback as Booking', () => {
    expect(extraCostAmount({ id: 'a', label: 'A', amount: 99, quantity: 2, assembly_cost: 5, handling_cost: 3, purchase_cost: 2 })).toBe(20);
    expect(extraCostAmount({ id: 'a', label: 'A', amount: 99, quantity: 0, assembly_cost: 5 })).toBe(99);
    expect(extraCostAmount({ id: 'a', label: 'A', amount: 0 })).toBe(0);
  });
  it('reconciles only explicit differences, including zero, preserving unchanged canonical fields', () => {
    const canonical = { assembly_cost: 20, handling_cost: 30, purchase_cost: 40 };
    expect(legacyCostDifference(canonical, { assembly_cost: null, handling_cost: 0, purchase_cost: 40 })).toEqual({ costs: { handling_cost: 0 }, expected: { handling_cost: 30 } });
    expect(canonical).toEqual({ assembly_cost: 20, handling_cost: 30, purchase_cost: 40 });
  });
  it('never guesses a target for an unmatched old local product ID', () => {
    expect(legacyCostDifference(undefined, { handling_cost: 30 })).toEqual({ costs: {}, expected: {} });
  });
});

import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach } from 'vitest';
import { BookingExtraCostsCard } from './BookingCostsPanel';
import { supabase } from '@/integrations/supabase/client';
afterEach(cleanup);

it('retains an unsaved manual draft on conflict and submits the original null snapshot', async () => {
  const invoke = vi.mocked(supabase.functions.invoke);
  invoke.mockImplementation(async (_name, options: any) => options.body.method === 'GET'
    ? { data: { extra_costs: null }, error: null } as any
    : { data: { error: 'conflict' }, error: null } as any);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><BookingExtraCostsCard bookingId="booking-a" /></QueryClientProvider>);
  fireEvent.click(await screen.findByText('Lägg till kostnad'));
  fireEvent.change(screen.getByLabelText('Beskrivning'), { target: { value: 'Transport' } });
  fireEvent.change(screen.getByLabelText('amount'), { target: { value: '300' } });
  fireEvent.click(screen.getByText('Spara kostnader'));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('planning-api-proxy', expect.objectContaining({ body: expect.objectContaining({ method: 'PUT', data: expect.objectContaining({ expected_extra_costs: null }) }) })));
  await waitFor(() => expect(screen.getByText('Spara kostnader')).not.toBeDisabled());
  expect(screen.getByLabelText('Beskrivning')).toHaveValue('Transport');
  expect(screen.getByLabelText('amount')).toHaveValue(300);
});

import { ProductCostsCard } from './ProductCostsCard';
it('keeps SEK costs and suppresses margin when revenue uses another currency', () => {
  render(<ProductCostsCard productCosts={{ currency: 'EUR', cost_currency: 'SEK', products: [{ id: 'p', product_name: 'Tent', quantity: 1, unit_price: 100, total: 100, discount: 0, assembly_cost: 10, handling_cost: 0, purchase_cost: 0, vat_rate: 25, is_manual: false, manual_type: null }], summary: { revenue: 100, costs: 10, margin: 90 } }} />);
  expect(screen.getByText('100 EUR')).toBeInTheDocument();
  expect(screen.getByText('10 SEK')).toBeInTheDocument();
  expect(screen.queryByText('90%')).not.toBeInTheDocument();
});
