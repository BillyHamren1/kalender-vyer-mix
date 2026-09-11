/**
 * Best-effort central sink for client errors.
 *
 * Everything at severity `error` or `critical` is shipped automatically so we
 * can see why the app crashed without asking the user for a code. Fail-silent
 * by design: reporting must never cause another crash or block the UI.
 * No tokens or secrets are included — the edge function redacts as well.
 */

import type { DiagnosticEvent } from './diagnostics';

const MAX_REPORTS_PER_SESSION = 25;
let sent = 0;
const sentFingerprints = new Set<string>();

export function shouldShipDiagnostic(event: Pick<DiagnosticEvent, 'severity'>): boolean {
  return event.severity === 'error' || event.severity === 'critical';
}

export function resetRemoteSinkForTests() {
  sent = 0;
  sentFingerprints.clear();
}

export async function shipCriticalDiagnostic(event: DiagnosticEvent): Promise<boolean> {
  if (!shouldShipDiagnostic(event)) return false;
  if (sent >= MAX_REPORTS_PER_SESSION) return false;
  if (sentFingerprints.has(event.fingerprint)) return false;

  sentFingerprints.add(event.fingerprint);
  sent += 1;

  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data } = await supabase.auth.getSession();
    if (!data.session) return false;

    await supabase.functions.invoke('report-diagnostic', {
      body: {
        code: event.code,
        source: event.source,
        severity: event.severity,
        message: event.message,
        route: event.route,
        platform: event.platform,
        appMode: event.appMode,
        fingerprint: event.fingerprint,
        metadata: event.metadata ?? {},
      },
    });
    return true;
  } catch {
    // Never let diagnostics reporting break the app.
    return false;
  }
}
