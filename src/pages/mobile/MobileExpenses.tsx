import { useState, useRef } from 'react';
import { mobileApi } from '@/services/mobileApiService';
import { useMobileBookings, useMobileBookingPurchases, useInvalidateMobileData } from '@/hooks/useMobileData';
import { format, parseISO } from 'date-fns';
import { sv, enUS } from 'date-fns/locale';
import { Receipt, Camera, Loader2, Check, Image } from 'lucide-react';
import { MobileHeroHeader } from '@/components/mobile-app/MobileHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { takePhotoBase64 } from '@/utils/capacitorCamera';
import { useLanguage } from '@/i18n/LanguageContext';

const categoryKeys = ['Material', 'Transport', 'Mat', 'Verktyg', 'Övrigt'] as const;
const categoryToToken: Record<string, string> = {
  Material: 'expenses.cat.material',
  Transport: 'expenses.cat.transport',
  Mat: 'expenses.cat.food',
  Verktyg: 'expenses.cat.tools',
  'Övrigt': 'expenses.cat.other',
};

const MobileExpenses = () => {
  const { t, locale } = useLanguage();
  const dfLocale = locale === 'sv' ? sv : enUS;
  const numberLocale = locale === 'sv' ? 'sv-SE' : 'en-US';

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

  const labelForCategory = (raw: string | null | undefined) => {
    if (!raw) return '';
    const tok = categoryToToken[raw];
    return tok ? t(tok as any) : raw;
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
      toast.error(t('expenses.fillJobDescAmount'));
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
      toast.success(t('expenses.savedToast'));
      invalidatePurchases();
      setActiveTab('history');
      setDescription('');
      setAmount('');
      setSupplier('');
      setCategory('');
      setReceiptPreview(null);
      setReceiptBase64(null);
    } catch (err: any) {
      toast.error(err.message || t('expenses.couldNotSave'));
    } finally {
      setIsSaving(false);
    }
  };

  const totalAmount = allPurchases.reduce((sum, p) => sum + (p.amount || 0), 0);

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-card">
        <MobileHeroHeader eyebrow={t('expenses.eyebrow')} title={t('expenses.title')} subtitle={t('expenses.subtitle')} />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-card pb-24">
      <MobileHeroHeader
        eyebrow={t('expenses.eyebrow')}
        title={t('expenses.title')}
        subtitle={t('expenses.subtitle')}
        rightAction={
          allPurchases.length > 0 ? (
            <div className="text-right">
              <p className="text-lg font-extrabold text-primary-foreground tabular-nums">
                {totalAmount.toLocaleString(numberLocale)} kr
              </p>
              <p className="text-[10px] text-primary-foreground/50 font-medium">
                {t('expenses.expensesCount', { n: allPurchases.length })}
              </p>
            </div>
          ) : undefined
        }
      />

      <div className="flex mx-4 mt-3 bg-muted rounded-xl p-0.5">
        <button
          onClick={() => setActiveTab('new')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'new' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
          }`}
        >
          {t('expenses.tabsNew')}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'history' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
          }`}
        >
          {t('expenses.tabsSaved')}
        </button>
      </div>

      <div className="flex-1 flex flex-col px-4 py-3">
        {activeTab === 'new' ? (
          <div className="flex-1 rounded-2xl border border-primary/20 bg-card px-4 py-3 space-y-3 shadow-md">
            <h2 className="font-bold text-sm text-foreground">{t('expenses.newExpense')}</h2>

            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{t('expenses.job')}</Label>
              <Select value={selectedBookingId} onValueChange={setSelectedBookingId}>
                <SelectTrigger className="h-10 rounded-xl text-sm">
                  <SelectValue placeholder={t('expenses.selectJob')} />
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
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{t('expenses.receipt')}</Label>
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
                  <img src={receiptPreview} alt={t('expenses.receipt')} className="w-full h-32 object-cover" />
                  <button
                    onClick={() => { setReceiptPreview(null); setReceiptBase64(null); }}
                    className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-foreground/70 text-card text-[11px] font-medium backdrop-blur-sm"
                  >
                    {t('expenses.remove')}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleCameraClick}
                  className="w-full h-20 rounded-xl border border-dashed border-primary/25 flex flex-col items-center justify-center gap-1 bg-primary/5 transition-colors"
                >
                  <Camera className="w-5 h-5 text-primary/70" />
                  <span className="text-[11px] font-semibold text-primary">{t('expenses.takePhoto')}</span>
                </button>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{t('expenses.description')}</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={t('expenses.descriptionPlaceholder')}
                className="rounded-xl min-h-[52px] text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{t('expenses.amount')}</Label>
                <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="h-10 rounded-xl text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{t('expenses.category')}</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-10 rounded-xl text-sm">
                    <SelectValue placeholder={t('expenses.selectCategory')} />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryKeys.map(c => (
                      <SelectItem key={c} value={c}>{labelForCategory(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{t('expenses.supplier')}</Label>
              <Input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder={t('expenses.supplierPlaceholder')} className="h-10 rounded-xl text-sm" />
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1 h-10 rounded-xl text-sm font-semibold" onClick={() => setActiveTab('history')}>{t('expenses.cancel')}</Button>
              <Button
                className="flex-1 h-10 rounded-xl gap-1.5 text-sm font-semibold active:scale-[0.98] transition-all"
                onClick={handleSubmit}
                disabled={isSaving}
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {t('expenses.save')}
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
                <p className="text-sm font-semibold text-foreground/60">{t('expenses.noExpenses')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('expenses.createNew')}</p>
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
                          {p.category && <span>{labelForCategory(p.category)} · </span>}
                          {p.created_at && format(parseISO(p.created_at), 'd MMM', { locale: dfLocale })}
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
