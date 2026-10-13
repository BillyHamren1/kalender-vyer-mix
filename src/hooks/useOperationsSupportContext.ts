import { useLayoutEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  isOperationsSupportEntityReady,
  registerLoadedOperationsSupportEntity,
  type OperationsSupportEntityKind,
} from '@/lib/sso/supportContextProducer';

export function useOperationsSupportContext(input: {
  kind: OperationsSupportEntityKind;
  entityId: string | null | undefined;
  entityOrganizationId: string | null | undefined;
  routeId: string | null | undefined;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  hasEntity: boolean;
}): void {
  const { user, isLoading: authLoading } = useAuth();
  const isContextReady = isOperationsSupportEntityReady({
    userId: user?.id,
    authLoading,
    isPending: input.isPending,
    isFetching: input.isFetching,
    isError: input.isError,
    hasEntity: input.hasEntity,
  });

  useLayoutEffect(() => registerLoadedOperationsSupportEntity({
    kind: input.kind,
    entityId: input.entityId,
    entityOrganizationId: input.entityOrganizationId,
    routeId: input.routeId,
    isContextReady,
  }), [
    input.kind,
    input.entityId,
    input.entityOrganizationId,
    input.routeId,
    isContextReady,
  ]);
}
