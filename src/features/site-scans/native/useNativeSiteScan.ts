import { useCallback, useMemo } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Native bridge to the SiteScan iOS module (ARKit-based measurement).
 *
 * The native side is registered as a Capacitor plugin called
 * "SiteScanMeasure" and is implemented in Swift under
 * `ios/App/App/SiteScanMeasure/SiteScanMeasurePlugin.swift`.
 *
 * On non-iOS platforms (Android / web preview) the plugin is unavailable
 * and `isAvailable` is false. Callers must show a fallback UI.
 */
export interface SiteScanLaunchOptions {
  /** Optional scan id to attach the measurement to. */
  scanId?: string;
  /** Optional booking id to tag the saved measurement with. */
  bookingId?: string;
  /** Optional title for the saved session. */
  title?: string;
}

export interface SiteScanLaunchResult {
  /** True if the user saved a measurement. */
  saved: boolean;
  /** Server-side scan id, if the native side synced one back. */
  scanId?: string;
}

interface SiteScanMeasurePlugin {
  /** Opens the native SwiftUI MeasureScreen. Resolves when the user closes it. */
  openMeasure(options: SiteScanLaunchOptions): Promise<SiteScanLaunchResult>;
}

const SiteScanMeasure = registerPlugin<SiteScanMeasurePlugin>('SiteScanMeasure');

export function useNativeSiteScan() {
  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();
  const isAvailable = useMemo(
    () => isNative && platform === 'ios' && Capacitor.isPluginAvailable('SiteScanMeasure'),
    [isNative, platform]
  );

  const openMeasure = useCallback(
    async (options: SiteScanLaunchOptions = {}): Promise<SiteScanLaunchResult> => {
      if (!isAvailable) {
        throw new Error('NATIVE_UNAVAILABLE');
      }
      return SiteScanMeasure.openMeasure(options);
    },
    [isAvailable]
  );

  return { isAvailable, platform, openMeasure };
}
