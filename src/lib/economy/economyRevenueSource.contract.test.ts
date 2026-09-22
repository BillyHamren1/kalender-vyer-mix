import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('economy revenue source contract', () => {
  it('hämtar inte reservsummor från Planning booking_products', () => {
    const hook = read('src/hooks/useEconomyOverviewData.ts');
    expect(hook).not.toContain(".from('booking_products')");
    expect(hook).not.toContain('bookingProductEconomyFallback');
  });

  it('visar ett tydligt källfel i stället för falska 0 kr', () => {
    const list = read('src/components/economy/CompletedProjectsList.tsx');
    expect(list).toContain('p.revenueAvailable ? formatCurrency(p.quotedAmount)');
    expect(list).toContain('Summan kunde inte hämtas');
  });

  it('cachar bara batcher med ett giltigt product_costs-svar', () => {
    const proxy = read('supabase/functions/planning-api-proxy/index.ts');
    expect(proxy).toContain('.filter(([, data]) => hasValidProductCosts(data))');
    expect(proxy).toContain(".eq('organization_id', orgId)");
    expect(proxy).toContain(".from('bookings')");
  });
});
