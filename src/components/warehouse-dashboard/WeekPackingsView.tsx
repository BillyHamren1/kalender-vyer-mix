import { Calendar, Package, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, addDays, isSameDay } from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface WeekPacking {
  id: string;
  bookingId: string;
  bookingNumber: string | null;
  client: string;
  date: Date;
  eventType: 'packing' | 'delivery' | 'return' | 'inventory' | 'unpacking' | 'rig' | 'event' | 'rigdown';
  status: string;
}

interface WeekPackingsViewProps {
  packings: WeekPacking[];
  weekStart: Date;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onCurrentWeek: () => void;
  isLoading: boolean;
}

const getEventTypeStyles = (eventType: string) => {
  switch (eventType) {
    case 'packing':
      return {
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
        cardBgClass: 'bg-amber-50',
        cardBorderClass: 'border-amber-200',
        label: 'PACKNING'
      };
    case 'delivery':
      return {
        badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
        cardBgClass: 'bg-blue-50',
        cardBorderClass: 'border-blue-200',
        label: 'LEVERANS'
      };
    case 'return':
      return {
        badgeClass: 'bg-purple-100 text-purple-800 border-purple-300',
        cardBgClass: 'bg-purple-50',
        cardBorderClass: 'border-purple-200',
        label: 'RETUR'
      };
    case 'inventory':
      return {
        badgeClass: 'bg-green-100 text-green-800 border-green-300',
        cardBgClass: 'bg-green-50',
        cardBorderClass: 'border-green-200',
        label: 'INVENTERING'
      };
    case 'unpacking':
      return {
        badgeClass: 'bg-teal-100 text-teal-800 border-teal-300',
        cardBgClass: 'bg-teal-50',
        cardBorderClass: 'border-teal-200',
        label: 'UPPACKNING'
      };
    case 'rig':
      return {
        badgeClass: 'bg-orange-100 text-orange-800 border-orange-300',
        cardBgClass: 'bg-orange-50',
        cardBorderClass: 'border-orange-200',
        label: 'MONTAGE'
      };
    case 'event':
      return {
        badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300',
        cardBgClass: 'bg-indigo-50',
        cardBorderClass: 'border-indigo-200',
        label: 'EVENT'
      };
    case 'rigdown':
      return {
        badgeClass: 'bg-pink-100 text-pink-800 border-pink-300',
        cardBgClass: 'bg-pink-50',
        cardBorderClass: 'border-pink-200',
        label: 'NEDMONT.'
      };
    default:
      return {
        badgeClass: 'bg-muted text-foreground border-border',
        cardBgClass: 'bg-muted/20',
        cardBorderClass: 'border-border',
        label: eventType.toUpperCase()
      };
  }
};

const EventCard = ({ packing }: { packing: WeekPacking }) => {
  const navigate = useNavigate();
  const styles = getEventTypeStyles(packing.eventType);

  const handleClick = () => {
    if (packing.eventType === 'packing') {
      navigate(`/warehouse/packing?booking=${packing.bookingId}`);
    } else {
      navigate(`/booking/${packing.bookingId}`);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        "group relative rounded-xl border transition-all duration-200 overflow-hidden cursor-pointer",
        styles.cardBgClass,
        styles.cardBorderClass,
        "hover:shadow-md hover:scale-[1.02]"
      )}
    >
      <div className="p-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <span className={cn(
            "px-2 py-0.5 rounded text-[10px] tracking-wide font-medium border",
            styles.badgeClass
          )}>
            {styles.label}
          </span>
          {packing.bookingNumber && (
            <span className="text-xs font-mono text-muted-foreground">
              #{packing.bookingNumber}
            </span>
          )}
        </div>
        
        <h4 className="font-semibold text-sm text-foreground line-clamp-2">
          {packing.client}
        </h4>
      </div>
    </div>
  );
};

