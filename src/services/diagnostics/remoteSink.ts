/**
 * Best-effort central sink for critical client crashes.
 *
 * Fail-silent by design: a crash report must never cause another crash and
 * must never block the UI. Only `critical` events are shipped, only when a
 * real Supabase session exists, and the payload carries no tokens.
 */

import type { DiagnosticEvent } from './diagnostics';

const MAX_REPORTS_PER_SESSION = 10;
let sent = 0;
const sentFingerprints = new Set<string>();

export function resetRemoteSinkForTests() {
  sent = 0;
  sentFingerprints.clear();
}

export async function shipCriticalDiagnostic(event: DiagnosticEvent): Promise<boolean> {
  if (event.severity !== 'critical') return false;
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
