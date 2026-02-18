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
  if (!isNativePlatform()) {
    return null;
  }

  try {
    const photo = await Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
    });

    if (!photo.path && !photo.webPath) return null;

    // Use webPath if available (already a usable URL), otherwise convert URI
    if (photo.webPath) {
      const response = await fetch(photo.webPath);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    // Fallback: convert file:// or content:// URI
    return await uriToBase64(photo.path!);
  } catch (err: any) {
    // User cancelled or permission denied – don't throw
    console.warn('Camera cancelled or failed:', err?.message);
    return null;
  }
}
