import { Capacitor } from '@capacitor/core';
import { Camera, CameraDirection, MediaTypeSelection } from '@capacitor/camera';
import { expectExternalActivity } from './externalActivity';

/**
 * Photo capture and selection.
 *
 * On Android/iOS the Capacitor Camera plugin opens the system camera or the system photo picker.
 * On the web build, a live preview comes from getUserMedia (see CameraView) and file selection
 * uses a file input. Callers get a Blob, or `null` when the user cancelled.
 */

export type CameraErrorKind = 'permission-denied' | 'unavailable' | 'failed';

export class CameraError extends Error {
  readonly kind: CameraErrorKind;
  constructor(kind: CameraErrorKind, message: string) {
    super(message);
    this.name = 'CameraError';
    this.kind = kind;
  }
}

export const isNativeCamera = (): boolean => Capacitor.isNativePlatform();

function isCancellation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /cancel/i.test(message);
}

async function blobFromWebPath(webPath: string | undefined): Promise<Blob> {
  if (!webPath) throw new CameraError('failed', 'The photo could not be read.');
  const response = await fetch(webPath);
  if (!response.ok) throw new CameraError('failed', 'The photo could not be read.');
  return response.blob();
}

/** Asks for camera access if needed. Throws CameraError('permission-denied') when refused. */
export async function ensureCameraPermission(): Promise<void> {
  if (!isNativeCamera()) return;
  let status = await Camera.checkPermissions();
  if (status.camera === 'granted' || status.camera === 'limited') return;
  status = await Camera.requestPermissions({ permissions: ['camera'] });
  if (status.camera !== 'granted' && status.camera !== 'limited') {
    throw new CameraError(
      'permission-denied',
      'Camera access is turned off. Allow it in Android Settings → Apps → Games → Permissions.',
    );
  }
}

export interface CaptureOptions {
  direction?: 'rear' | 'front';
  /** Longest edge in pixels; the plugin keeps the aspect ratio. */
  maxSize?: number;
}

/** Opens the device camera (native only). Resolves null if the user backs out. */
export async function takePhotoNative(options: CaptureOptions = {}): Promise<Blob | null> {
  if (!isNativeCamera()) throw new CameraError('unavailable', 'The system camera is only available in the app.');
  await ensureCameraPermission();
  try {
    expectExternalActivity();
    const result = await Camera.takePhoto({
      quality: 85,
      correctOrientation: true,
      targetWidth: options.maxSize ?? 2048,
      targetHeight: options.maxSize ?? 2048,
      cameraDirection: options.direction === 'front' ? CameraDirection.Front : CameraDirection.Rear,
      saveToGallery: false,
      editable: 'no',
    });
    return await blobFromWebPath(result.webPath);
  } catch (err) {
    if (isCancellation(err)) return null;
    if (err instanceof CameraError) throw err;
    const message = err instanceof Error ? err.message : 'The camera could not be opened.';
    if (/no camera|not available|unavailable/i.test(message)) throw new CameraError('unavailable', 'This device has no camera available.');
    throw new CameraError('failed', message);
  }
}

/** Opens the system photo picker (native only). Resolves null if the user backs out. */
export async function chooseFromGalleryNative(): Promise<Blob | null> {
  if (!isNativeCamera()) throw new CameraError('unavailable', 'The system photo picker is only available in the app.');
  try {
    expectExternalActivity();
    const { results } = await Camera.chooseFromGallery({
      mediaType: MediaTypeSelection.Photo,
      allowMultipleSelection: false,
      quality: 90,
      correctOrientation: true,
    });
    const first = results[0];
    if (!first) return null;
    return await blobFromWebPath(first.webPath);
  } catch (err) {
    if (isCancellation(err)) return null;
    if (err instanceof CameraError) throw err;
    throw new CameraError('failed', err instanceof Error ? err.message : 'The photo picker could not be opened.');
  }
}

/**
 * Web: opens a file chooser for one image. With `capture`, mobile browsers open the camera
 * directly. Resolves null when the chooser is dismissed.
 */
export function pickImageFileWeb(capture?: 'user' | 'environment'): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) input.setAttribute('capture', capture);
    input.style.display = 'none';
    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    document.body.appendChild(input);
    expectExternalActivity();
    input.click();
  });
}

/** Camera where possible: the system camera in the app, the capture file chooser on the web. */
export async function capturePhoto(options: CaptureOptions = {}): Promise<Blob | null> {
  if (isNativeCamera()) return takePhotoNative(options);
  return pickImageFileWeb(options.direction === 'front' ? 'user' : 'environment');
}

/** Photo library: the system picker in the app, a file chooser on the web. */
export async function choosePhoto(): Promise<Blob | null> {
  if (isNativeCamera()) return chooseFromGalleryNative();
  return pickImageFileWeb();
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not read the image.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image.'));
    reader.readAsDataURL(blob);
  });
}
