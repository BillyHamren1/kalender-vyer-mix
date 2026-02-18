import { useState, useEffect, useRef } from 'react';
import { mobileApi, MobilePurchase } from '@/services/mobileApiService';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Receipt, Loader2, Image, Plus, Camera, Check } from 'lucide-react';
import { takePhotoBase64 } from '@/utils/capacitorCamera';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const categories = ['Material', 'Transport', 'Mat', 'Verktyg', 'Övrigt'];

interface JobCostsTabProps {
  bookingId: string;
}

const JobCostsTab = ({ bookingId }: JobCostsTabProps) => {
  const [purchases, setPurchases] = useState<MobilePurchase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [supplier, setSupplier] = useState('');
  const [category, setCategory] = useState('');
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptBase64, setReceiptBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPurchases = () => {
    mobileApi.getProjectPurchases(bookingId)
      .then(res => setPurchases(res.purchases || []))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { fetchPurchases(); }, [bookingId]);

  const handleCameraClick = async () => {
    console.log('[JobCostsTab] handleCameraClick called');
    try {
      console.log('[JobCostsTab] Calling takePhotoBase64()...');
      const base64 = await takePhotoBase64();
      console.log('[JobCostsTab] takePhotoBase64() returned:', base64 ? `base64 string (length ${base64.length})` : 'null');
      if (base64) {
        // Native path – got base64 directly from Capacitor Camera
        console.log('[JobCostsTab] Setting receipt preview from native camera');
        setReceiptPreview(base64);
        setReceiptBase64(base64);
      } else {
        // Web fallback – trigger standard file input
        console.log('[JobCostsTab] base64 was null – triggering file input');
        fileInputRef.current?.click();
      }
    } catch (err: any) {
      console.error('[JobCostsTab] UNHANDLED ERROR in handleCameraClick:', err);
      console.error('[JobCostsTab] Error name:', err?.name);
      console.error('[JobCostsTab] Error message:', err?.message);
      console.error('[JobCostsTab] Full error:', JSON.stringify(err, null, 2));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setReceiptPreview(result);
      setReceiptBase64(result);
    };
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setDescription('');
    setAmount('');
    setSupplier('');
    setCategory('');
    setReceiptPreview(null);
    setReceiptBase64(null);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!description.trim() || !amount) {
      toast.error('Fyll i beskrivning och belopp');
      return;
    }

    setIsSaving(true);
    try {
      await mobileApi.createPurchase({
        booking_id: bookingId,
        description: description.trim(),
        amount: parseFloat(amount),
        supplier: supplier.trim() || undefined,
        category: category || undefined,
        receipt_image: receiptBase64 || undefined,
      });
      toast.success('Utlägg sparat!');
      resetForm();
      fetchPurchases();
    } catch (err: any) {
      toast.error(err.message || 'Kunde inte spara utlägg');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const total = purchases.reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <div className="space-y-3">
      {/* Add button */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full rounded-xl border border-dashed border-primary/25 bg-primary/5 p-3.5 flex items-center gap-3 active:scale-[0.98] transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Plus className="w-5 h-5 text-primary" />
          </div>
          <div className="text-left">
            <p className="font-bold text-sm text-foreground">Lägg till utlägg</p>
            <p className="text-[11px] text-muted-foreground">Fota kvitto & registrera</p>
          </div>
        </button>
      )}

      {/* Inline form */}
      {showForm && (
        <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3 shadow-sm animate-in slide-in-from-top-2 duration-200">
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />

          {receiptPreview ? (
            <div className="relative rounded-lg overflow-hidden border border-border/50">
              <img src={receiptPreview} alt="Kvitto" className="w-full h-32 object-cover" />
              <button onClick={() => { setReceiptPreview(null); setReceiptBase64(null); }} className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-md bg-foreground/70 text-card text-[10px] font-medium">Ta bort</button>
            </div>
          ) : (
            <button onClick={handleCameraClick} className="w-full h-20 rounded-lg border border-dashed border-primary/25 flex flex-col items-center justify-center gap-1 bg-primary/5">
              <Camera className="w-4 h-4 text-primary/70" />
              <span className="text-[10px] font-semibold text-primary">Fota kvitto</span>
            </button>
          )}

          <div className="space-y-1">
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Beskrivning</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Vad köpte du..." className="rounded-lg min-h-[48px] text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Belopp (kr)</Label>
              <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="h-10 rounded-lg text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Kategori</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-10 rounded-lg text-sm"><SelectValue placeholder="Välj..." /></SelectTrigger>
                <SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Leverantör</Label>
            <Input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Butik/företag" className="h-10 rounded-lg text-sm" />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="flex-1 rounded-lg text-xs font-semibold" onClick={resetForm}>Avbryt</Button>
            <Button size="sm" className="flex-1 rounded-lg gap-1 text-xs font-semibold active:scale-[0.98]" onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Spara
            </Button>
          </div>
        </div>
      )}

      {/* Total */}
      {purchases.length > 0 && (
        <div className="rounded-xl border bg-primary/5 border-primary/20 p-3 text-center">
          <p className="text-[11px] text-muted-foreground">Total kostnad</p>
          <p className="text-xl font-bold text-foreground">{total.toLocaleString('sv-SE')} kr</p>
        </div>
      )}

      {/* List */}
      {purchases.length === 0 && !showForm && (
        <div className="text-center py-10">
          <Receipt className="w-10 h-10 mx-auto text-muted-foreground/20 mb-2" />
          <p className="text-sm text-muted-foreground">Inga kostnader registrerade</p>
        </div>
      )}

      {purchases.map(p => (
        <div key={p.id} className="rounded-xl border border-border/50 bg-card p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm">{p.description}</p>
              <p className="text-[11px] text-muted-foreground">
                {p.supplier && <span>{p.supplier} · </span>}
                {p.category && <span>{p.category} · </span>}
                {p.created_by && <span>{p.created_by} · </span>}
                {p.created_at && format(parseISO(p.created_at), 'd MMM', { locale: sv })}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {p.receipt_url && <Image className="w-3.5 h-3.5 text-muted-foreground/40" />}
              <span className="font-bold text-sm">{p.amount} kr</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default JobCostsTab;
