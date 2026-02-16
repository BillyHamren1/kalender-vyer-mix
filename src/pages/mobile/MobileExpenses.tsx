import { useState, useEffect, useRef } from 'react';
import { mobileApi, MobileBooking, MobilePurchase } from '@/services/mobileApiService';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Receipt, Camera, Plus, Loader2, Check, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const categories = ['Material', 'Transport', 'Mat', 'Verktyg', 'Övrigt'];

const MobileExpenses = () => {
  const [bookings, setBookings] = useState<MobileBooking[]>([]);
  const [purchases, setPurchases] = useState<MobilePurchase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [supplier, setSupplier] = useState('');
  const [category, setCategory] = useState('');
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptBase64, setReceiptBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mobileApi.getBookings()
      .then(res => setBookings(res.bookings))
      .catch(() => toast.error('Kunde inte ladda data'))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedBookingId) return;
    mobileApi.getProjectPurchases(selectedBookingId)
      .then(res => setPurchases(res.purchases || []))
      .catch(() => {});
  }, [selectedBookingId]);

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

  const handleSubmit = async () => {
    if (!selectedBookingId || !description.trim() || !amount) {
      toast.error('Fyll i jobb, beskrivning och belopp');
      return;
    }

    setIsSaving(true);
    try {
      await mobileApi.createPurchase({
        booking_id: selectedBookingId,
        description: description.trim(),
        amount: parseFloat(amount),
        supplier: supplier.trim() || undefined,
        category: category || undefined,
        receipt_image: receiptBase64 || undefined,
      });
      toast.success('Utlägg sparat!');
      setShowForm(false);
      setDescription('');
      setAmount('');
      setSupplier('');
      setCategory('');
      setReceiptPreview(null);
      setReceiptBase64(null);
      if (selectedBookingId) {
        const res = await mobileApi.getProjectPurchases(selectedBookingId);
        setPurchases(res.purchases || []);
      }
    } catch (err: any) {
      toast.error(err.message || 'Kunde inte spara utlägg');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <div className="relative bg-gradient-to-br from-primary via-primary to-primary/85 px-5 pt-14 pb-6 safe-area-top overflow-hidden">
          <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-primary-foreground/5" />
          <h1 className="relative text-2xl font-extrabold text-primary-foreground tracking-tight">Utlägg</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="relative bg-gradient-to-br from-primary via-primary to-primary/85 px-5 pt-14 pb-6 safe-area-top overflow-hidden">
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-primary-foreground/5" />
        <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full bg-primary-foreground/5" />
        <div className="relative flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-primary-foreground tracking-tight">Utlägg</h1>
            <p className="text-sm text-primary-foreground/60 font-medium mt-0.5">Kvitton & inköp</p>
          </div>
          <Button
            onClick={() => setShowForm(!showForm)}
            className="rounded-2xl bg-primary-foreground text-primary hover:bg-primary-foreground/90 gap-1.5 font-semibold shadow-lg active:scale-[0.98] transition-all"
          >
            <Plus className="w-4 h-4" />
            Nytt
          </Button>
        </div>
      </div>

      <div className="flex-1 px-4 py-5 space-y-4">
        {/* Form */}
        {showForm && (
          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-5 shadow-md animate-in slide-in-from-top-2 duration-200">
            <h2 className="font-bold text-base text-foreground">Nytt utlägg</h2>

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">Jobb</Label>
              <Select value={selectedBookingId} onValueChange={setSelectedBookingId}>
                <SelectTrigger className="h-12 rounded-xl">
                  <SelectValue placeholder="Välj jobb..." />
                </SelectTrigger>
                <SelectContent>
                  {bookings.map(b => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.client} {b.booking_number ? `#${b.booking_number}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">Beskrivning</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Vad köpte du..."
                className="rounded-xl min-h-[60px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">Belopp (kr)</Label>
                <Input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0"
                  className="h-12 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">Kategori</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-12 rounded-xl">
                    <SelectValue placeholder="Välj..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">Leverantör</Label>
              <Input
                value={supplier}
                onChange={e => setSupplier(e.target.value)}
                placeholder="Butik/företag"
                className="h-12 rounded-xl"
              />
            </div>

            {/* Receipt photo */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">Kvitto (foto)</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />
              {receiptPreview ? (
                <div className="relative rounded-2xl overflow-hidden border border-border/60">
                  <img src={receiptPreview} alt="Kvitto" className="w-full h-40 object-cover" />
                  <button
                    onClick={() => { setReceiptPreview(null); setReceiptBase64(null); }}
                    className="absolute top-2 right-2 px-3 py-1.5 rounded-xl bg-black/60 text-white text-xs font-medium backdrop-blur-sm"
                  >
                    Ta bort
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-28 rounded-2xl border-2 border-dashed border-border/60 flex flex-col items-center justify-center gap-2 hover:border-primary/30 transition-colors bg-muted/20"
                >
                  <div className="p-2.5 rounded-xl bg-muted/60">
                    <Camera className="w-5 h-5 text-muted-foreground/60" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">Ta foto av kvitto</span>
                </button>
              )}
            </div>

            <div className="flex gap-2.5 pt-1">
              <Button variant="outline" className="flex-1 h-12 rounded-xl font-semibold" onClick={() => setShowForm(false)}>Avbryt</Button>
              <Button 
                className="flex-1 h-12 rounded-xl gap-1.5 font-semibold shadow-md active:scale-[0.98] transition-all" 
                onClick={handleSubmit} 
                disabled={isSaving}
                style={{ boxShadow: '0 4px 16px hsl(184 60% 38% / 0.2)' }}
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Spara
              </Button>
            </div>
          </div>
        )}

        {/* Purchase history */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Senaste utlägg</h2>
          {purchases.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-3xl bg-muted/60 flex items-center justify-center mx-auto mb-3">
                <Receipt className="w-8 h-8 text-muted-foreground/30" />
              </div>
              <p className="text-sm font-semibold text-foreground/60">Inga utlägg registrerade</p>
              <p className="text-xs text-muted-foreground mt-1">Välj ett jobb ovan för att se historik</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {purchases.map(p => (
                <div key={p.id} className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-foreground">{p.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {p.supplier && <span>{p.supplier} · </span>}
                        {p.category && <span>{p.category} · </span>}
                        {p.created_at && format(parseISO(p.created_at), 'd MMM', { locale: sv })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {p.receipt_url && <Image className="w-4 h-4 text-muted-foreground/50" />}
                      <span className="font-extrabold text-sm tabular-nums">{p.amount} kr</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MobileExpenses;
