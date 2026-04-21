/**
 * workDayAssistant.render.test.tsx
 * ─────────────────────────────────
 * Render-kontrakt för WorkDayAssistant. Verifierar att rätt UI-prompt visas
 * per AssistantDecision-kind. Vi mockar tunga beroenden (useWorkSession,
 * useMobileBookings, useMobileAuth, mobileApi, useNavigate) eftersom
 * komponentens enda jobb är att översätta `decision` → rätt dialog.
 *
 * Ingår i quality gate: nej (UI-render-test, körs separat). Manifestet
 * pekar bara på de kontraktstester som låser dataflödet — den här filen
 * skyddar att assistent-dialogerna FAKTISKT renderas korrekt.
 *
 * Källor:
 *   - src/components/mobile-app/WorkDayAssistant.tsx
 *   - src/lib/workDayDecisions.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// ─── Mocks ──────────────────────────────────────────────────────────
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));
vi.mock('@/hooks/useMobileData', () => ({
  useMobileBookings: () => ({ data: [] }),
}));
vi.mock('@/contexts/MobileAuthContext', () => ({
  useMobileAuth: () => ({ staff: { id: 'staff-1' } }),
}));
vi.mock('@/hooks/useWorkSession', () => ({
  useWorkSession: () => ({
    stopSession: vi.fn(async () => ({ saved: true, hoursWorked: 4 })),
    dialogs: null,
  }),
}));
vi.mock('@/services/mobileApiService', () => ({
  mobileApi: {
    createEndOfDayAnomaly: vi.fn(async () => ({ success: true })),
  },
}));
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  },
}));

import { WorkDayAssistant } from '@/components/mobile-app/WorkDayAssistant';
import type { AssistantDecision } from '@/lib/workDayDecisions';

const baseTimer = {
  startTime: '2026-04-18T08:00:00Z',
  client: 'Acme Eventbyrå',
  bookingId: 'b1',
  isStale: false,
  pendingSync: false,
} as any;

describe('WorkDayAssistant render contract', () => {
  beforeEach(() => cleanup());

  it('decision=null → ingen dialog renderas', () => {
    render(<WorkDayAssistant decision={null} onAcknowledge={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('daystart → "God morgon" + knapp till dagens jobb', () => {
    const d: AssistantDecision = {
      kind: 'daystart',
      firstSignalIso: '2026-04-18T07:00:00Z',
      arrivedAtWorkplace: true,
    };
    render(<WorkDayAssistant decision={d} onAcknowledge={() => {}} />);
    expect(screen.getByText(/God morgon/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Visa dagens jobb/i })).toBeInTheDocument();
  });

  it('long_pass_no_break → nämner "rast" och passets timmar (ingen auto-rast-formulering)', () => {
    const d: AssistantDecision = {
      kind: 'long_pass_no_break',
      timerKey: 'b1',
      timer: baseTimer,
      passHours: 6.5,
    };
    render(<WorkDayAssistant decision={d} onAcknowledge={() => {}} />);
    expect(screen.getAllByText(/rast/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/6\.5/)).toBeInTheDocument();
    // Säkerställ att vi INTE påstår att rast dragits automatiskt:
    expect(screen.queryByText(/dragit en rast automatiskt/i)).toBeNull();
    expect(screen.getByText(/drar ingen rast automatiskt/i)).toBeInTheDocument();
  });

  it('last_workplace_for_day → kvällsfråga + leder till "Avsluta dagen"', () => {
    const d: AssistantDecision = {
      kind: 'last_workplace_for_day',
      lastExitIso: '2026-04-18T18:00:00Z',
      locationName: 'Lager Stockholm',
    };
    render(<WorkDayAssistant decision={d} onAcknowledge={() => {}} />);
    expect(screen.getByText(/klar för dagen/i)).toBeInTheDocument();
    expect(screen.getByText(/Lager Stockholm/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Avsluta dagen/i })).toBeInTheDocument();
  });

  it('unclassified_anomaly → renderar ingen popup längre', () => {
    const d: AssistantDecision = {
      kind: 'unclassified_anomaly',
      count: 2,
      oldestStartedAtIso: '2026-04-18T12:00:00Z',
    };
    render(<WorkDayAssistant decision={d} onAcknowledge={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('activity_leave → öppnar ActivityLeaveDialog (inte vanlig fri-form-dialog)', () => {
    const d: AssistantDecision = {
      kind: 'activity_leave',
      timerKey: 'b1',
      timer: baseTimer,
      distanceMeters: 800,
      outsideSinceIso: '2026-04-18T11:00:00Z',
      outsideMinutes: 25,
    };
    render(<WorkDayAssistant decision={d} onAcknowledge={() => {}} />);
    // ActivityLeaveDialog renderar en dialog med stop / keep / anomaly
    expect(screen.getAllByRole('dialog').length).toBeGreaterThan(0);
  });
});
