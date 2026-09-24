import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, ArrowLeft, Send, Image as ImageIcon, Download, RotateCcw, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { uploadGalleryMedia } from '../../lib/storageHelper';
import { mockBackend } from '../../lib/mockBackend';
import {
  CameraError,
  blobToDataUrl,
  choosePhoto,
  isNativeCamera,
  takePhotoNative,
} from '../../lib/nativeCamera';
import { useBackHandler } from '../../lib/backButton';

interface CameraViewProps {
  onSendToChat?: (imageUrl: string) => void;
  onSavedToGallery?: () => void;
}

type Facing = 'user' | 'environment';

type PreviewState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'live' }
  | { status: 'error'; message: string; permissionDenied: boolean };

function describeMediaError(err: unknown): { message: string; permissionDenied: boolean } {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return { message: 'Camera access was blocked. Allow camera access for this site and try again.', permissionDenied: true };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return { message: 'No camera was found on this device.', permissionDenied: false };
  }
  if (name === 'NotReadableError') {
    return { message: 'The camera is being used by another app. Close it and try again.', permissionDenied: false };
  }
  return { message: 'The camera could not be started.', permissionDenied: false };
}

export const CameraView: React.FC<CameraViewProps> = ({ onSendToChat, onSavedToGallery }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const native = isNativeCamera();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const autoOpenedRef = useRef(false);

  const [facing, setFacing] = useState<Facing>('environment');
  const [preview, setPreview] = useState<PreviewState>({ status: native ? 'idle' : 'starting' });
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [capturedMedia, setCapturedMedia] = useState<string | null>(null);
  const [isOpeningCamera, setIsOpeningCamera] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [caption, setCaption] = useState('');

  // ---------- Web: live preview through getUserMedia ----------
  // The <video> element is always mounted, so the stream can be attached as soon as it exists.
  // (Mounting it only after the stream was live meant the ref was null, the preview never
  // started and the shutter fell back to the file picker.)
  useEffect(() => {
    if (native || capturedMedia) return;
    let cancelled = false;
    const video = videoRef.current;

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPreview({ status: 'error', message: 'This browser does not support the camera.', permissionDenied: false });
        return;
      }
      setPreview({ status: 'starting' });
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        if (!cancelled) setPreview({ status: 'live' });
      } catch (err) {
        if (cancelled) return;
        console.warn('[camera] preview failed', err);
        setPreview({ status: 'error', ...describeMediaError(err) });
      }
    };

    start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      if (video) video.srcObject = null;
    };
  }, [native, facing, capturedMedia, previewAttempt]);

  // ---------- Native: system camera through the Capacitor Camera plugin ----------
  const openNativeCamera = useCallback(async () => {
    setIsOpeningCamera(true);
    try {
      const blob = await takePhotoNative({ direction: facing === 'user' ? 'front' : 'rear' });
      if (blob) {
        setCapturedMedia(await blobToDataUrl(blob));
        setPreview({ status: 'idle' });
      }
    } catch (err) {
      if (err instanceof CameraError) {
        setPreview({ status: 'error', message: err.message, permissionDenied: err.kind === 'permission-denied' });
      } else {
        setPreview({ status: 'error', message: 'The camera could not be opened.', permissionDenied: false });
      }
    } finally {
      setIsOpeningCamera(false);
    }
  }, [facing]);

  // Opening the Camera tab in the app goes straight to the camera, once per visit.
  useEffect(() => {
    if (!native || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    openNativeCamera();
  }, [native, openNativeCamera]);

  const captureFromPreview = () => {
    const video = videoRef.current;
    if (!video || preview.status !== 'live' || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      showToast('Could not capture the photo', 'error');
      return;
    }
    if (facing === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCapturedMedia(canvas.toDataURL('image/jpeg', 0.9));
  };

  const handleShutter = () => {
    if (native) openNativeCamera();
    else captureFromPreview();
  };

  const handleChooseFromLibrary = async () => {
    try {
      const blob = await choosePhoto();
      if (blob) setCapturedMedia(await blobToDataUrl(blob));
    } catch (err) {
      console.error('[camera] photo picker failed', err);
      showToast(err instanceof Error ? err.message : 'Could not open your photos', 'error');
    }
  };

  const discardCapture = () => {
    setCapturedMedia(null);
    setCaption('');
  };

  const saveCapture = async (defaultCaption: string): Promise<boolean> => {
    if (!capturedMedia || !user) return false;
    setIsProcessing(true);
    try {
      if (isSupabaseConfigured()) {
        const { publicUrl, filePath } = await uploadGalleryMedia(capturedMedia, user.id, 'jpg');
        const { error } = await supabase.from('gallery_items').insert({
          user_id: user.id,
          image_url: publicUrl,
          storage_path: filePath,
          caption: caption.trim() || defaultCaption,
        } as unknown as { user_id: string; image_url: string; storage_path: string; caption: string });
        if (error) throw error;
      } else {
        mockBackend.uploadGalleryItem(user.id, capturedMedia, caption.trim() || defaultCaption);
      }
      discardCapture();
      return true;
    } catch (err) {
      console.error('[camera] save failed', err);
      showToast('The photo could not be saved. Try again.', 'error');
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveToGallery = async () => {
    if (await saveCapture('Photo')) {
      showToast('Saved to Gallery', 'success');
      onSavedToGallery?.();
    }
  };

  const handleSend = () => {
    if (!capturedMedia) return;
    if (!onSendToChat) {
      showToast('Open a chat first', 'info');
      return;
    }
    onSendToChat(capturedMedia);
    discardCapture();
  };

  useBackHandler(Boolean(capturedMedia), discardCapture);

  // ---------- Review a real capture ----------
  if (capturedMedia) {
    return (
      <div className="flex-1 flex flex-col h-full bg-black select-none relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 z-20 p-4 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between">
          <button type="button" onClick={discardCapture} className="ib ib-s rounded-full" aria-label="Discard photo and retake">
            <ArrowLeft className="i" aria-hidden />
          </button>
          <span className="t-cap text-white">Preview</span>
          <span className="w-11" aria-hidden />
        </div>

        <div className="flex-1 min-h-0 flex items-center justify-center p-3 pt-16 pb-2 bg-black">
          <img src={capturedMedia} alt="Your photo" className="max-h-full max-w-full rounded-2xl object-contain" />
        </div>

        <div className="sheet p-4 flex flex-col gap-3 bg-vault-900 border-t border-vault-700 shrink-0">
          <div className="field">
            <label htmlFor="photo-caption" className="lab">Caption</label>
            <input
              id="photo-caption"
              type="text"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="Add a caption (optional)"
              className="inp text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={discardCapture} disabled={isProcessing} className="btn btn-s flex-1">
              <RotateCcw className="i i-sm" aria-hidden />
              <span>Retake</span>
            </button>
            <button type="button" onClick={handleSaveToGallery} disabled={isProcessing} className="btn btn-s flex-1">
              <Download className="i i-sm" aria-hidden />
              <span>Save to Gallery</span>
            </button>
          </div>
          <button type="button" onClick={handleSend} disabled={isProcessing} className="btn btn-p btn-block">
            <Send className="i" aria-hidden />
            <span>{isProcessing ? 'Saving…' : 'Send'}</span>
          </button>
        </div>
      </div>
    );
  }

  // ---------- Viewfinder ----------
  const showError = preview.status === 'error';
  const shutterDisabled = native ? isOpeningCamera : preview.status !== 'live';

  return (
    <div className="flex-1 flex flex-col h-full bg-black select-none relative overflow-hidden">
      <div className="relative flex-1 min-h-0 bg-black flex items-center justify-center overflow-hidden">
        {!native && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            aria-label="Camera preview"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${
              preview.status === 'live' ? 'opacity-100' : 'opacity-0'
            } ${facing === 'user' ? 'scale-x-[-1]' : ''}`}
          />
        )}

        {preview.status !== 'live' && (
          <div className="relative z-10 flex flex-col items-center justify-center p-6 text-center gap-3" role={showError ? 'alert' : 'status'}>
            <div className="w-16 h-16 rounded-2xl bg-vault-900 border border-vault-700 flex items-center justify-center">
              {showError ? <AlertCircle className="w-8 h-8 text-amber-400" aria-hidden /> : <Camera className="w-8 h-8 text-emerald" aria-hidden />}
            </div>
            <p className="t-body font-semibold text-white m-0">
              {showError
                ? preview.permissionDenied ? 'Camera access needed' : 'Camera unavailable'
                : native
                  ? isOpeningCamera ? 'Opening camera…' : 'Tap the shutter to take a photo'
                  : 'Starting camera…'}
            </p>
            {showError && <p className="t-sm c2 max-w-xs m-0">{preview.message}</p>}
            {showError && (
              <div className="flex flex-wrap justify-center gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => (native ? openNativeCamera() : setPreviewAttempt(a => a + 1))}
                  className="btn btn-s btn-sm"
                >
                  <RotateCcw className="i i-sm" aria-hidden />
                  <span>Try again</span>
                </button>
                <button type="button" onClick={handleChooseFromLibrary} className="btn btn-s btn-sm">
                  <ImageIcon className="i i-sm" aria-hidden />
                  <span>Choose from photos</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="relative z-20 p-5 pb-6 bg-black flex items-center justify-around shrink-0">
        <button type="button" onClick={handleChooseFromLibrary} className="ib ib-s rounded-[14px] w-12 h-12" aria-label="Choose from photos">
          <ImageIcon className="i c2" aria-hidden />
        </button>

        <button
          type="button"
          onClick={handleShutter}
          disabled={shutterDisabled}
          className="w-20 h-20 rounded-full border-4 border-white p-1.5 flex items-center justify-center bg-transparent active:scale-95 transition-transform disabled:opacity-40"
          aria-label={native ? 'Open camera' : 'Take photo'}
        >
          <span className="w-full h-full rounded-full bg-white block" />
        </button>

        <button
          type="button"
          onClick={() => setFacing(prev => (prev === 'user' ? 'environment' : 'user'))}
          disabled={!native && preview.status !== 'live'}
          className="ib ib-s rounded-full w-12 h-12 disabled:opacity-30"
          aria-label={facing === 'user' ? 'Use rear camera' : 'Use front camera'}
        >
          <RefreshCw className="i c2" aria-hidden />
        </button>
      </div>
    </div>
  );
};
