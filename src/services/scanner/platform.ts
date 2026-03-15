/**
 * Platform detection utilities for scanner
 */

import { Capacitor } from '@capacitor/core';

export interface PlatformInfo {
  isCapacitor: boolean;
  isAndroid: boolean;
  isIos: boolean;
  isWeb: boolean;
  isZebraDevice: boolean;
  userAgent: string;
}

let cachedPlatform: PlatformInfo | null = null;

export function detectPlatform(): PlatformInfo {
  if (cachedPlatform) return cachedPlatform;

  const isCapacitor = Capacitor.isNativePlatform();
  const isAndroid = Capacitor.getPlatform() === 'android';
  const isIos = Capacitor.getPlatform() === 'ios';
  const isWeb = !isCapacitor;
  const ua = navigator.userAgent || '';

  // Zebra TC-series devices include "TC" in their build info
  // Also check for common Zebra identifiers
  const isZebraDevice = isAndroid && (
    /Zebra/i.test(ua) ||
    /TC[0-9]{2}/i.test(ua) ||
    /MC[0-9]{2}/i.test(ua) ||
    /EC[0-9]{2}/i.test(ua)
  );

  cachedPlatform = { isCapacitor, isAndroid, isIos, isWeb, isZebraDevice, userAgent: ua };
  return cachedPlatform;
}

/** Reset cached platform (for testing) */
export function resetPlatformCache(): void {
  cachedPlatform = null;
}
