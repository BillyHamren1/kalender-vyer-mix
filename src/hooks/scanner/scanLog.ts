/**
 * Debug logger for scanner events.
 * Enable by setting localStorage.setItem('SCAN_DEBUG', '1')
 */
const isDebug = (): boolean => {
  try {
    return localStorage.getItem('SCAN_DEBUG') === '1';
  } catch {
    return false;
  }
};

export const scanLog = (event: string, data?: unknown): void => {
  // Always log scan events to help debug production issues
  console.log(`[SCAN] ${event}`, data ?? '');
};
