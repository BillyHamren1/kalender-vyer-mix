import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'admin@test' } } }) },
  },
}));

vi.mock('@/hooks/useRealtimeInvalidation', () => ({
  useRealtimeInvalidation: () => {},
}));

vi.mock('@/services/planningDashboardService', () => ({
  fetchStaffLocations: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/components/staff-dashboard/StaffMapView', () => ({
  default: () => <div data-testid="map" />,
}));

vi.mock('@/components/ui/PageContainer', () => ({
  PageContainer: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/PageHeader', () => ({
  PageHeader: ({ title }: any) => <h1>{title}</h1>,
}));

import { supabase } from '@/integrations/supabase/client';
import StaffTimeReports from '@/pages/StaffTimeReports';

function makeBuilder(rows: any[]) {
  const b: any = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    gte: vi.fn(() => b),
    lte: vi.fn(() => b),
    not: vi.fn(() => b),
    order: vi.fn(() => b),
    limit: vi.fn(() => Promise.resolve({ data: rows, error: null })),
    update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    then: undefined,
  };
  // Make awaitable
  Object.defineProperty(b, 'then', {
    value: (resolve: any) => Promise.resolve({ data: rows, error: null }).then(resolve),
  });
  return b;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <StaffTimeReports />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('StaffTimeReports — tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'staff_members') {
        return makeBuilder([
          { id: 's1', name: 'Anna Andersson', color: '#abc', role: 'Tekniker' },
          { id: 's2', name: 'Björn Karlsson', color: '#def', role: 'Riggare' },
        ]);
      }
      if (table === 'staff_locations') {
        return makeBuilder([
          {
            staff_id: 's1',
            latitude: 0,
            longitude: 0,
            updated_at: new Date().toISOString(),
            last_address: null,
            app_version: '1.4.2',
            app_platform: 'ios',
            battery_percent: 87,
            is_charging: false,
          },
        ]);
      }
      if (table === 'time_reports') {
        return makeBuilder([
          {
            id: 'tr1',
            staff_id: 's1',
            report_date: new Date().toISOString().slice(0, 10),
            start_time: '08:00:00',
            end_time: '16:00:00',
            hours_worked: 8,
            break_time: 30,
            description: 'Riggning',
            booking_id: 'b1',
            large_project_id: null,
            location_id: null,
            approved: false,
            is_subdivision: false,
            created_at: new Date().toISOString(),
          },
        ]);
      }
      if (table === 'bookings') {
        return makeBuilder([{ id: 'b1', client: 'Acme AB', booking_number: '1001' }]);
      }
      return makeBuilder([]);
    });
  });

  it('renders three tabs', () => {
    renderPage();
    expect(screen.getByRole('tab', { name: /Översikt/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Personal/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Att attestera/i })).toBeInTheDocument();
  });

  it('shows staff list and filters via search', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Personal/i }));
    await waitFor(() => expect(screen.getByText('Anna Andersson')).toBeInTheDocument());
    expect(screen.getByText('Björn Karlsson')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Sök personal…'), { target: { value: 'björn' } });
    await waitFor(() => expect(screen.queryByText('Anna Andersson')).not.toBeInTheDocument());
    expect(screen.getByText('Björn Karlsson')).toBeInTheDocument();
  });

  it('shows pending approvals tab with quick-approve button', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Att attestera/i }));
    await waitFor(() =>
      expect(screen.getAllByText('Anna Andersson').length).toBeGreaterThan(0),
    );
    expect(screen.getAllByRole('button', { name: /Godkänn/i }).length).toBeGreaterThan(0);
  });
});