const DayColumn = ({
  date,
  packings,
  onDayClick
}: {
  date: Date;
  packings: WeekPacking[];
  onDayClick: (date: Date) => void;
}) => {
  const isToday = isSameDay(date, new Date());
  const isPast = date < new Date() && !isToday;
  const dayPackings = packings.filter(p => isSameDay(p.date, date));
  const dayName = format(date, 'EEEE', { locale: sv });
  const dayNumber = format(date, 'd');
  const monthName = format(date, 'MMM', { locale: sv });

  return (
    <div className={cn(
      "flex flex-col flex-1 min-w-[160px]",
      isPast && "opacity-50"
    )}>
      {/* Day header - clickable */}
      <div 
        onClick={() => onDayClick(date)}
        className={cn(
          "relative rounded-t-xl px-3 py-2.5 text-center border-x border-t cursor-pointer transition-all hover:opacity-80",
          isToday ? "bg-warehouse/15 border-warehouse/30" : "bg-background/60 border-border/30 hover:bg-background/80"
        )}
      >
        {isToday && (
          <div className="pointer-events-none absolute left-1/2 top-2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-warehouse" />
        )}

        <div className={cn(
          "text-[10px] font-bold uppercase tracking-widest",
          isToday ? "text-warehouse" : "text-muted-foreground"
        )}>
          {dayName}
        </div>

        <div className="flex items-baseline justify-center gap-0.5 mt-0.5">
          <span className={cn(
            "text-2xl font-bold tabular-nums tracking-tight",
            isToday ? "text-warehouse" : "text-[hsl(var(--heading))]"
          )}>{dayNumber}</span>
          <span className="text-xs text-muted-foreground">{monthName}.</span>
        </div>
      </div>

      {/* Separator line */}
      <div className={cn(
        "h-px",
        isToday ? "bg-warehouse/40" : "bg-border/40"
      )} />
      
      {/* Packings container */}
      <div className={cn(
        "flex-1 p-2 space-y-2 min-h-[280px] border-x border-b rounded-b-xl",
        isToday ? "bg-warehouse/5 border-warehouse/30" : "bg-card border-border/30"
      )}>
        {dayPackings.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center py-8">
              <Package className="w-10 h-10 mx-auto text-muted-foreground/20 mb-2" />
              <span className="text-sm text-muted-foreground/40">
                Inget arbete
              </span>
            </div>
          </div>
        ) : (
          dayPackings.map(packing => (
            <EventCard 
              key={`${packing.bookingId}-${packing.eventType}`}
              packing={packing}
            />
          ))
        )}
      </div>
    </div>
  );
};

const WeekPackingsView = ({ 
  packings, 
  weekStart,
  onPreviousWeek,
  onNextWeek,
  onCurrentWeek,
  isLoading 
}: WeekPackingsViewProps) => {
  const navigate = useNavigate();
  
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekNumber = format(weekStart, 'w');

  const handleDayClick = (date: Date) => {
    const dateParam = format(date, 'yyyy-MM-dd');
    navigate(`/warehouse/calendar?date=${dateParam}&view=day`);
  };

  return (
    <div className="rounded-2xl shadow-2xl border border-border/40 bg-card overflow-hidden">
      {/* Header */}
      <div
        className="px-6 py-4"
        style={{ background: 'linear-gradient(135deg, hsl(38 92% 50%) 0%, hsl(32 95% 40%) 100%)' }}
      >
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={onPreviousWeek}
              className="text-white hover:bg-white/10 border border-white/30 rounded-lg"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <span className="text-white font-semibold min-w-[80px] text-center tracking-tight">
              Vecka {weekNumber}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={onNextWeek}
              className="text-white hover:bg-white/10 border border-white/30 rounded-lg"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Week grid */}
      <div className="p-3 overflow-x-auto">
        <div className="flex gap-2 min-w-[1120px] items-stretch">
          {days.map(day => (
            <DayColumn 
              key={day.toISOString()}
              date={day}
              packings={packings}
              onDayClick={handleDayClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default WeekPackingsView;
