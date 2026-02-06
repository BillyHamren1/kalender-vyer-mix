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

  // Form
  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [supplier, setSupplier] = useState('');
  const [category, setCategory] = useState('');
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptBase64, setReceiptBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      mobileApi.getBookings(),
    ]).then(([bookingsRes]) => {
      setBookings(bookingsRes.bookings);
    }).catch(() => toast.error('Kunde inte ladda data'))
      .finally(() => setIsLoading(false));
  }, []);

  // Load purchases when booking selected
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
      // Refresh
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
      <div className="flex flex-col min-h-screen">
        <div className="bg-gradient-to-r from-primary to-primary/80 px-5 pt-12 pb-5 safe-area-top">
          <h1 className="text-xl font-bold text-primary-foreground">Utlägg</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-primary/80 px-5 pt-12 pb-5 safe-area-top">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-primary-foreground">Utlägg</h1>
            <p className="text-xs text-primary-foreground/70">Kvitton & inköp</p>
          </div>
          <Button
            onClick={() => setShowForm(!showForm)}
            className="rounded-xl bg-primary-foreground text-primary hover:bg-primary-foreground/90 gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Nytt utlägg
          </Button>
        </div>
      </div>

      <div className="flex-1 px-4 py-4 space-y-4">
        {/* Form */}
        {showForm && (
          <div className="rounded-xl border bg-card p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
            <h2 className="font-semibold text-sm">Nytt utlägg</h2>

            <div className="space-y-2">
              <Label className="text-xs">Jobb</Label>
              <Select value={selectedBookingId} onValueChange={setSelectedBookingId}>
                <SelectTrigger className="h-11 rounded-lg">
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
              <Label className="text-xs">Beskrivning</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Vad köpte du..."
                className="rounded-lg min-h-[60px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Belopp (kr)</Label>
                <Input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0"
                  className="h-11 rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Kategori</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-11 rounded-lg">
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
              <Label className="text-xs">Leverantör</Label>
              <Input
                value={supplier}
                onChange={e => setSupplier(e.target.value)}
                placeholder="Butik/företag"
                className="h-11 rounded-lg"
              />
            </div>

            {/* Receipt photo */}
            <div className="space-y-2">
              <Label className="text-xs">Kvitto (foto)</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />
              {receiptPreview ? (
                <div className="relative rounded-lg overflow-hidden border">
                  <img src={receiptPreview} alt="Kvitto" className="w-full h-40 object-cover" />
                  <button
                    onClick={() => { setReceiptPreview(null); setReceiptBase64(null); }}
                    className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-black/50 text-white text-xs"
                  >
                    Ta bort
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-24 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 hover:border-primary/40 transition-colors"
                >
                  <Camera className="w-6 h-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Ta foto av kvitto</span>
                </button>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 rounded-lg" onClick={() => setShowForm(false)}>Avbryt</Button>
              <Button className="flex-1 rounded-lg gap-1.5" onClick={handleSubmit} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Spara
              </Button>
            </div>
          </div>
        )}

        {/* Purchase history */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Senaste utlägg</h2>
          {purchases.length === 0 ? (
            <div className="text-center py-8">
              <Receipt className="w-10 h-10 mx-auto text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">Inga utlägg registrerade</p>
              <p className="text-xs text-muted-foreground mt-1">Välj ett jobb ovan för att se historik</p>
            </div>
          ) : (
            <div className="space-y-2">
              {purchases.map(p => (
                <div key={p.id} className="rounded-xl border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">{p.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.supplier && <span>{p.supplier} · </span>}
                        {p.category && <span>{p.category} · </span>}
                        {p.created_at && format(parseISO(p.created_at), 'd MMM', { locale: sv })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {p.receipt_url && <Image className="w-4 h-4 text-muted-foreground" />}
                      <span className="font-bold text-sm">{p.amount} kr</span>
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
