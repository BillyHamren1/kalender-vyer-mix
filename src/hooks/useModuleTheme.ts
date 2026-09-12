import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { resolveModuleFromPath } from '@/lib/layout/moduleAccents';

/**
 * Route/context aware module accent scope.
 * Sets `data-module="planning" | "warehouse"` on <html> so the canonical
 * module tokens in src/styles/module-accents.css apply to the right views.
 *
 * Visual only — no routing, auth or business logic.
 */
export function useModuleTheme(): void {
  const { pathname } = useLocation();

  useEffect(() => {
    const key = resolveModuleFromPath(pathname);
    document.documentElement.setAttribute('data-module', key);

    // Keep the desktop module identity visible without changing the
    // standalone mobile Time routes or any internal planning keys.
    if (key === 'planning' && !pathname.startsWith('/m/')) {
      document.title = 'EventFlow Operations';
    }
  }, [pathname]);
}

export const ModuleThemeMount: React.FC = () => {
  useModuleTheme();
  return null;
};
