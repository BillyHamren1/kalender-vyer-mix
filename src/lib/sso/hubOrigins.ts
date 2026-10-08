const HUB_ALLOWED_ORIGINS = new Set([
  'https://e-flow.se',
  'https://www.e-flow.se',
  'https://eventflow-harmony-hub.lovable.app',
  'https://id-preview--619bc35d-e2d6-4874-822e-21a151f48315.lovable.app',
  'https://619bc35d-e2d6-4874-822e-21a151f48315.lovableproject.com',
  'http://localhost:5173',
  'http://localhost:8080',
  'http://localhost:3000',
]);

/** The shared exact-origin allowlist used by both established SSO and support context. */
export function isAllowedHubOrigin(origin: string | null | undefined): origin is string {
  return typeof origin === 'string' && HUB_ALLOWED_ORIGINS.has(origin);
}
