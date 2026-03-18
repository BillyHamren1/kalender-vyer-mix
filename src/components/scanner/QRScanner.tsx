import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, X, Radio } from 'lucide-react';
import { isScannerApp } from '@/config/appMode';

interface QRScannerProps {
  onScan: (result: string) => void;
  onClose: () => void;
  isActive: boolean;
  /** Skip camera initialization entirely (e.g. on Zebra devices using DataWedge) */
  skipCamera?: boolean;
}

/**
 * QRScanner — Hybrid scanner component
 * 
 * In scanner mode (Zebra devices): Skips camera entirely, shows only manual input.
 * DataWedge handles all hardware scanning — no camera permission needed.
 * 
 * In other modes: Uses BarcodeDetector API with camera + manual input fallback.
 */
export const QRScanner: React.FC<QRScannerProps> = ({ onScan, onClose, isActive, skipCamera }) => {
  // In scanner app mode, always skip camera — DataWedge is the primary scanner
  const shouldSkipCamera = skipCamera ?? isScannerApp;

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [hasBarcodeDetector, setHasBarcodeDetector] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const detectorRef = useRef<any>(null);
  const lastScanRef = useRef<string>('');

  // Check BarcodeDetector support on mount (only if camera is used)
  useEffect(() => {
    if (shouldSkipCamera) return;
    const supported = 'BarcodeDetector' in window;
    setHasBarcodeDetector(supported);
    if (supported) {
      try {
        detectorRef.current = new (window as any).BarcodeDetector({
          formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39']
        });
      } catch (e) {
        console.warn('[QRScanner] BarcodeDetector init failed:', e);
        setHasBarcodeDetector(false);
      }
    }
  }, [shouldSkipCamera]);

  // Scan loop using BarcodeDetector
  const scanFrame = useCallback(async () => {
    if (!videoRef.current || !detectorRef.current || !isActive) return;
    
    const video = videoRef.current;
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      animationFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    try {
      const barcodes = await detectorRef.current.detect(video);
      if (barcodes.length > 0) {
        const value = barcodes[0].rawValue;
        if (value && value !== lastScanRef.current) {
          lastScanRef.current = value;
          onScan(value);
          setTimeout(() => { lastScanRef.current = ''; }, 3000);
          return;
        }
      }
    } catch (e) {
      // detect() can throw on some frames, ignore and retry
    }

    animationFrameRef.current = requestAnimationFrame(scanFrame);
  }, [isActive, onScan]);

  // Start camera
  const startCamera = useCallback(async () => {
    if (shouldSkipCamera) return;
    try {
      setError(null);
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
        
        if (detectorRef.current) {
          animationFrameRef.current = requestAnimationFrame(scanFrame);
        }
      }
    } catch (err: any) {
      console.error('[QRScanner] Camera error:', err);
      setHasPermission(false);
      setError(err.message || 'Kunde inte starta kameran');
    }
  }, [scanFrame, shouldSkipCamera]);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setIsScanning(false);
    lastScanRef.current = '';
  }, []);

  // Handle manual input
  const [manualInput, setManualInput] = useState('');
  
  const handleManualSubmit = useCallback(() => {
    if (manualInput.trim()) {
      onScan(manualInput.trim());
      setManualInput('');
    }
  }, [manualInput, onScan]);

  // Start/stop camera based on isActive (skip camera in scanner mode)
  useEffect(() => {
    if (isActive && !shouldSkipCamera) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => { stopCamera(); };
  }, [isActive, startCamera, stopCamera, shouldSkipCamera]);

  if (!isActive) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-black/80 text-white safe-area-top">
        <h2 className="text-lg font-semibold">
          {shouldSkipCamera ? 'Manuell inmatning' : 'QR-skanner'}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-white hover:bg-white/20"
        >
          <X className="h-6 w-6" />
        </Button>
      </div>

      {/* Camera view — only shown when camera is enabled */}
      {!shouldSkipCamera && (
        <div className="flex-1 relative overflow-hidden">
          {hasPermission === false ? (
            <div className="flex flex-col items-center justify-center h-full text-white p-4">
              <Camera className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-center mb-2">
                {error || 'Kameratillstånd krävs för att skanna QR-koder'}
              </p>
              {!hasBarcodeDetector && (
                <p className="text-center text-sm text-white/60 mb-4">
                  QR-avkodning stöds inte i denna webbläsare. Använd manuell inmatning nedan.
                </p>
              )}
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
                autoPlay
              />
              
              {/* Scanning overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-64 h-64 border-2 border-white/30 rounded-lg relative">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-lg" />
                  
                  {isScanning && hasBarcodeDetector && (
                    <div 
                      className="absolute left-2 right-2 h-0.5 bg-primary"
                      style={{ animation: 'scan-line 2s ease-in-out infinite' }} 
                    />
                  )}
                </div>
              </div>

              {isScanning && !hasBarcodeDetector && (
                <div className="absolute bottom-4 left-4 right-4 bg-yellow-500/90 text-black text-xs font-medium text-center py-2 px-3 rounded-lg">
                  Kameran är igång men QR-avkodning saknas. Ange kod manuellt nedan.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Scanner mode info — shown instead of camera view */}
      {shouldSkipCamera && (
        <div className="flex-1 flex flex-col items-center justify-center text-white p-6">
          <Radio className="h-16 w-16 mb-4 opacity-60" />
          <p className="text-center text-lg font-medium mb-2">Använd Zebra-skannern</p>
          <p className="text-center text-sm text-white/60">
            Tryck på skanningsknappen på enheten, eller ange kod manuellt nedan.
          </p>
        </div>
      )}

      {/* Manual input — always available */}
      <div className="p-4 bg-black/80 safe-area-bottom">
        <p className="text-white text-sm text-center mb-2">
          {shouldSkipCamera ? 'Ange kod manuellt:' : hasBarcodeDetector ? 'Eller ange kod manuellt:' : 'Ange kod manuellt:'}
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
            placeholder="Ange QR-kod eller SKU..."
            className="flex-1 px-3 py-2 rounded bg-white/10 text-white placeholder:text-white/50 border border-white/20 focus:outline-none focus:border-primary"
            autoFocus={shouldSkipCamera}
          />
          <Button onClick={handleManualSubmit} disabled={!manualInput.trim()}>
            Skicka
          </Button>
        </div>
      </div>

      <style>{`
        @keyframes scan-line {
          0%, 100% { top: 10%; }
          50% { top: 85%; }
        }
        .safe-area-top { padding-top: max(1rem, env(safe-area-inset-top)); }
        .safe-area-bottom { padding-bottom: max(1rem, env(safe-area-inset-bottom)); }
      `}</style>
    </div>
  );
};
