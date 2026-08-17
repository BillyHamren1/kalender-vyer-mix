/**
 * SCANNER HARDENING – STEG 10: scan confirmation state machine (UI-feedback).
 *
 * Regler (låsta av scanConfirmationStateMachine.contract.test.ts):
 * - Grönt / success-ljud / success-vibration ENDAST vid COMMITTED eller
 *   ALREADY_COMMITTED (replay av exakt samma operation_id).
 * - Timeout/nätfel visas ALDRIG som definitivt misslyckad → CHECKING.
 * - UI får aldrig höja packed quantity optimistiskt. Endast senaste
 *   serverbekräftade packed/required visas.
 * - Rejection reason codes översätts till tydlig svensk text.
 */

import { isAcceptedResult, type ScannerCommandResult } from './commandTypes';
import type { OperationState, QueuedOperation } from './operationQueueTypes';

export type ScanFeedbackState =
  | 'RECEIVED' // MOTTAGEN
  | 'PROCESSING' // BEARBETAS
  | 'CONFIRMED' // BEKRÄFTAD
  | 'REJECTED' // AVVISAD
  | 'OFFLINE_QUEUED' // OFFLINE – VÄNTAR
  | 'CHECKING'; // OSÄKER – KONTROLLERAR

export type ScanFeedbackTone = 'neutral' | 'progress' | 'success' | 'error' | 'warning';

export const SCAN_FEEDBACK_LABEL: Record<ScanFeedbackState, string> = {
  RECEIVED: 'Mottagen',
  PROCESSING: 'Bearbetas…',
  CONFIRMED: 'Bekräftad',
  REJECTED: 'Avvisad',
  OFFLINE_QUEUED: 'Offline – väntar',
  CHECKING: 'Kontrollerar scan…',
};

export const SCAN_FEEDBACK_TONE: Record<ScanFeedbackState, ScanFeedbackTone> = {
  RECEIVED: 'neutral',
  PROCESSING: 'progress',
  CONFIRMED: 'success',
  REJECTED: 'error',
  OFFLINE_QUEUED: 'warning',
  CHECKING: 'warning',
};

/** Enda states som får ge grönt/success-ljud/vibration. */
export const isSuccessFeedback = (s: ScanFeedbackState): boolean => s === 'CONFIRMED';

export type ScanRejectionCode =
  | 'WRONG_BOOKING'
  | 'OVER_CAPACITY'
  | 'INSTANCE_ALLOCATED_ELSEWHERE'
  | 'AMBIGUOUS_SERIAL'
  | 'UNKNOWN_PRODUCT';

export const REJECTION_REASON_TEXT: Record<ScanRejectionCode, string> = {
  WRONG_BOOKING: 'Fel bokning',
  OVER_CAPACITY: 'Fullpackad – inget ändrat',
  INSTANCE_ALLOCATED_ELSEWHERE: 'Exemplaret används redan på annan bokning',
  AMBIGUOUS_SERIAL: 'Serienumret är inte unikt – ingen ändring gjord',
  UNKNOWN_PRODUCT: 'Artikeln finns inte på packlistan – ingen ändring gjord',
};

const STATUS_TO_CODE: Record<string, ScanRejectionCode> = {
  wrong_booking: 'WRONG_BOOKING',
  over_capacity: 'OVER_CAPACITY',
  not_found: 'UNKNOWN_PRODUCT',
};

export const resolveRejectionCode = (
  result: Pick<ScannerCommandResult, 'status' | 'debugCode'> | null | undefined,
): ScanRejectionCode | null => {
  if (!result) return null;
  const raw = (result.debugCode ?? '').toString().trim().toUpperCase();
  if (raw && raw in REJECTION_REASON_TEXT) return raw as ScanRejectionCode;
  const byStatus = STATUS_TO_CODE[String(result.status ?? '').toLowerCase()];
  return byStatus ?? null;
};

export const rejectionReasonText = (
  result: Pick<ScannerCommandResult, 'status' | 'debugCode' | 'message'> | null | undefined,
): string => {
  const code = resolveRejectionCode(result);
  if (code) return REJECTION_REASON_TEXT[code];
  return result?.message?.trim() || 'Avvisad – ingen ändring gjord';
};

export interface ScanFeedback {
  operationId: string;
  state: ScanFeedbackState;
  label: string;
  tone: ScanFeedbackTone;
  detail: string | null;
  rejectionCode: ScanRejectionCode | null;
  /** Grönt/ljud/vibration får endast spelas när denna är true. */
  playSuccess: boolean;
  /** Serverbekräftad state — aldrig optimistisk. */
  packedQuantity: number | null;
  requiredQuantity: number | null;
}

