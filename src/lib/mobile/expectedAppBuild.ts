/**
 * Förväntad app-byggnad för Time-appen i fält.
 *
 * Används av GpsHealthDebugPanel + adminens debug-vyer för att visa en
 * tydlig "Gammal version"-badge när en användares telefon kör en äldre
 * build. Bumpas manuellt vid varje release.
 *
 * Format: numerisk sträng (matchar @capacitor/app `info.build`). Om
 * mobilbygget inte rapporterar något skickas null — då visar UI:t
 * "Version saknas — installera om appen".
 */
export const CURRENT_EXPECTED_APP_BUILD = '1';
export const CURRENT_EXPECTED_APP_VERSION = '1.0.0';

/**
 * Returnerar 'ok' | 'outdated' | 'missing'.
 * - missing  → ingen build alls rapporterad (väldigt gammal app eller web)
 * - outdated → rapporterad build är numeriskt mindre än förväntad
 * - ok       → rapporterad build är >= förväntad
 */
export function classifyAppBuild(
  reportedBuild: string | null | undefined,
): 'ok' | 'outdated' | 'missing' {
  if (!reportedBuild) return 'missing';
  const got = Number.parseInt(String(reportedBuild), 10);
  const want = Number.parseInt(CURRENT_EXPECTED_APP_BUILD, 10);
  if (!Number.isFinite(got) || !Number.isFinite(want)) return 'ok';
  return got >= want ? 'ok' : 'outdated';
}
