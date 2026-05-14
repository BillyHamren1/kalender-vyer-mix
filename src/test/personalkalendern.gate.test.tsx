import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';

vi.mock('pdfjs-dist', () => ({ getDocument: () => ({}), GlobalWorkerOptions: {} }));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '' }));

// Mocka tunga sub-träd så vi bara verifierar att gate redirectar till login
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signOut: async () => ({ error: null }),
      signInWithPassword: async () => ({ error: null }),
    },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }),
  },
}));

vi.mock('@/services/mobileApiService', () => ({
  getToken: () => null,
  getStoredStaff: () => null,
  setAuth: () => {},
  clearAuth: () => {},
  mobileApi: { me: async () => ({ staff: null }), login: async () => ({ token: 't', staff: { id: '1', name: 'X' } }) },
}));

vi.mock('@/services/timerSyncQueue', () => ({ clearTimerSyncQueue: () => {} }));
vi.mock('@/hooks/useGeofencing', () => ({ clearLocalTimerSession: () => {} }));
vi.mock('@/services/viewAsStorage', () => ({
  getViewAs: () => null,
  setViewAs: () => {},
}));
vi.mock('@/config/appMode', () => ({ isScannerApp: false }));

import PersonalkalendernPage from '@/pages/PersonalkalendernPage';
import PersonalkalendernLogin from '@/pages/PersonalkalendernLogin';

describe('Personalkalendern — auth gate', () => {
  it('redirectar till /personalkalendern/login när ingen är inloggad', async () => {
    render(
      <MemoryRouter initialEntries={['/personalkalendern']}>
        <Routes>
          <Route path="/personalkalendern" element={<PersonalkalendernPage />} />
          <Route path="/personalkalendern/login" element={<PersonalkalendernLogin />} />
        </Routes>
      </MemoryRouter>
    );

    // Vänta tills login-sidan renderas
    expect(await screen.findByText(/Personalkalendern/i)).toBeInTheDocument();
    expect(await screen.findByText(/Logga in/i)).toBeInTheDocument();
  });
});
