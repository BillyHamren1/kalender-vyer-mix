import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, X, Flashlight } from 'lucide-react';

interface QRScannerProps {
  onScan: (result: string) => void;
  onClose: () => void;
  isActive: boolean;
}

export const QRScanner: React.FC<QRScannerProps> = ({ onScan, onClose, isActive }) => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Start camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setHasPermission(true);
        setIsScanning(true);
        
        // Start scanning loop
        scanQRCode();
      }
    } catch (err: any) {
      console.error('Camera error:', err);
      setHasPermission(false);
      setError(err.message || 'Kunde inte starta kameran');
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    setIsScanning(false);
  };

  // QR code scanning using canvas (fallback without native plugin)
  const scanQRCode = () => {
    if (!videoRef.current || !canvasRef.current || !isActive) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animationFrameRef.current = requestAnimationFrame(scanQRCode);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Get image data for QR scanning
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Use jsQR library if available, or implement basic detection
    // For now, we'll rely on the Capacitor plugin in native mode
    // and manual input as fallback in web mode
    
    animationFrameRef.current = requestAnimationFrame(scanQRCode);
  };

  // Handle manual input (for testing/fallback)
  const [manualInput, setManualInput] = useState('');
  
  const handleManualSubmit = () => {
    if (manualInput.trim()) {
      onScan(manualInput.trim());
      setManualInput('');
    }
  };

  useEffect(() => {
    if (isActive) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isActive]);

  if (!isActive) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-black/80 text-white">
        <h2 className="text-lg font-semibold">QR-skanner</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-white hover:bg-white/20"
        >
          <X className="h-6 w-6" />
        </Button>
      </div>

      {/* Camera view */}
      <div className="flex-1 relative">
        {hasPermission === false ? (
          <div className="flex flex-col items-center justify-center h-full text-white p-4">
            <Camera className="h-16 w-16 mb-4 opacity-50" />
            <p className="text-center mb-4">
              {error || 'Kameratillstånd krävs för att skanna QR-koder'}
            </p>
            <Button onClick={startCamera}>
              Försök igen
            </Button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            
            {/* Scanning overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-64 h-64 border-2 border-white rounded-lg relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-lg" />
                
                {/* Scanning line animation */}
                {isScanning && (
                  <div className="absolute left-2 right-2 h-0.5 bg-primary animate-pulse" 
                       style={{ 
                         top: '50%',
                         animation: 'scan-line 2s ease-in-out infinite'
                       }} 
                  />
                )}
              </div>
            </div>

            {/* Hidden canvas for image processing */}
            <canvas ref={canvasRef} className="hidden" />
          </>
        )}
      </div>

      {/* Manual input fallback */}
      <div className="p-4 bg-black/80">
        <p className="text-white text-sm text-center mb-2">
          Eller ange kod manuellt:
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
            placeholder="Ange QR-kod eller SKU..."
            className="flex-1 px-3 py-2 rounded bg-white/10 text-white placeholder:text-white/50 border border-white/20"
          />
          <Button onClick={handleManualSubmit}>
            Skicka
          </Button>
        </div>
      </div>

      <style>{`
        @keyframes scan-line {
          0%, 100% { transform: translateY(-100px); }
          50% { transform: translateY(100px); }
        }
      `}</style>
    </div>
  );
};
