import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Smart Tillbaka:
 * 1. Om vi navigerats hit med `state.from` → gå dit explicit.
 * 2. Annars: om vi har en intern föregående entry (same-origin referrer
 *    eller en historylängd > 1 inom samma SPA-session) → history.back().
 * 3. Annars: navigera till `fallback`.
 *
 * Skriver aldrig till URL eller storage; rent navigations-hjälpverktyg.
 */
export function useSmartBack(fallback: string): () => void {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(() => {
    const fromState = (location.state as { from?: string } | null)?.from;
    if (typeof fromState === 'string' && fromState.length > 0) {
      navigate(fromState);
      return;
    }

    if (typeof window !== 'undefined') {
      const sameOriginReferrer =
        !!document.referrer &&
        (() => {
          try {
            return new URL(document.referrer).origin === window.location.origin;
          } catch {
            return false;
          }
        })();

      if (window.history.length > 1 && sameOriginReferrer) {
        navigate(-1);
        return;
      }
    }

    navigate(fallback);
  }, [navigate, location.state, fallback]);
}
