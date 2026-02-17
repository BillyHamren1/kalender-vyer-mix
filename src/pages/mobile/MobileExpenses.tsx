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
  const [allPurchases, setAllPurchases] = useState<(MobilePurchase & { booking_client?: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');

  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [supplier, setSupplier] = useState('');
  const [category, setCategory] = useState('');
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptBase64, setReceiptBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    mobileApi.getBookings()
      .then(async (res) => {
        if (cancelled) return;
        const bks = res.bookings;
        setBookings(bks);
        if (bks.length === 1) setSelectedBookingId(bks[0].id);

        const allResults = await Promise.allSettled(
          bks.map(b =>
            mobileApi.getProjectPurchases(b.id).then(r =>
              (r.purchases || []).map(p => ({ ...p, booking_client: b.client }))
            )
          )
        );
        if (cancelled) return;

        const merged = allResults
          .filter(r => r.status === 'fulfilled')
          .flatMap(r => (r as PromiseFulfilledResult<(MobilePurchase & { booking_client?: string })[]>).value)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        setAllPurchases(merged);
        if (merged.length === 0) setActiveTab('new');
      })
      .catch(() => toast.error('Kunde inte ladda data'))
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, []);

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
      setActiveTab('history');
      setDescription('');
      setAmount('');
      setSupplier('');
      setCategory('');
      setReceiptPreview(null);
      setReceiptBase64(null);

      const allResults = await Promise.allSettled(
        bookings.map(b =>
          mobileApi.getProjectPurchases(b.id).then(r =>
            (r.purchases || []).map(p => ({ ...p, booking_client: b.client }))
          )
        )
      );
      const merged = allResults
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => (r as PromiseFulfilledResult<(MobilePurchase & { booking_client?: string })[]>).value)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setAllPurchases(merged);
    } catch (err: any) {
      toast.error(err.message || 'Kunde inte spara utlägg');
    } finally {
      setIsSaving(false);
    }
  };

  const totalAmount = allPurchases.reduce((sum, p) => sum + (p.amount || 0), 0);

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-card">
        <div className="bg-primary px-5 pt-14 pb-5 safe-area-top rounded-b-3xl shadow-md">
          <h1 className="text-[22px] font-extrabold text-primary-foreground tracking-tight">Utlägg</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      </div>
    );
  }



  return (
    <div className="flex flex-col min-h-screen bg-card">
      {/* Header */}
      <div className="bg-primary px-5 pt-14 pb-3 safe-area-top rounded-b-3xl shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-extrabold text-primary-foreground tracking-tight">Utlägg</h1>
            <p className="text-xs text-primary-foreground/60 font-medium mt-0.5">Kvitton & inköp</p>
          </div>
          {allPurchases.length > 0 && (
            <div className="text-right">
              <p className="text-lg font-extrabold text-primary-foreground tabular-nums">
                {totalAmount.toLocaleString('sv-SE')} kr
              </p>
              <p className="text-[10px] text-primary-foreground/50 font-medium">
                {allPurchases.length} utlägg
              </p>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex mt-3 bg-primary-foreground/10 rounded-xl p-0.5">
          <button
            onClick={() => setActiveTab('new')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'new'
                ? 'bg-primary-foreground text-primary shadow-sm'
                : 'text-primary-foreground/70'
            }`}
          >
            Nytt utlägg
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'history'
                ? 'bg-primary-foreground text-primary shadow-sm'
                : 'text-primary-foreground/70'
            }`}
          >
            Sparade utlägg
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 py-3">
        {activeTab === 'new' ? (
          /* New expense form */
          <div className="rounded-2xl border border-primary/20 bg-card px-4 py-3 space-y-3 shadow-md">
            <h2 className="font-bold text-sm text-foreground">Nytt utlägg</h2>

            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Jobb</Label>
              <Select value={selectedBookingId} onValueChange={setSelectedBookingId}>
                <SelectTrigger className="h-10 rounded-xl text-sm">
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

            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Kvitto</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />
              {receiptPreview ? (
                <div className="relative rounded-xl overflow-hidden border border-border/50">
                  <img src={receiptPreview} alt="Kvitto" className="w-full h-32 object-cover" />
                  <button
                    onClick={() => { setReceiptPreview(null); setReceiptBase64(null); }}
                    className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-foreground/70 text-card text-[11px] font-medium backdrop-blur-sm"
                  >
                    Ta bort
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-20 rounded-xl border border-dashed border-primary/25 flex flex-col items-center justify-center gap-1 bg-primary/5 transition-colors"
                >
                  <Camera className="w-5 h-5 text-primary/70" />
                  <span className="text-[11px] font-semibold text-primary">Ta foto av kvitto</span>
                </button>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Beskrivning</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Vad köpte du..."
                className="rounded-xl min-h-[52px] text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Belopp (kr)</Label>
                <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="h-10 rounded-xl text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Kategori</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-10 rounded-xl text-sm">
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

            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Leverantör</Label>
              <Input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Butik/företag" className="h-10 rounded-xl text-sm" />
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1 h-10 rounded-xl text-sm font-semibold" onClick={() => setActiveTab('history')}>Avbryt</Button>
              <Button 
                className="flex-1 h-10 rounded-xl gap-1.5 text-sm font-semibold active:scale-[0.98] transition-all" 
                onClick={handleSubmit} 
                disabled={isSaving}
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Spara
              </Button>
            </div>
          </div>
        ) : (
          /* Purchase history */
          <div>
            {allPurchases.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                  <Receipt className="w-7 h-7 text-muted-foreground/30" />
                </div>
                <p className="text-sm font-semibold text-foreground/60">Inga utlägg registrerade</p>
                <p className="text-xs text-muted-foreground mt-1">Skapa ett nytt utlägg via fliken ovan</p>
              </div>
            ) : (
              <div className="space-y-2">
                {allPurchases.map(p => (
                  <div key={p.id} className="rounded-2xl border border-primary/20 bg-card p-3 shadow-md">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm text-foreground">{p.description}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {p.booking_client && <span>{p.booking_client} · </span>}
                          {p.supplier && <span>{p.supplier} · </span>}
                          {p.category && <span>{p.category} · </span>}
                          {p.created_at && format(parseISO(p.created_at), 'd MMM', { locale: sv })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {p.receipt_url && <Image className="w-3.5 h-3.5 text-muted-foreground/40" />}
                        <span className="font-extrabold text-sm tabular-nums">{p.amount} kr</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileExpenses;
