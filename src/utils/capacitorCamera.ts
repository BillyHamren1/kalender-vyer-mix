import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Converts a file URI (content:// or file://) to a base64 data URL.
 * This is needed because on Android, Camera returns a URI after the
 * activity restarts, and we need to read the file content manually.
 */
async function uriToBase64(uri: string): Promise<string> {
  const response = await fetch(Capacitor.convertFileSrc(uri));
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Takes a photo using Capacitor Camera plugin on native platforms,
 * returns null on web so the caller can fall back to a file input.
 *
 * Uses CameraResultType.Uri instead of Base64 to avoid Android activity
 * restart crashes that occur when large base64 data is passed through
 * the Capacitor bridge.
 */
export async function takePhotoBase64(): Promise<string | null> {
  const isNative = isNativePlatform();
  console.log('[Camera] isNativePlatform:', isNative);

  if (!isNative) {
    console.log('[Camera] Web platform – returning null for file input fallback');
    return null;
  }

  try {
    console.log('[Camera] Calling Camera.getPhoto()...');
    const photo = await Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
    });

    console.log('[Camera] Camera.getPhoto() returned:', {
      path: photo.path,
      webPath: photo.webPath,
      format: photo.format,
    });

    if (!photo.path && !photo.webPath) {
      console.warn('[Camera] Both path and webPath are null/undefined – returning null');
      return null;
    }

    // Use webPath if available (already a usable URL), otherwise convert URI
    if (photo.webPath) {
      console.log('[Camera] Fetching webPath:', photo.webPath);
      const response = await fetch(photo.webPath);
      console.log('[Camera] fetch() status:', response.status, response.ok);
      const blob = await response.blob();
      console.log('[Camera] blob size:', blob.size, 'type:', blob.type);
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          console.log('[Camera] FileReader done – base64 length:', result?.length);
          resolve(result);
        };
        reader.onerror = (e) => {
          console.error('[Camera] FileReader error:', e);
          reject(e);
        };
        reader.readAsDataURL(blob);
      });
    }

    // Fallback: convert file:// or content:// URI
    console.log('[Camera] Using uriToBase64 fallback with path:', photo.path);
    return await uriToBase64(photo.path!);
  } catch (err: any) {
    console.error('[Camera] CRASH/ERROR in takePhotoBase64:', err);
    console.error('[Camera] Error name:', err?.name);
    console.error('[Camera] Error message:', err?.message);
    console.error('[Camera] Error code:', err?.code);
    console.error('[Camera] Full error object:', JSON.stringify(err, null, 2));
    return null;
  }
}
