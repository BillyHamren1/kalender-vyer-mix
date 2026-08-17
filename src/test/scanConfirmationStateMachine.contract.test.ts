/**
 * SCANNER HARDENING – STEG 10: contract tests för scan confirmation state machine.
 */

import { describe, it, expect } from 'vitest';
import {
  deriveScanFeedback,
  feedbackEffects,
  feedbackForQueuedOperation,
  rejectionReasonText,
  resolveRejectionCode,
  isSuccessFeedback,
  SCAN_FEEDBACK_LABEL,
  REJECTION_REASON_TEXT,
} from '@/lib/scanner/scanFeedbackState';
import type { ScannerCommandResult } from '@/lib/scanner/commandTypes';

const OP = 'op-1';

describe('scan feedback state machine', () => {
  it('PENDING online → MOTTAGEN, ingen success', () => {
    const f = deriveScanFeedback({ operationId: OP, state: 'PENDING', online: true });
    expect(f.state).toBe('RECEIVED');
    expect(f.playSuccess).toBe(false);
    expect(feedbackEffects(f).sound).toBe('none');
  });

  it('PENDING offline → OFFLINE – VÄNTAR', () => {
    const f = deriveScanFeedback({ operationId: OP, state: 'PENDING', online: false });
    expect(f.state).toBe('OFFLINE_QUEUED');
    expect(f.label).toBe(SCAN_FEEDBACK_LABEL.OFFLINE_QUEUED);
    expect(feedbackEffects(f).color).toBe('amber');
  });

  it('SENDING → BEARBETAS', () => {
    const f = deriveScanFeedback({ operationId: OP, state: 'SENDING' });
    expect(f.state).toBe('PROCESSING');
    expect(f.playSuccess).toBe(false);
  });

  it('UNKNOWN (timeout) visas som osäker – aldrig misslyckad', () => {
    const f = deriveScanFeedback({ operationId: OP, state: 'UNKNOWN', online: true });
    expect(f.state).toBe('CHECKING');
    expect(f.label).toContain('Kontrollerar');
    expect(feedbackEffects(f).sound).toBe('none');
    expect(feedbackEffects(f).color).not.toBe('red');
  });

  it('COMMITTED → BEKRÄFTAD med success-signal', () => {
    const result: ScannerCommandResult = {
      status: 'accepted',
      operationId: OP,
      itemId: 'i1',
      packedQuantity: 3,
      requiredQuantity: 5,
    };
    const f = deriveScanFeedback({ operationId: OP, state: 'COMMITTED', result });
    expect(f.state).toBe('CONFIRMED');
    expect(f.playSuccess).toBe(true);
    expect(isSuccessFeedback(f.state)).toBe(true);
    expect(feedbackEffects(f)).toEqual({ sound: 'success', vibration: 'success', color: 'green' });
    expect(f.packedQuantity).toBe(3);
    expect(f.requiredQuantity).toBe(5);
  });

  it('ALREADY_COMMITTED (duplicate, samma operation_id) ger success', () => {
    const result: ScannerCommandResult = {
      status: 'duplicate',
      operationId: OP,
      replayed: true,
      packedQuantity: 3,
      requiredQuantity: 5,
    };
    const f = deriveScanFeedback({ operationId: OP, state: 'COMMITTED', result });
    expect(f.playSuccess).toBe(true);
    expect(f.detail).toBe('Redan registrerad');
  });

  it('generic duplicate utan replay-bevis ger aldrig success-signal', () => {
    const result: ScannerCommandResult = { status: 'duplicate', operationId: OP, replayed: false, packedQuantity: 3 };
    const f = deriveScanFeedback({ operationId: OP, state: 'COMMITTED', result });
    expect(f.playSuccess).toBe(false);
    expect(feedbackEffects(f).sound).toBe('none');
  });

  it('COMMITTED utan explicit result/operation_id ger aldrig success-signal', () => {
    const f = deriveScanFeedback({ operationId: OP, state: 'COMMITTED', result: null });
    expect(f.playSuccess).toBe(false);
  });

  it('COMMITTED med ANNAT operation_id ger INTE success-signal', () => {
    const result: ScannerCommandResult = { status: 'accepted', operationId: 'other-op' };
    const f = deriveScanFeedback({ operationId: OP, state: 'COMMITTED', result });
    expect(f.playSuccess).toBe(false);
    expect(feedbackEffects(f).sound).toBe('none');
  });

  it('inget annat state än CONFIRMED får success-effekt', () => {
    (['PENDING', 'SENDING', 'UNKNOWN', 'REJECTED'] as const).forEach((s) => {
      const f = deriveScanFeedback({ operationId: OP, state: s });
      expect(f.playSuccess).toBe(false);
      expect(feedbackEffects(f).sound).not.toBe('success');
    });
  });
});

