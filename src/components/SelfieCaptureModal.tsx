import React, { useRef, useState, useEffect } from 'react';
import { Camera, X, RefreshCw, Check, Video, AlertTriangle } from 'lucide-react';
import { uploadFileToStorage } from '../utils/storageUpload';

interface SelfieCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
  currentAvatar: string;
}

export default function SelfieCaptureModal({ isOpen, onClose, onSave, currentAvatar }: SelfieCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Initialize camera stream
  const startCamera = async () => {
    setCameraError(null);
    setLoading(true);
    setCapturedImage(null);
    try {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 480 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });

      setStream(mediaStream);
      setIsCameraActive(true);
    } catch (err: any) {
      console.error("Camera access error:", err);
      setCameraError(
        err.name === 'NotAllowedError' 
          ? 'Camera access denied. Please allow camera permissions in your browser settings.' 
          : 'Could not access camera. Please check if your camera is connected and not in use by another application.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Stop camera tracks
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraActive(false);
  };

  // Sync stream to video element when stream or video ref updates
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Trigger camera start on modal open
  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
      setCapturedImage(null);
      setCameraError(null);
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  // Capture photo from video stream
  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        // Calculate crop to make it square
        const size = Math.min(video.videoWidth, video.videoHeight);
        const startX = (video.videoWidth - size) / 2;
        const startY = (video.videoHeight - size) / 2;

        canvas.width = 320;
        canvas.height = 320;

        // Draw video frame cropped to square
        context.drawImage(
          video, 
          startX, startY, size, size, 
          0, 0, 320, 320
        );

        canvas.toBlob(async (blob) => {
          if (!blob) return;
          try {
            const { downloadUrl } = await uploadFileToStorage(new File([blob], 'selfie.jpg', { type: 'image/jpeg' }), `users/pending-${Date.now()}/selfie.jpg`);
            setCapturedImage(downloadUrl);
            stopCamera();
          } catch {
            setCameraError('Failed to upload selfie. Please try again.');
          }
        }, 'image/jpeg', 0.85);
      }
    }
  };

  // Retake photo
  const retakePhoto = () => {
    setCapturedImage(null);
    startCamera();
  };

  // Confirm and Save picture
  const handleConfirm = () => {
    if (capturedImage) {
      onSave(capturedImage);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-[#08080a]/90 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fadeIn" id="selfie-modal">
      <div className="bg-[#0f0f12] border-2 border-slate-800 rounded-3xl p-6 max-w-sm w-full space-y-5 shadow-2xl relative overflow-hidden">
        
        {/* Glow decoration */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-12 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 relative">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="text-white font-extrabold text-sm tracking-wide uppercase">Capture User Selfie</h3>
              <span className="text-[9px] text-slate-500 font-mono tracking-wider">SECURE WORK IDENTITY UPDATE</span>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 hover:bg-slate-800/60 rounded-xl transition cursor-pointer"
            id="close-selfie-modal-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Selfie screen stage */}
        <div className="flex flex-col items-center justify-center">
          <div className="relative w-56 h-56 rounded-full border-4 border-slate-800 bg-[#070709] overflow-hidden flex items-center justify-center shadow-inner group">
            {/* Real-time Video stream feed */}
            <video 
              ref={videoRef}
              autoPlay 
              playsInline
              muted
              className={`w-full h-full object-cover scale-x-[-1] ${isCameraActive && !capturedImage ? 'block' : 'hidden'}`}
            />

            {/* Captured photo preview */}
            {capturedImage && (
              <img 
                src={capturedImage} 
                alt="Captured Selfie" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            )}

            {/* Error or Loader states */}
            {!isCameraActive && !capturedImage && !cameraError && (
              <div className="flex flex-col items-center gap-2.5 p-4 text-center">
                {loading ? (
                  <>
                    <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
                    <span className="text-[11px] text-slate-400 font-medium">Powering camera node...</span>
                  </>
                ) : (
                  <>
                    <Video className="w-6 h-6 text-slate-600" />
                    <span className="text-[11px] text-slate-500 font-mono">Camera Offline</span>
                  </>
                )}
              </div>
            )}

            {cameraError && (
              <div className="flex flex-col items-center gap-2 text-center p-4">
                <AlertTriangle className="w-6 h-6 text-amber-500 animate-pulse" />
                <p className="text-[10px] text-slate-400 leading-normal">{cameraError}</p>
                <button
                  onClick={startCamera}
                  className="mt-1 text-[10px] bg-slate-800 hover:bg-indigo-650 text-indigo-300 px-3 py-1.5 rounded-lg border border-indigo-950/40 uppercase font-black tracking-wider transition cursor-pointer"
                >
                  Retry Setup
                </button>
              </div>
            )}

            {/* Circular Grid overlay */}
            <div className="absolute inset-0 border-2 border-dashed border-indigo-500/20 rounded-full pointer-events-none" />
          </div>
          
          <p className="text-[10px] text-center text-slate-500 mt-2.5 leading-normal max-w-[240px]">
            {capturedImage 
              ? "Look good? Confirm to update your profile photo, or click retake to try again."
              : "Center your face in the circle for a professional work identity preview."}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col gap-3 pt-2">
          {isCameraActive && !capturedImage && (
            <div className="flex items-center gap-2.5 w-full">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl uppercase tracking-wider transition cursor-pointer border border-slate-750/50 text-center"
                id="cancel-selfie-capture-btn"
              >
                Cancel
              </button>
              <button
                onClick={capturePhoto}
                className="flex-[2] py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs rounded-xl uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-indigo-950 transition cursor-pointer"
                id="capture-selfie-btn"
              >
                <Camera className="w-4 h-4 text-indigo-100" />
                Capture
              </button>
            </div>
          )}

          {capturedImage && (
            <div className="space-y-2.5 w-full">
              <div className="flex items-center gap-2.5 w-full">
                <button
                  onClick={retakePhoto}
                  className="flex-1 py-2.5 bg-[#141418] hover:bg-slate-800 text-slate-300 font-bold text-xs rounded-xl uppercase tracking-wider transition cursor-pointer border border-slate-850 text-center"
                >
                  Retake Photo
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-[1.5] py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950 transition cursor-pointer"
                  id="save-selfie-btn"
                >
                  <Check className="w-4 h-4 text-emerald-100" />
                  Update Profile
                </button>
              </div>
              <button
                onClick={onClose}
                className="w-full py-2 bg-transparent hover:bg-rose-950/15 text-slate-400 hover:text-rose-400 font-semibold text-[10px] rounded-lg uppercase tracking-widest transition cursor-pointer text-center"
                id="cancel-after-capture-btn"
              >
                Cancel & Close
              </button>
            </div>
          )}
        </div>

        {/* Hidden Canvas helper */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
