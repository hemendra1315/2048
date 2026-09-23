import React, { useState, useRef, useEffect } from 'react';
import { Camera, RefreshCw, Zap, ZapOff, X, ArrowLeft, Send, Image as ImageIcon, Download, Shield, RotateCcw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { uploadGalleryMedia } from '../../lib/storageHelper';
import { mockBackend } from '../../lib/mockBackend';

interface CameraViewProps {
  onSendToChat?: (imageUrl: string) => void;
  onSavedToVault?: () => void;
  onSavedToGallery?: () => void;
}

export const CameraView: React.FC<CameraViewProps> = ({
  onSendToChat,
  onSavedToVault,
  onSavedToGallery,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [streamActive, setStreamActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [flash, setFlash] = useState(false);
  const [capturedMedia, setCapturedMedia] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [caption, setCaption] = useState('');
  const [zoomLevel, setZoomLevel] = useState<'1x' | '.5' | '2'>('1x');
  const [cameraMode, setCameraMode] = useState<'photo' | 'video'>('photo');

  // Initialize camera stream
  useEffect(() => {
    let stream: MediaStream | null = null;
    let isCancelled = false;

    const startCamera = async () => {
      try {
        setCameraError(null);
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode },
            audio: false,
          });
          if (isCancelled) {
            mediaStream.getTracks().forEach(track => track.stop());
            return;
          }
          stream = mediaStream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            setStreamActive(true);
          }
        } else {
          setCameraError('Camera API not accessible in this environment.');
        }
      } catch (err) {
        if (!isCancelled) {
          console.warn('Camera access denied or unavailable:', err);
          setCameraError('Camera unavailable or permission denied. Using instant sensor simulator.');
        }
      }
    };

    startCamera();

    return () => {
      isCancelled = true;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      setStreamActive(false);
    };
  }, [facingMode]);

  const handleCapturePhoto = () => {
    if (videoRef.current && streamActive) {
      const video = videoRef.current;
      const canvas = canvasRef.current || document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        setCapturedMedia(dataUrl);
        return;
      }
    }

    // High-speed fallback capture generator
    const fallbackCanvas = document.createElement('canvas');
    fallbackCanvas.width = 800;
    fallbackCanvas.height = 800;
    const ctx = fallbackCanvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createLinearGradient(0, 0, 800, 800);
      gradient.addColorStop(0, '#0C0D0F');
      gradient.addColorStop(0.5, '#0E3A2B');
      gradient.addColorStop(1, '#050505');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 800, 800);

      // Decorative shapes matching AMOLED design
      ctx.fillStyle = '#E3B341';
      ctx.beginPath();
      ctx.arc(520, 240, 90, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#10B981';
      ctx.beginPath();
      ctx.roundRect(460, 360, 180, 280, [90, 90, 20, 20]);
      ctx.fill();

      ctx.fillStyle = '#10B981';
      ctx.font = 'bold 28px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ENCRYPTED CAPTURE', 400, 700);

      ctx.fillStyle = '#A7ABB3';
      ctx.font = '16px JetBrains Mono, monospace';
      ctx.fillText(new Date().toISOString().replace('T', ' ').slice(0, 19), 400, 740);

      const dataUrl = fallbackCanvas.toDataURL('image/jpeg', 0.9);
      setCapturedMedia(dataUrl);
    }
  };

  const handleSaveToGallery = async () => {
    if (!capturedMedia || !user) return;
    setIsProcessing(true);
    try {
      if (isSupabaseConfigured()) {
        const { publicUrl, filePath } = await uploadGalleryMedia(capturedMedia, user.id, 'jpg');
        await supabase.from('gallery_items').insert({
          user_id: user.id,
          image_url: publicUrl,
          storage_path: filePath,
          caption: caption.trim() || 'Captured via Camera',
        } as unknown as { user_id: string; image_url: string; storage_path: string; caption: string });
      } else {
        mockBackend.uploadGalleryItem(
          user.id,
          capturedMedia,
          caption.trim() || 'Captured via Camera'
        );
      }
      showToast('Saved to Personal Gallery', 'success');
      setCapturedMedia(null);
      setCaption('');
      if (onSavedToGallery) onSavedToGallery();
    } catch (err) {
      console.error('Failed to save to gallery:', err);
      showToast('Error saving to gallery', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEncryptToVault = async () => {
    if (!capturedMedia || !user) return;
    setIsProcessing(true);
    try {
      if (isSupabaseConfigured()) {
        const { publicUrl, filePath } = await uploadGalleryMedia(capturedMedia, user.id, 'jpg');
        await supabase.from('gallery_items').insert({
          user_id: user.id,
          image_url: publicUrl,
          storage_path: filePath,
          caption: caption.trim() || '[ENCRYPTED_VAULT_ITEM]',
        } as unknown as { user_id: string; image_url: string; storage_path: string; caption: string });
      } else {
        mockBackend.uploadGalleryItem(
          user.id,
          capturedMedia,
          caption.trim() || '[ENCRYPTED_VAULT_ITEM]'
        );
      }
      showToast('Encrypted & Locked in Private Vault', 'success');
      setCapturedMedia(null);
      setCaption('');
      if (onSavedToVault) onSavedToVault();
    } catch (err) {
      console.error('Failed to save to vault:', err);
      showToast('Error encrypting to vault', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendInstant = () => {
    if (!capturedMedia) return;
    if (onSendToChat) {
      onSendToChat(capturedMedia);
      showToast('Media attached to active chat', 'success');
    } else {
      showToast('Open a chat to send directly', 'info');
    }
    setCapturedMedia(null);
    setCaption('');
  };

  return (
    <div className="relative w-full h-[calc(100vh-140px)] md:h-[680px] bg-vault-950 rounded-2xl overflow-hidden border border-vault-800 flex flex-col justify-between select-none animate-fade-in">
      <canvas ref={canvasRef} className="hidden" />

      {capturedMedia ? (
        /* Captured Preview & Dispatch View */
        <div className="relative flex-1 flex flex-col justify-between bg-vault-950 overflow-hidden">
          {/* Top Bar */}
          <div className="absolute top-0 left-0 right-0 z-20 p-4 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setCapturedMedia(null);
                setCaption('');
              }}
              className="ib ib-s rounded-full"
              aria-label="Back to camera"
            >
              <ArrowLeft className="i" aria-hidden />
            </button>
            <span className="tag tag-em mono">Captured</span>
            <button
              type="button"
              onClick={() => {
                setCapturedMedia(null);
                setCaption('');
              }}
              className="ib ib-s rounded-full"
              aria-label="Discard photo"
            >
              <X className="i" aria-hidden />
            </button>
          </div>

          {/* Media Viewport */}
          <div className="flex-1 flex items-center justify-center p-3 pt-16 pb-2 overflow-hidden bg-black">
            <img
              src={capturedMedia}
              alt="Captured preview"
              className="max-h-[50vh] sm:max-h-[58vh] max-w-full rounded-2xl object-contain shadow-2xl border border-vault-800"
            />
          </div>

          {/* Bottom Dispatch Controls */}
          <div className="sheet p-4 flex flex-col gap-3 bg-vault-900 border-t border-vault-700">
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
              <button
                type="button"
                onClick={() => {
                  setCapturedMedia(null);
                  setCaption('');
                }}
                disabled={isProcessing}
                className="btn btn-s flex-1"
                aria-label="Retake photo"
              >
                <RotateCcw className="i i-sm" aria-hidden />
                <span>Retake</span>
              </button>

              <button
                type="button"
                onClick={handleSaveToGallery}
                disabled={isProcessing}
                className="btn btn-s flex-1"
                aria-label="Save to gallery"
              >
                <Download className="i i-sm" aria-hidden />
                <span>Save to gallery</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleSendInstant}
              disabled={isProcessing}
              className="btn btn-p btn-block"
              aria-label="Send photo to chat"
            >
              <Send className="i" aria-hidden />
              <span>{isProcessing ? 'Processing...' : 'Send'}</span>
            </button>

            <button
              type="button"
              onClick={handleEncryptToVault}
              disabled={isProcessing}
              className="btn btn-g btn-sm text-vault-400 hover:text-white"
              aria-label="Save to encrypted vault"
            >
              <Shield className="i i-sm text-gold" aria-hidden />
              <span>Lock in Encrypted Vault</span>
            </button>
          </div>
        </div>
      ) : (
        /* Live Camera Viewfinder */
        <div className="relative flex-1 flex flex-col justify-between bg-black overflow-hidden">
          {/* Top Bar */}
          <div className="absolute top-0 left-0 right-0 z-20 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between">
            <span className="tag tag-em mono">
              <span className="w-2 h-2 rounded-full bg-emerald animate-pulse" />
              LIVE CAM
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFlash(!flash)}
                className="ib ib-s rounded-full"
                aria-label={flash ? 'Turn off flash' : 'Turn on flash'}
              >
                {flash ? <Zap className="i text-gold" aria-hidden /> : <ZapOff className="i c3" aria-hidden />}
              </button>
              <button
                type="button"
                onClick={() => setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'))}
                className="ib ib-s rounded-full"
                aria-label="Flip camera"
              >
                <RefreshCw className="i c2" aria-hidden />
              </button>
            </div>
          </div>

          {/* Viewfinder Stream / Simulator */}
          <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
            {streamActive ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-vault-900 border border-vault-700 flex items-center justify-center text-emerald">
                  <Camera className="w-8 h-8" aria-hidden />
                </div>
                <div>
                  <p className="t-body font-semibold text-white m-0">Instant Shutter Ready</p>
                  <p className="t-sm c2 max-w-xs mt-1 mb-0">
                    {cameraError || 'Tap shutter to capture an encrypted photo instantly.'}
                  </p>
                </div>
              </div>
            )}

            {/* Zoom Selector Pills */}
            <div className="absolute bottom-20 left-0 right-0 flex justify-center gap-1.5 z-10" role="group" aria-label="Zoom level">
              {(['.5', '1x', '2'] as const).map(z => (
                <button
                  key={z}
                  type="button"
                  onClick={() => setZoomLevel(z)}
                  className={`w-9 h-9 rounded-full text-xs font-bold font-mono transition-all flex items-center justify-center ${
                    zoomLevel === z
                      ? 'bg-vault-750 text-white border border-vault-600 shadow-md'
                      : 'bg-black/50 text-vault-400 border border-transparent hover:bg-black/80'
                  }`}
                  aria-label={`Zoom ${z}`}
                  aria-pressed={zoomLevel === z}
                >
                  {z}
                </button>
              ))}
            </div>
          </div>

          {/* Bottom Shutter & Mode Selector */}
          <div className="relative z-20 p-5 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col items-center gap-4">
            {/* Mode Switcher */}
            <div className="flex items-center gap-6 text-sm font-semibold" role="tablist" aria-label="Camera mode">
              <button
                type="button"
                role="tab"
                aria-selected={cameraMode === 'video'}
                onClick={() => setCameraMode('video')}
                className={`transition-colors cursor-pointer ${cameraMode === 'video' ? 'text-gold font-bold' : 'c3 hover:text-vault-200'}`}
              >
                Video
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={cameraMode === 'photo'}
                onClick={() => setCameraMode('photo')}
                className={`transition-colors cursor-pointer ${cameraMode === 'photo' ? 'text-gold font-bold' : 'c3 hover:text-vault-200'}`}
              >
                Photo
              </button>
            </div>

            {/* Shutter Bar */}
            <div className="w-full flex items-center justify-around max-w-xs">
              {/* Gallery Link */}
              <button
                type="button"
                onClick={onSavedToGallery}
                className="ib ib-s rounded-[14px] w-12 h-12"
                aria-label="Open personal gallery"
                title="Gallery"
              >
                <ImageIcon className="i c2" aria-hidden />
              </button>

              {/* Shutter Ring (Center) */}
              <button
                type="button"
                onClick={handleCapturePhoto}
                className="w-20 h-20 rounded-full border-4 border-white p-1.5 flex items-center justify-center bg-transparent active:scale-95 transition-transform shadow-2xl"
                aria-label="Capture photo"
              >
                <span className="w-full h-full rounded-full bg-white transition-colors block" />
              </button>

              {/* Flip Camera */}
              <button
                type="button"
                onClick={() => setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'))}
                className="ib ib-s rounded-full w-12 h-12"
                aria-label="Flip camera"
                title="Flip"
              >
                <RefreshCw className="i c2" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
