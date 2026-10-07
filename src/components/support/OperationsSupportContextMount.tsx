import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { installOperationsSupportContextProducer } from '@/lib/sso/supportContextProducer';

/** Installs the passive HUB request listener. The request path performs no I/O. */
export function OperationsSupportContextMount() {
  const { user, session } = useAuth();
  const userIdRef = useRef<string | null>(user?.id ?? null);
  const organizationIdRef = useRef<string | null>(
    session?.user.user_metadata?.organization_id ?? null,
  );
  userIdRef.current = user?.id ?? null;
  organizationIdRef.current = session?.user.user_metadata?.organization_id ?? null;

  useEffect(() => installOperationsSupportContextProducer({
    getAuth: () => ({
      userId: userIdRef.current,
      organizationId: organizationIdRef.current,
    }),
    getPathname: () => window.location.pathname,
  }), []);

  return null;
}
