import { useState, useRef, useCallback } from 'react';

export interface ScanResult {
  value: string;
  result: string;
  success: boolean;
  productName?: string;
  isMinusScan?: boolean;
}

export const useScanFeedback = () => {
  const [lastScanResult, setLastScanResult] = useState<ScanResult | null>(null);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const highlightRow = useCallback((itemId: string) => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedItemId(itemId);
    highlightTimerRef.current = setTimeout(() => setHighlightedItemId(null), 1500);
  }, []);

  const setScanResult = useCallback((result: ScanResult) => {
    setLastScanResult(result);
  }, []);

  // Cleanup on unmount handled by the component using this hook
  const cleanup = useCallback(() => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
  }, []);

  return {
    lastScanResult,
    highlightedItemId,
    setScanResult,
    highlightRow,
    cleanup,
  };
};
