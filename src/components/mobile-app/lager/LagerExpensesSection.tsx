import { useEffect, useRef, useState } from 'react';
import { mobileApi } from '@/services/mobileApiService';
import { Receipt, Plus, Loader2, Camera, X, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { takePhotoBase64 } from '@/utils/capacitorCamera';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { sv, enUS } from 'date-fns/locale';
import { useLanguage } from '@/i18n/LanguageContext';
import { openFileExternally } from '@/lib/files/openFileExternally';

const LagerExpensesSection = () => {
  const { t, locale } = useLanguage();
  const dateFnsLocale = locale === 'en' ? enUS : sv;
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [supplier, setSupplier] = useState('');
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    mobileApi.getLagerPurchases()
      .then(res => setPurchases(res.purchases || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCamera = async () => {
    const base64 = await takePhotoBase64();
    if (base64) setReceiptImage(base64);
    else fileInputRef.current?.click();
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setReceiptImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!description.trim() || !amt || isNaN(amt)) {
      toast.error(t('lager.descAndAmountRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await mobileApi.createLagerPurchase({
        description: description.trim(),
        amount: amt,
        supplier: supplier.trim() || undefined,
        receipt_image: receiptImage || undefined,
      });
      toast.success(t('lager.purchaseSaved'));
      setDescription('');
      setAmount('');
      setSupplier('');
      setReceiptImage(null);
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message || t('common.couldNotSave'));
    } finally {
      setSubmitting(false);
    }
  };

  const total = purchases.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <Receipt className="w-3.5 h-3.5 text-muted-foreground" />
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {t('lager.purchases')}
          </h2>
          {purchases.length > 0 && (
            <span className="text-[11px] text-muted-foreground">
              · {total.toLocaleString(locale === 'en' ? 'en-US' : 'sv-SE')} kr
            </span>
          )}
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 text-xs font-semibold text-primary active:opacity-70"
        >
          <Plus className="w-3.5 h-3.5" /> {t('lager.new')}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : purchases.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-5 text-center">
          <p className="text-sm text-muted-foreground">{t('lager.noPurchases')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {purchases.map((p: any) => (
            <div key={p.id} className="rounded-2xl border bg-card p-3 flex items-center gap-3">
              {p.receipt_url ? (
                <a href={p.receipt_url} target="_blank" rel="noreferrer" className="shrink-0">
                  <img src={p.receipt_url} alt="" className="w-12 h-12 rounded-lg object-cover bg-muted" />
                </a>
              ) : (
                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Receipt className="w-5 h-5 text-muted-foreground/50" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{p.description}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {p.supplier ? `${p.supplier} · ` : ''}
                  {p.created_by || ''}
                  {p.purchase_date && ` · ${format(new Date(p.purchase_date), 'd MMM', { locale: dateFnsLocale })}`}
                </p>
              </div>
              <p className="text-sm font-bold text-foreground shrink-0">
                {Number(p.amount).toLocaleString(locale === 'en' ? 'en-US' : 'sv-SE')} kr
              </p>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('lager.newPurchaseTitle')}</DialogTitle>
          </DialogHeader>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>{t('lager.descLabel')}</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('lager.descPlaceholder')}
                rows={2}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>{t('lager.amountLabel')}</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('lager.supplierLabel')}</Label>
                <Input
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder={t('lager.optional')}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('lager.receipt')}</Label>
              {receiptImage ? (
                <div className="relative rounded-xl overflow-hidden border bg-muted">
                  <img src={receiptImage} alt={t('lager.receipt')} className="w-full max-h-48 object-contain" />
                  <button
                    onClick={() => setReceiptImage(null)}
                    className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" onClick={handleCamera} className="gap-2">
                    <Camera className="w-4 h-4" /> {t('lager.photo')}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
                    <ImageIcon className="w-4 h-4" /> {t('lager.choose')}
                  </Button>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>{t('common.cancel')}</Button>
            <Button onClick={handleSubmit} disabled={submitting || !description.trim() || !amount}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LagerExpensesSection;
