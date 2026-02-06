import { useState, useEffect } from 'react';
import { mobileApi, MobilePurchase } from '@/services/mobileApiService';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Receipt, Loader2, Image } from 'lucide-react';

interface JobCostsTabProps {
  bookingId: string;
}

const JobCostsTab = ({ bookingId }: JobCostsTabProps) => {
  const [purchases, setPurchases] = useState<MobilePurchase[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    mobileApi.getProjectPurchases(bookingId)
      .then(res => setPurchases(res.purchases || []))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [bookingId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (purchases.length === 0) {
    return (
      <div className="text-center py-12">
        <Receipt className="w-10 h-10 mx-auto text-muted-foreground/20 mb-2" />
        <p className="text-sm text-muted-foreground">Inga kostnader registrerade</p>
      </div>
    );
  }

  const total = purchases.reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <div className="space-y-3">
      {/* Total */}
      <div className="rounded-xl border bg-primary/5 border-primary/20 p-3 text-center">
        <p className="text-xs text-muted-foreground">Total kostnad</p>
        <p className="text-2xl font-bold text-foreground">{total.toLocaleString('sv-SE')} kr</p>
      </div>

      {/* List */}
      {purchases.map(p => (
        <div key={p.id} className="rounded-xl border bg-card p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm">{p.description}</p>
              <p className="text-xs text-muted-foreground">
                {p.supplier && <span>{p.supplier} · </span>}
                {p.category && <span>{p.category} · </span>}
                {p.created_by && <span>{p.created_by} · </span>}
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
  );
};

export default JobCostsTab;
