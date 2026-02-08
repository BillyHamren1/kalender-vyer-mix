import { format, differenceInDays, isPast, isToday } from "date-fns";
import { sv } from "date-fns/locale";
import { Truck, PartyPopper, ArrowDownToLine } from "lucide-react";

interface ProjectScheduleTimelineProps {
  rigDate?: string | null;
  eventDate?: string | null;
  rigdownDate?: string | null;
}

const ProjectScheduleTimeline = ({ rigDate, eventDate, rigdownDate }: ProjectScheduleTimelineProps) => {
  if (!rigDate && !eventDate && !rigdownDate) return null;

  const dates = [
    { key: 'rig', label: 'Rigg', date: rigDate, icon: Truck },
    { key: 'event', label: 'Event', date: eventDate, icon: PartyPopper },
    { key: 'rigdown', label: 'Nedrivning', date: rigdownDate, icon: ArrowDownToLine },
  ].filter(d => d.date);

  const getCountdownText = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    
    if (isToday(date)) return 'Idag';
    const days = differenceInDays(date, today);
    if (days < 0) return `${Math.abs(days)} dagar sedan`;
    if (days === 1) return 'Imorgon';
    return `Om ${days} dagar`;
  };

  return (
    <div className="flex items-center gap-2 w-full">
      {dates.map((item, index) => {
        const date = new Date(item.date!);
        const past = isPast(date) && !isToday(date);
        const today = isToday(date);
        const Icon = item.icon;
        
        return (
          <div key={item.key} className="flex items-center flex-1">
            <div className={`flex-1 rounded-xl p-3 border transition-all ${
              today 
                ? 'border-primary/40 bg-accent shadow-sm' 
                : past 
                  ? 'border-border/30 bg-muted/50 opacity-70' 
                  : 'border-border/40 bg-card'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-5 h-5 rounded-md flex items-center justify-center"
                  style={{ background: today ? 'var(--gradient-icon)' : undefined, backgroundColor: today ? undefined : 'hsl(var(--muted))' }}
                >
                  <Icon className={`h-3 w-3 ${today ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {item.label}
                </span>
              </div>
              <p className="font-semibold text-sm text-foreground tracking-tight">
                {format(date, 'd MMM yyyy', { locale: sv })}
              </p>
              <p className={`text-xs mt-0.5 ${
                today ? 'text-primary font-semibold' : 'text-muted-foreground'
              }`}>
                {getCountdownText(item.date!)}
              </p>
            </div>
            {index < dates.length - 1 && (
              <div className="w-6 h-px bg-border/40 flex-shrink-0 mx-1" />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ProjectScheduleTimeline;
