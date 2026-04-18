import { useCallback, useState } from 'react';
import type { StopBreakDecision } from '@/components/mobile-app/StopBreakDecisionDialog';

/**
 * Promise-baserad öppning av StopBreakDecisionDialog.
 *
 * Anrop:
 *   const { dialogProps, ask } = useStopBreakDecision();
 *   const decision = await ask({ passHours, context });
 *   if (decision === null) return; // användaren avbröt
 *
 * Renderar ENDAST tillstånd — själva <StopBreakDecisionDialog ... {...dialogProps} />
 * måste fortfarande monteras av komponenten som använder hooken.
 */
export function useStopBreakDecision() {
  const [open, setOpen] = useState(false);
  const [params, setParams] = useState<{ passHours: number; context?: string | null }>({ passHours: 0 });
  const [resolver, setResolver] = useState<((d: StopBreakDecision | null) => void) | null>(null);

  const ask = useCallback(
    (next: { passHours: number; context?: string | null }) =>
      new Promise<StopBreakDecision | null>((resolve) => {
        setParams(next);
        setResolver(() => resolve);
        setOpen(true);
      }),
    [],
  );

  const handleConfirm = useCallback(
    async (decision: StopBreakDecision) => {
      setOpen(false);
      resolver?.(decision);
      setResolver(null);
    },
    [resolver],
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next && resolver) {
        resolver(null); // user closed without choosing
        setResolver(null);
      }
    },
    [resolver],
  );

  return {
    ask,
    dialogProps: {
      open,
      onOpenChange: handleOpenChange,
      passHours: params.passHours,
      context: params.context ?? null,
      onConfirm: handleConfirm,
    },
  };
}
