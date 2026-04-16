import { useState, useRef } from 'react';
import { mobileApi, MobileBooking, MobilePurchase } from '@/services/mobileApiService';
import { useMobileBookings, useMobileBookingPurchases, useInvalidateMobileData } from '@/hooks/useMobileData';
import { format, parseISO } from 'date-fns';
import { Receipt, Camera, Plus, Loader2, Check, Image } from 'lucide-react';
import { MobileHeroHeader } from '@/components/mobile-app/MobileHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { takePhotoBase64 } from '@/utils/capacitorCamera';

const categories = ['Material', 'Transport', 'Mat', 'Verktyg', 'Övrigt'];
const categoryLabelsEN: Record<string, string> = {
  Material: 'Materials',
  Transport: 'Transport',
  Mat: 'Food',
  Verktyg: 'Tools',
  Övrigt: 'Other',
};

const MobileExpenses = () => {
  const { data: bookings = [], isLoading: isLoadingBookings } = useMobileBookings();
  const { data: allPurchases = [], isLoading: isLoadingPurchases } = useMobileBookingPurchases(bookings);
  const { invalidatePurchases } = useInvalidateMobileData();
  const isLoading = isLoadingBookings || (bookings.length > 0 && isLoadingPurchases);
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

  const handleCameraClick = async () => {
    const base64 = await takePhotoBase64();
    if (base64) {
      setReceiptPreview(base64);
      setReceiptBase64(base64);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleSubmit = async () => {
    if (!selectedBookingId || !description.trim() || !amount) {
      toast.error('Fill in job, description, and amount');
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
      toast.success('Expense saved!');
      invalidatePurchases();
      setActiveTab('history');
      setDescription('');
      setAmount('');
      setSupplier('');
      setCategory('');
      setReceiptPreview(null);
      setReceiptBase64(null);
    } catch (err: any) {
      toast.error(err.message || 'Could not save expense');
    } finally {
      setIsSaving(false);
    }
  };

  const totalAmount = allPurchases.reduce((sum, p) => sum + (p.amount || 0), 0);

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-card">
        <MobileHeroHeader eyebrow="EXPENSES" title="Expenses" subtitle="Receipts & purchases" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      </div>
    );
  }



  return (
    <div className="flex flex-col min-h-screen bg-card pb-24">
      <MobileHeroHeader
        eyebrow="EXPENSES"
        title="Expenses"
        subtitle="Receipts & purchases"
        rightAction={
          allPurchases.length > 0 ? (
            <div className="text-right">
              <p className="text-lg font-extrabold text-primary-foreground tabular-nums">
                {totalAmount.toLocaleString('sv-SE')} kr
              </p>
              <p className="text-[10px] text-primary-foreground/50 font-medium">
                {allPurchases.length} expenses
              </p>
            </div>
          ) : undefined
        }
      />

      {/* Tabs */}
      <div className="flex mx-4 mt-3 bg-muted rounded-xl p-0.5">
        <button
          onClick={() => setActiveTab('new')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'new'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground'
          }`}
        >
          New expense
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'history'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground'
          }`}
        >
          Saved expenses
        </button>
      </div>

      <div className="flex-1 flex flex-col px-4 py-3">
        {activeTab === 'new' ? (
          <div className="flex-1 rounded-2xl border border-primary/20 bg-card px-4 py-3 space-y-3 shadow-md">
            <h2 className="font-bold text-sm text-foreground">New expense</h2>

            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Job</Label>
              <Select value={selectedBookingId} onValueChange={setSelectedBookingId}>
                <SelectTrigger className="h-10 rounded-xl text-sm">
                  <SelectValue placeholder="Select job..." />
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
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Receipt</Label>
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
                  <img src={receiptPreview} alt="Receipt" className="w-full h-32 object-cover" />
                  <button
                    onClick={() => { setReceiptPreview(null); setReceiptBase64(null); }}
                    className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-foreground/70 text-card text-[11px] font-medium backdrop-blur-sm"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleCameraClick}
                  className="w-full h-20 rounded-xl border border-dashed border-primary/25 flex flex-col items-center justify-center gap-1 bg-primary/5 transition-colors"
                >
                  <Camera className="w-5 h-5 text-primary/70" />
                  <span className="text-[11px] font-semibold text-primary">Take photo of receipt</span>
                </button>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Description</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What did you buy..."
                className="rounded-xl min-h-[52px] text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Amount (SEK)</Label>
                <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="h-10 rounded-xl text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-10 rounded-xl text-sm">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c} value={c}>{categoryLabelsEN[c] || c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Supplier</Label>
              <Input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Store/company" className="h-10 rounded-xl text-sm" />
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1 h-10 rounded-xl text-sm font-semibold" onClick={() => setActiveTab('history')}>Cancel</Button>
              <Button 
                className="flex-1 h-10 rounded-xl gap-1.5 text-sm font-semibold active:scale-[0.98] transition-all" 
                onClick={handleSubmit} 
                disabled={isSaving}
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1">
            {allPurchases.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                  <Receipt className="w-7 h-7 text-muted-foreground/30" />
                </div>
                <p className="text-sm font-semibold text-foreground/60">No expenses registered</p>
                <p className="text-xs text-muted-foreground mt-1">Create a new expense using the tab above</p>
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
                          {p.category && <span>{categoryLabelsEN[p.category] || p.category} · </span>}
                          {p.created_at && format(parseISO(p.created_at), 'd MMM')}
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
