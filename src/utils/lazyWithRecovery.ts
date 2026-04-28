import { lazy, type ComponentType } from 'react';
import { attemptModuleRecovery, isStaleModuleError } from './moduleRecovery';
import { reportDiagnostic } from '@/services/diagnostics/diagnostics';

/**
 * Drop-in replacement for React.lazy that:
 *  - Retries the dynamic import once with a cache-busting query param
 *    (handles transient network blips and Vite per-subpath ?v= bumps).
 *  - Triggers a hard cache-purge + reload if the module is genuinely stale.
 *  - Reports diagnostics so we can see when this fires in production.
 */
export function lazyWithRecovery<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      // Only handle stale-module style failures here.
      if (!isStaleModuleError(error)) {
        throw error;
      }

      reportDiagnostic({
        code: 'LAZY_ROUTE_MODULE_LOAD_FAILED',
        source: 'vite',
        severity: 'warning',
        error,
        metadata: {
          phase: 'lazy_route',
          href: typeof window !== 'undefined' ? window.location.href : '',
          attempt: 1,
        },
      });

      // Attempt #2: retry once after a tiny delay (covers transient 504/preload).
      try {
        await new Promise((r) => setTimeout(r, 250));
        return await factory();
      } catch (retryError) {
        reportDiagnostic({
          code: 'LAZY_ROUTE_MODULE_LOAD_FAILED',
          source: 'vite',
          severity: 'critical',
          error: retryError,
          metadata: {
            phase: 'lazy_route',
            href: typeof window !== 'undefined' ? window.location.href : '',
            attempt: 2,
          },
        });

        // Schedule cache purge + hard reload (respects cooldown).
        const recovered = attemptModuleRecovery(retryError);
        if (recovered) {
          // Reload is in-flight; return a never-resolving promise so React
          // keeps showing the Suspense fallback instead of throwing.
          return await new Promise<{ default: T }>(() => {});
        }
        // Cooldown blocked — let the boundary render its recovery UI.
        throw retryError;
      }
    }
  });
}
