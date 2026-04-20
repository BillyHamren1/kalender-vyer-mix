/**
 * UnifiedArrivalPrompt — parity contract.
 *
 * The unified arrival prompt MUST behave identically regardless of
 * whether the user arrived at:
 *   • a fixed location (Lager / kontor)
 *   • a stort projekt
 *   • a vanlig bokning
 *
 * Same buttons, same copy, same start-time payload. Only the leading
 * icon and the displayed label may differ.
 *
 * If any of these tests fail it means the three target kinds have started
 * to diverge again — fix it before the next workday.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { UnifiedArrivalPrompt } from '@/components/mobile-app/UnifiedArrivalPrompt';
import type { ArrivalTarget } from '@/types/arrivalTarget';

const ARRIVED_AT = '2026-04-20T06:30:00.000Z';

const TARGETS: Record<string, ArrivalTarget> = {
  location: { kind: 'location', target_id: 'loc-1', label: 'Lager Stockholm', arrived_at: ARRIVED_AT, address: 'Lagervägen 1' },
  project:  { kind: 'project',  target_id: 'prj-1', label: 'Projekt Almedalen',  arrived_at: ARRIVED_AT, address: 'Visby hamn' },
  booking:  { kind: 'booking',  target_id: 'bkg-1', label: 'Kund AB',           arrived_at: ARRIVED_AT, address: 'Kundgatan 5' },
};

function renderFor(target: ArrivalTarget, handlers: { onConfirm?: any; onDismiss?: any } = {}) {
  const onConfirm = handlers.onConfirm ?? vi.fn().mockResolvedValue(undefined);
  const onDismiss = handlers.onDismiss ?? vi.fn().mockResolvedValue(undefined);
  render(
    <UnifiedArrivalPrompt
      open
      onOpenChange={() => {}}
      target={target}
      onConfirm={onConfirm}
      onDismiss={onDismiss}
    />
  );
  return { onConfirm, onDismiss };
}

describe('UnifiedArrivalPrompt parity (location/project/booking)', () => {
  beforeEach(() => cleanup());

  for (const kind of ['location', 'project', 'booking'] as const) {
    describe(`kind=${kind}`, () => {
      it('renders the same four CTA controls', () => {
        renderFor(TARGETS[kind]);
        expect(screen.getByTestId('arrival-start-from-arrival')).toBeInTheDocument();
        expect(screen.getByTestId('arrival-start-now')).toBeInTheDocument();
        expect(screen.getByTestId('arrival-dismiss')).toBeInTheDocument();
        expect(screen.getByTestId('arrival-show-custom')).toBeInTheDocument();
      });

      it('shows the target label in the dialog', () => {
        renderFor(TARGETS[kind]);
        expect(screen.getByText(TARGETS[kind].label)).toBeInTheDocument();
      });

      it('"Starta från arrival" sends arrived_at with usedSuggestedArrival=true', async () => {
        const { onConfirm } = renderFor(TARGETS[kind]);
        fireEvent.click(screen.getByTestId('arrival-start-from-arrival'));
        // Wait a tick for the async handler.
        await Promise.resolve();
        expect(onConfirm).toHaveBeenCalledTimes(1);
        const arg = onConfirm.mock.calls[0][0];
        expect(arg.startedAtIso).toBe(ARRIVED_AT);
        expect(arg.usedSuggestedArrival).toBe(true);
      });

      it('"Starta nu" sends a "now" timestamp with usedSuggestedArrival=false', async () => {
        const { onConfirm } = renderFor(TARGETS[kind]);
        const before = Date.now();
        fireEvent.click(screen.getByTestId('arrival-start-now'));
        await Promise.resolve();
        const after = Date.now();
        expect(onConfirm).toHaveBeenCalledTimes(1);
        const arg = onConfirm.mock.calls[0][0];
        expect(arg.usedSuggestedArrival).toBe(false);
        const ts = new Date(arg.startedAtIso).getTime();
        expect(ts).toBeGreaterThanOrEqual(before);
        expect(ts).toBeLessThanOrEqual(after);
        // crucially: NOT the arrival timestamp
        expect(arg.startedAtIso).not.toBe(ARRIVED_AT);
      });

      it('"Inte nu" calls onDismiss and never calls onConfirm', async () => {
        const { onConfirm, onDismiss } = renderFor(TARGETS[kind]);
        fireEvent.click(screen.getByTestId('arrival-dismiss'));
        await Promise.resolve();
        expect(onDismiss).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
      });

      it('"Anpassa tid" reveals a time picker that submits a custom past time', async () => {
        const { onConfirm } = renderFor(TARGETS[kind]);
        fireEvent.click(screen.getByTestId('arrival-show-custom'));
        // Picker is now visible; default is the arrival time. Override it.
        const input = screen.getByLabelText('Egen starttid') as HTMLInputElement;
        // Pick a time clearly in the past relative to "now" to avoid the
        // future-rejection guard. We use 00:01 anchored to arrival's day —
        // safe because tests run well after 2026-04-20.
        fireEvent.change(input, { target: { value: '00:01' } });
        fireEvent.click(screen.getByTestId('arrival-submit-custom'));
        await Promise.resolve();
        expect(onConfirm).toHaveBeenCalledTimes(1);
        const arg = onConfirm.mock.calls[0][0];
        expect(arg.usedSuggestedArrival).toBe(false);
        expect(arg.startedAtIso).not.toBe(ARRIVED_AT);
      });
    });
  }

  it('produces the SAME CTA structure for all three kinds', () => {
    const captureCtas = (target: ArrivalTarget) => {
      cleanup();
      renderFor(target);
      return [
        !!screen.queryByTestId('arrival-start-from-arrival'),
        !!screen.queryByTestId('arrival-start-now'),
        !!screen.queryByTestId('arrival-dismiss'),
        !!screen.queryByTestId('arrival-show-custom'),
      ];
    };
    const loc = captureCtas(TARGETS.location);
    const prj = captureCtas(TARGETS.project);
    const bkg = captureCtas(TARGETS.booking);
    expect(loc).toEqual([true, true, true, true]);
    expect(prj).toEqual(loc);
    expect(bkg).toEqual(loc);
  });
});