export interface FeedbackInput {
  operationId: string;
  state: OperationState;
  online?: boolean;
  result?: ScannerCommandResult | null;
  /** Senast serverbekräftade värden för raden (ej optimistiska). */
  confirmedPacked?: number | null;
  confirmedRequired?: number | null;
}

/**
 * Deriverar UI-feedback ur operationens state. Ren funktion.
 *
 * PENDING + offline → OFFLINE_QUEUED, PENDING + online → RECEIVED,
 * SENDING → PROCESSING, UNKNOWN → CHECKING (aldrig fel),
 * COMMITTED → CONFIRMED (endast för samma operation_id),
 * REJECTED → REJECTED med översatt reason code.
 */
export const deriveScanFeedback = (input: FeedbackInput): ScanFeedback => {
  const { operationId, state, result } = input;
  const online = input.online !== false;

  let feedbackState: ScanFeedbackState;
  let detail: string | null = null;
  let rejectionCode: ScanRejectionCode | null = null;

  switch (state) {
    case 'PENDING':
      feedbackState = online ? 'RECEIVED' : 'OFFLINE_QUEUED';
      detail = online ? null : 'Skickas när uppkopplingen är tillbaka';
      break;
    case 'SENDING':
      feedbackState = 'PROCESSING';
      break;
    case 'UNKNOWN':
      // Timeout får ALDRIG visas som definitivt misslyckad.
      feedbackState = online ? 'CHECKING' : 'OFFLINE_QUEUED';
      detail = online
        ? 'Svar uteblev – kontrollerar om den redan registrerats'
        : 'Skickas när uppkopplingen är tillbaka';
      break;
    case 'COMMITTED':
      feedbackState = 'CONFIRMED';
      break;
    case 'REJECTED':
      feedbackState = 'REJECTED';
      rejectionCode = resolveRejectionCode(result);
      detail = rejectionReasonText(result);
      break;
    default:
      feedbackState = 'CHECKING';
  }

  // Success endast när WMS bekräftat exakt denna operation_id. Ett malformed
  // COMMITTED-state utan operationId/resultat, eller en generisk duplicate utan
  // replay-bevis, får aldrig ge grönt ljud/vibration.
  const exactOperation = Boolean(result?.operationId) && result?.operationId === operationId;
  const playSuccess = feedbackState === 'CONFIRMED' && exactOperation && Boolean(result && isAcceptedResult(result));

  if (feedbackState === 'CONFIRMED' && result?.status === 'duplicate' && result.replayed === true) {
    detail = 'Redan registrerad';
  }

  const packed =
    typeof result?.packedQuantity === 'number' && feedbackState === 'CONFIRMED'
      ? result.packedQuantity
      : input.confirmedPacked ?? null;
  const required =
    typeof result?.requiredQuantity === 'number' && feedbackState === 'CONFIRMED'
      ? result.requiredQuantity
      : input.confirmedRequired ?? null;

  return {
    operationId,
    state: feedbackState,
    label: SCAN_FEEDBACK_LABEL[feedbackState],
    tone: SCAN_FEEDBACK_TONE[feedbackState],
    detail,
    rejectionCode,
    playSuccess,
    packedQuantity: packed,
    requiredQuantity: required,
  };
};

export const feedbackForQueuedOperation = (
  op: Pick<QueuedOperation, 'operation_id' | 'state' | 'result'>,
  opts: { online?: boolean; confirmedPacked?: number | null; confirmedRequired?: number | null } = {},
): ScanFeedback =>
  deriveScanFeedback({
    operationId: op.operation_id,
    state: op.state,
    result: (op.result as ScannerCommandResult | null) ?? null,
    online: opts.online,
    confirmedPacked: opts.confirmedPacked,
    confirmedRequired: opts.confirmedRequired,
  });

/**
 * Effekt-kontrakt: vilka fysiska signaler som får ges.
 * Ingen success-signal utanför CONFIRMED.
 */
export interface ScanFeedbackEffects {
  sound: 'success' | 'error' | 'none';
  vibration: 'success' | 'error' | 'none';
  color: 'green' | 'red' | 'amber' | 'muted' | 'blue';
}

export const feedbackEffects = (f: ScanFeedback): ScanFeedbackEffects => {
  if (f.state === 'CONFIRMED' && f.playSuccess) {
    return { sound: 'success', vibration: 'success', color: 'green' };
  }
  if (f.state === 'REJECTED') {
    return { sound: 'error', vibration: 'error', color: 'red' };
  }
  if (f.state === 'OFFLINE_QUEUED' || f.state === 'CHECKING') {
    return { sound: 'none', vibration: 'none', color: 'amber' };
  }
  if (f.state === 'PROCESSING') {
    return { sound: 'none', vibration: 'none', color: 'blue' };
  }
  return { sound: 'none', vibration: 'none', color: 'muted' };
};
