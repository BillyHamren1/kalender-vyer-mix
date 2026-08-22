import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Camera, Check, Clipboard, Keyboard, Loader2, ScanLine } from 'lucide-react';
import { BarcodeDetector as BarcodeDetectorPolyfill } from 'barcode-detector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type Detector = { detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>> };

const createDetector = (): Detector => {
  const DetectorClass = ('BarcodeDetector' in window)
    ? (window as Window & { BarcodeDetector: new (options: { formats: string[] }) => Detector }).BarcodeDetector
    : BarcodeDetectorPolyfill;

  return new DetectorClass({
    formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e'],
  }) as Detector;
};

/** Camera/manual code capture for Time. It never imports or executes warehouse mutations. */
const MobileCodeCapture = () => {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [manualValue, setManualValue] = useState('');
  const [result, setResult] = useState('');
  const [decoding, setDecoding] = useState(false);
  const openedFromWarehouseTask = search.has('packingId') || search.has('packlistId') || search.has('bookingId');

  const acceptResult = (value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    setResult(normalized);
    setManualValue(normalized);
    toast.success('Kod avläst');
  };

  const decodeImage = async (file: File) => {
    setDecoding(true);
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const matches = await createDetector().detect(bitmap);
        const value = matches.find((match) => match.rawValue?.trim())?.rawValue;
        if (!value) throw new Error('Ingen QR- eller streckkod hittades i bilden.');
        acceptResult(value);
      } finally {
        bitmap.close();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Koden kunde inte läsas.';
      toast.error(message);
    } finally {
      setDecoding(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const copyResult = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    toast.success('Kopierad');
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border/60">
        <button onClick={() => navigate('/m/tools')} className="p-2 -ml-2 rounded-lg active:bg-muted">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold">QR- och streckkod</h1>
      </header>

      <main className="p-4 space-y-5">
        {openedFromWarehouseTask && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
            Packning och retur utförs i EventFlow Scanner. Här kan du endast läsa och kopiera en kod.
          </div>
        )}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={decoding}
          className="w-full min-h-56 rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-3 text-muted-foreground active:bg-muted disabled:opacity-60"
        >
          {decoding ? <Loader2 className="w-12 h-12 animate-spin" /> : <Camera className="w-12 h-12" />}
          <span className="font-medium">{decoding ? 'Läser kod…' : 'Öppna kameran'}</span>
          <span className="text-xs">Ta en bild av QR- eller streckkoden</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void decodeImage(file);
          }}
        />

        <div className="space-y-2">
          <label htmlFor="manual-code" className="text-sm font-medium flex items-center gap-2">
            <Keyboard className="w-4 h-4" /> Ange kod manuellt
          </label>
          <div className="flex gap-2">
            <Input
              id="manual-code"
              value={manualValue}
              onChange={(event) => setManualValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') acceptResult(manualValue);
              }}
              autoCapitalize="off"
              autoCorrect="off"
            />
            <Button type="button" onClick={() => acceptResult(manualValue)} disabled={!manualValue.trim()}>
              <ScanLine className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {result && (
          <section className="rounded-2xl border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-600">
              <Check className="w-4 h-4" /> Avläst kod
            </div>
            <p className="font-mono text-sm break-all select-all">{result}</p>
            <Button type="button" variant="outline" className="w-full" onClick={() => void copyResult()}>
              <Clipboard className="w-4 h-4 mr-2" /> Kopiera
            </Button>
          </section>
        )}
      </main>
    </div>
  );
};

export default MobileCodeCapture;
