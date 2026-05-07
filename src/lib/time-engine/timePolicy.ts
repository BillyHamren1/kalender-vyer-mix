/**
 * Time Engine — Policy (frontend mirror)
 *
 * Speglar supabase/functions/_shared/time-engine/timePolicy.ts.
 * Håll filerna i synk för hand.
 *
 * Frontend behöver dessa värden för debug-paneler och förklaringstexter.
 * UI får INTE använda detta för att skapa tid — kontraktet
 * ActiveTimeRegistration.source = 'user_timer' gäller fortfarande.
 */
export {
  dayPolicy,
  nightPolicy,
  mapDenyToContractReason,
  evaluateAutoStart,
  classifyActiveSegment,
  isNightLocal,
  localHour,
} from '../../../supabase/functions/_shared/time-engine/timePolicy';

export type {
  DwellPolicy,
  NightPolicy,
  PolicyDecision,
  AutoStartAllowReason,
  AutoStartDenyReason,
  AutoStartReason,
  EvaluateAutoStartInput,
} from '../../../supabase/functions/_shared/time-engine/timePolicy';
