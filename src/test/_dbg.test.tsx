import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';

function makeBuilder(rows: any[]) {
  const b: any = {
    select: vi.fn(() => b),
    order: vi.fn(() => b),
    eq: vi.fn(() => b),
    limit: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  Object.defineProperty(b, 'then', { value: (resolve: any) => Promise.resolve({ data: rows, error: null }).then(resolve) });
  return b;
}

describe('dbg', () => {
  it('awaits builder', async () => {
    const b = makeBuilder([{ name: 'X' }]);
    const r = await b.select('x').order('y');
    console.log('got', r);
    expect(r.data.length).toBe(1);
  });
});
