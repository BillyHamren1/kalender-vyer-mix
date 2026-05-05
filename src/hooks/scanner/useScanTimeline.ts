import { useSyncExternalStore } from 'react';
import { getScanTimeline, subscribeScanTimeline, ScanTimelineEntry } from './scanTimeline';

export const useScanTimeline = (): ScanTimelineEntry[] => {
  return useSyncExternalStore(subscribeScanTimeline, getScanTimeline, getScanTimeline);
};
