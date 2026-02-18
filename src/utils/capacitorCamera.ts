import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

function isNativePlatform(): boolean {
  return (
    typeof (window as any).Capacitor !== 'undefined' &&
    (window as any).Capacitor.isNativePlatform?.() === true
  );
}

/**
 * Takes a photo using Capacitor Camera plugin on native platforms,
 * returns null on web so the caller can fall back to a file input.
 */
export async function takePhotoBase64(): Promise<string | null> {
  if (!isNativePlatform()) {
    return null;
  }

  try {
    const photo = await Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Camera,
    });

    if (!photo.base64String) return null;
    return `data:image/jpeg;base64,${photo.base64String}`;
  } catch (err: any) {
    // User cancelled or permission denied – don't throw
    console.warn('Camera cancelled or failed:', err?.message);
    return null;
  }
}
