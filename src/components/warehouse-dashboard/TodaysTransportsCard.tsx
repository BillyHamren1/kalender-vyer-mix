import { Truck, ArrowUpFromLine, ArrowDownToLine, Clock, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format, isToday, isTomorrow, differenceInDays } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

export interface TransportItem {
  id: string;
  bookingId: string;
  client: string;
  bookingNumber: string | null;
  transportDate: string;
  transportTime: string | null;
  deliveryAddress: string | null;
  type: 'lastning' | 'lossning';
  vehicleName: string | null;
  status: string;
}

interface TodaysTransportsCardProps {
  transports: TransportItem[];
  isLoading: boolean;
}

const TodaysTransportsCard = ({ transports, isLoading }: TodaysTransportsCardProps) => {
  const navigate = useNavigate();

  // Group by date
  const todayTransports = transports.filter(t => isToday(new Date(t.transportDate)));
  const tomorrowTransports = transports.filter(t => isTomorrow(new Date(t.transportDate)));
  const upcomingTransports = transports.filter(t => {
    const d = new Date(t.transportDate);
    return !isToday(d) && !isTomorrow(d);
  });

  const renderTransport = (t: TransportItem) => {
    const isLastning = t.type === 'lastning';
    return (
      <div
        key={t.id}
        className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/30 cursor-pointer transition-colors"
        onClick={() => navigate('/logistics')}
      >
        <div className={`p-1.5 rounded-md ${isLastning ? 'bg-warehouse/10 text-warehouse' : 'bg-primary/10 text-primary'}`}>
          {isLastning ? <ArrowUpFromLine className="h-3.5 w-3.5" /> : <ArrowDownToLine className="h-3.5 w-3.5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-foreground truncate">{t.client}</span>
            <Badge variant="outline" className={`text-[9px] px-1 py-0 ${isLastning ? 'border-warehouse/40 text-warehouse' : 'border-primary/40 text-primary'}`}>
              {isLastning ? 'Lastning' : 'Lossning'}
            </Badge>
          </div>
          {t.deliveryAddress && (
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin className="h-2.5 w-2.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground truncate">{t.deliveryAddress}</span>
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          {t.transportTime && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {t.transportTime}
            </div>
          )}
          {t.vehicleName && (
            <span className="text-[10px] text-muted-foreground">{t.vehicleName}</span>
          )}
        </div>
      </div>
    );
  };

  const renderSection = (title: string, items: TransportItem[]) => {
    if (items.length === 0) return null;
    return (
      <div>
        <div className="px-3 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
        </div>
        <div className="space-y-0.5">
          {items.map(renderTransport)}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-border/40 bg-card shadow-sm h-full flex flex-col">
      <div className="px-5 py-3 border-b border-border/30 flex items-center gap-2">
        <Truck className="h-4 w-4 text-warehouse" />
        <h3 className="text-sm font-semibold text-[hsl(var(--heading))]">Transporter</h3>
        {todayTransports.length > 0 && (
          <Badge className="bg-warehouse/15 text-warehouse text-[10px] px-1.5 py-0 ml-auto">
            {todayTransports.length} idag
          </Badge>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-warehouse border-t-transparent" />
          </div>
        ) : transports.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">
            Inga kommande transporter
          </div>
        ) : (
          <div className="space-y-2">
            {renderSection('Idag', todayTransports)}
            {renderSection('Imorgon', tomorrowTransports)}
            {renderSection('Kommande', upcomingTransports)}
          </div>
        )}
      </div>
    </div>
  );
};

export default TodaysTransportsCard;
