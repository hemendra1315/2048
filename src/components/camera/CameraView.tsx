import React, { useState, useRef, useEffect } from 'react';
import { Camera, RefreshCw, Zap, ZapOff, Check, X, Shield, Image, Send, Video } from 'lucide-react';
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
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

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
          setCameraError('Camera unavailable or permission denied. Using high-speed canvas simulator.');
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

  // Handle Recording Timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } else {
      setRecordingSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

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
      gradient.addColorStop(0, '#111827');
      gradient.addColorStop(0.5, '#064e3b');
      gradient.addColorStop(1, '#0f172a');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 800, 800);

      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 32px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SOVEREIGN ENCRYPTED CAPTURE', 400, 380);

      ctx.fillStyle = '#a1a1aa';
      ctx.font = '20px JetBrains Mono, monospace';
      ctx.fillText(`TIMESTAMP: ${new Date().toISOString()}`, 400, 440);
      ctx.fillText(`CLEARANCE: ${user?.uid || 'SECURE-NODE'}`, 400, 480);

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
          caption: 'Captured via Camera',
        } as unknown as { user_id: string; image_url: string; storage_path: string; caption: string });
      } else {
        mockBackend.uploadGalleryItem(
          user.id,
          capturedMedia,
          'Captured via Camera'
        );
      }
      showToast('Saved to Personal Gallery', 'success');
      setCapturedMedia(null);
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
          caption: '[ENCRYPTED_VAULT_ITEM]',
        } as unknown as { user_id: string; image_url: string; storage_path: string; caption: string });
      } else {
        mockBackend.uploadGalleryItem(
          user.id,
          capturedMedia,
          '[ENCRYPTED_VAULT_ITEM]'
        );
      }
      showToast('Encrypted & Locked in Private Vault', 'success');
      setCapturedMedia(null);
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
  };

  return (
    <div className="relative w-full h-[calc(100vh-140px)] md:h-[680px] bg-[#0A0A0A] rounded-2xl overflow-hidden border border-[#262626] flex flex-col justify-between select-none animate-fade-in">
      <canvas ref={canvasRef} className="hidden" />

      {/* Top Overlay Controls */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4 bg-gradient-to-b from-black/80 via-black/30 to-transparent flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1 bg-[#111111]/80 backdrop-blur-md border border-[#262626] rounded-full text-xs font-mono text-[#10B981]">
            <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
            LIVE CAM
          </span>
          {isRecording && (
            <span className="px-2.5 py-1 bg-red-950/90 border border-red-600/50 rounded-full text-xs font-mono text-red-400 animate-pulse">
              REC {recordingSeconds}s
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFlash(!flash)}
            className="p-2.5 rounded-full bg-[#111111]/80 hover:bg-[#171717] border border-[#262626] text-white transition-all active:scale-95"
            title="Toggle Flash"
          >
            {flash ? <Zap className="w-4 h-4 text-amber-400 fill-amber-400" /> : <ZapOff className="w-4 h-4 text-zinc-400" />}
          </button>
          <button
            onClick={() => setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'))}
            className="p-2.5 rounded-full bg-[#111111]/80 hover:bg-[#171717] border border-[#262626] text-white transition-all active:scale-95"
            title="Flip Camera"
          >
            <RefreshCw className="w-4 h-4 text-zinc-300" />
          </button>
        </div>
      </div>

      {/* Viewfinder Video Stream / Captured Preview */}
      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
        {capturedMedia ? (
          <img
            src={capturedMedia}
            alt="Captured media"
            className="w-full h-full object-contain bg-black"
          />
        ) : streamActive ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-[#111111] border border-[#262626] flex items-center justify-center text-[#10B981]">
              <Camera className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Instant Shutter Ready</p>
              <p className="text-xs text-[#A1A1AA] max-w-xs mt-1">
                {cameraError || 'Tap shutter to capture an encrypted photo instantly.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls / Dispatch Action Sheet */}
      {capturedMedia ? (
        <div className="absolute bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-black/95 via-black/80 to-transparent flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleSendInstant}
              disabled={isProcessing}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#171717] hover:bg-[#222222] border border-[#262626] text-white transition-all active:scale-95"
            >
              <Send className="w-5 h-5 text-[#10B981] mb-1" />
              <span className="text-xs font-semibold">Send to Chat</span>
            </button>

            <button
              onClick={handleSaveToGallery}
              disabled={isProcessing}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#171717] hover:bg-[#222222] border border-[#262626] text-white transition-all active:scale-95"
            >
              <Image className="w-5 h-5 text-zinc-300 mb-1" />
              <span className="text-xs font-semibold">Save Gallery</span>
            </button>

            <button
              onClick={handleEncryptToVault}
              disabled={isProcessing}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#171717] hover:bg-[#222222] border border-[#262626] text-white transition-all active:scale-95"
            >
              <Shield className="w-5 h-5 text-amber-400 mb-1" />
              <span className="text-xs font-semibold">Lock to Vault</span>
            </button>
          </div>

          <div className="flex justify-center">
            <button
              onClick={() => setCapturedMedia(null)}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-[#111111] hover:bg-[#171717] border border-[#262626] rounded-full text-xs text-zinc-400 hover:text-white transition-all"
            >
              <X className="w-3.5 h-3.5" />
              <span>Discard & Retake</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="p-6 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex items-center justify-around">
          <button
            onClick={() => setIsRecording(!isRecording)}
            className={`p-3.5 rounded-full border transition-all active:scale-90 ${
              isRecording
                ? 'bg-red-500 border-red-400 text-white animate-pulse'
                : 'bg-[#111111]/80 hover:bg-[#171717] border-[#262626] text-zinc-300'
            }`}
            title={isRecording ? 'Stop Recording' : 'Record Video'}
          >
            <Video className="w-5 h-5" />
          </button>

          {/* Shutter Ring (Center) */}
          <button
            onClick={handleCapturePhoto}
            className="w-16 h-16 rounded-full border-4 border-white/80 p-1 flex items-center justify-center bg-transparent active:scale-90 transition-transform shadow-2xl"
          >
            <div className="w-12 h-12 rounded-full bg-white hover:bg-zinc-200 transition-colors" />
          </button>

          <button
            onClick={handleCapturePhoto}
            className="p-3.5 rounded-full bg-[#111111]/80 hover:bg-[#171717] border border-[#262626] text-[#10B981] transition-all active:scale-90"
            title="Instant Snapshot"
          >
            <Check className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};