describe('rejection reason codes', () => {
  const cases: Array<[string, string]> = [
    ['WRONG_BOOKING', 'Fel bokning'],
    ['OVER_CAPACITY', 'Fullpackad – inget ändrat'],
    ['INSTANCE_ALLOCATED_ELSEWHERE', 'Exemplaret används redan på annan bokning'],
    ['AMBIGUOUS_SERIAL', 'Serienumret är inte unikt – ingen ändring gjord'],
    ['UNKNOWN_PRODUCT', 'Artikeln finns inte på packlistan – ingen ändring gjord'],
  ];

  it.each(cases)('%s översätts korrekt', (code, text) => {
    const f = deriveScanFeedback({
      operationId: OP,
      state: 'REJECTED',
      result: { status: 'rejected', operationId: OP, debugCode: code },
    });
    expect(f.state).toBe('REJECTED');
    expect(f.rejectionCode).toBe(code);
    expect(f.detail).toBe(text);
    expect(REJECTION_REASON_TEXT[code as keyof typeof REJECTION_REASON_TEXT]).toBe(text);
  });

  it('status wrong_booking/over_capacity/not_found mappas utan debugCode', () => {
    expect(resolveRejectionCode({ status: 'wrong_booking' } as any)).toBe('WRONG_BOOKING');
    expect(resolveRejectionCode({ status: 'over_capacity' } as any)).toBe('OVER_CAPACITY');
    expect(resolveRejectionCode({ status: 'not_found' } as any)).toBe('UNKNOWN_PRODUCT');
  });

  it('okänd reason faller tillbaka på neutral text utan att påstå ändring', () => {
    expect(rejectionReasonText({ status: 'rejected' } as any)).toContain('ingen ändring gjord');
  });
});

describe('inga optimistiska kvantiteter', () => {
  it('icke-bekräftade states visar endast senast serverbekräftade värden', () => {
    (['PENDING', 'SENDING', 'UNKNOWN'] as const).forEach((s) => {
      const f = deriveScanFeedback({
        operationId: OP,
        state: s,
        confirmedPacked: 2,
        confirmedRequired: 5,
        result: { status: 'accepted', operationId: OP, packedQuantity: 99, requiredQuantity: 5 },
      });
      expect(f.packedQuantity).toBe(2);
      expect(f.requiredQuantity).toBe(5);
    });
  });

  it('REJECTED lämnar bekräftad kvantitet oförändrad', () => {
    const f = deriveScanFeedback({
      operationId: OP,
      state: 'REJECTED',
      confirmedPacked: 4,
      confirmedRequired: 4,
      result: { status: 'over_capacity', operationId: OP },
    });
    expect(f.packedQuantity).toBe(4);
    expect(f.requiredQuantity).toBe(4);
  });
});

describe('feedbackForQueuedOperation', () => {
  it('mappar köad operation till feedback', () => {
    const f = feedbackForQueuedOperation(
      { operation_id: OP, state: 'UNKNOWN', result: null },
      { online: true, confirmedPacked: 1, confirmedRequired: 3 },
    );
    expect(f.state).toBe('CHECKING');
    expect(f.packedQuantity).toBe(1);
  });
});
