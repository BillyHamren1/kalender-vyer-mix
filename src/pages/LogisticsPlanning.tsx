import React, { useState } from 'react';
import { format, startOfWeek, addDays, isSameDay, isToday } from 'date-fns';
import { sv } from 'date-fns/locale';
import { 
  Truck, 
  ChevronLeft, 
  ChevronRight, 
  Package, 
  Clock,
  Route,
  Calendar,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { PremiumCard } from '@/components/ui/PremiumCard';
import { useVehicles } from '@/hooks/useVehicles';
import { useTransportAssignments } from '@/hooks/useTransportAssignments';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import TransportBookingTab from '@/components/logistics/TransportBookingTab';

const LogisticsPlanning: React.FC = () => {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  const { vehicles, activeVehicles, isLoading: vehiclesLoading } = useVehicles();
  const { 
    assignments, 
    getAssignmentsByVehicle, 
    isLoading: assignmentsLoading 
  } = useTransportAssignments(selectedDate);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const navigateWeek = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => addDays(prev, direction === 'prev' ? -7 : 7));
  };

  return (
    <PageContainer>
      {/* Header */}
      <PageHeader
        icon={Truck}
        title="Transport"
        subtitle={`Vecka ${format(currentDate, 'w', { locale: sv })}`}
      >
        <Button 
          variant="outline" 
          onClick={() => navigate('/logistics/vehicles')}
          className="rounded-xl"
        >
          <Truck className="h-4 w-4 mr-2" />
          Fordon & Partners
        </Button>
        <Button 
          variant="outline" 
          onClick={() => navigate('/logistics/routes')}
          className="rounded-xl"
        >
          <Route className="h-4 w-4 mr-2" />
          Rutter
        </Button>
      </PageHeader>

      {/* Weekly Schedule — primary overview */}
      <PremiumCard
        icon={Calendar}
        title="Veckans körningar"
        subtitle={`${format(weekStart, 'd MMM.', { locale: sv })} — ${format(addDays(weekStart, 6), 'd MMM.', { locale: sv })}`}
        headerAction={
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigateWeek('prev')} 
              className="rounded-xl h-9 w-9"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCurrentDate(new Date());
                setSelectedDate(new Date());
              }}
              className="rounded-xl h-9 text-sm font-medium"
            >
              Idag
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigateWeek('next')} 
              className="rounded-xl h-9 w-9"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      >
        {/* Day selector — dashboard calendar style */}
        <div className="grid grid-cols-7 gap-2 mb-5">
          {weekDays.map(day => {
            const isSelected = isSameDay(day, selectedDate);
            const isTodayDate = isToday(day);
            const dayStr = format(day, 'yyyy-MM-dd');
            const dayAssignments = assignments.filter(a => a.transport_date === dayStr);
            
            return (
              <button
                key={day.toISOString()}
                className={cn(
                  "flex flex-col items-center py-3 px-2 rounded-2xl transition-all cursor-pointer border-2",
                  isSelected 
                    ? "bg-primary text-primary-foreground border-primary shadow-lg" 
                    : "bg-transparent border-transparent hover:bg-muted/50",
                  isTodayDate && !isSelected && "border-primary/30 bg-primary/5"
                )}
                onClick={() => setSelectedDate(day)}
              >
                <span className={cn(
                  "text-[11px] font-semibold uppercase tracking-widest",
                  isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                )}>
                  {format(day, 'EEE', { locale: sv })}
                </span>
                <span className={cn(
                  "text-2xl font-bold mt-1",
                  isSelected ? "text-primary-foreground" : "text-foreground"
                )}>
                  {format(day, 'd')}
                </span>
                {dayAssignments.length > 0 && (
                  <span className={cn(
                    "text-[9px] font-bold mt-1 w-5 h-5 rounded-full flex items-center justify-center",
                    isSelected 
                      ? "bg-primary-foreground/20 text-primary-foreground" 
                      : "bg-primary/10 text-primary"
                  )}>
                    {dayAssignments.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected day assignments */}
        <div className="space-y-2">
          {assignmentsLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div key={i} className="h-14 bg-muted/50 animate-pulse rounded-xl" />
              ))}
            </div>
          ) : assignments.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-20" />
              Inga körningar {format(selectedDate, 'EEEE d MMMM', { locale: sv })}
            </div>
          ) : (
            <>
              {activeVehicles
                .map(vehicle => ({
                  vehicle,
                  vehicleAssignments: getAssignmentsByVehicle(vehicle.id),
                }))
                .filter(g => g.vehicleAssignments.length > 0)
                .map(({ vehicle, vehicleAssignments }) => (
                  <div key={vehicle.id} className="rounded-xl border border-border/40 bg-background/60 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border/20">
                      <div className="p-1 rounded-md bg-primary/10">
                        <Truck className="h-3 w-3 text-primary" />
                      </div>
                      <span className="text-xs font-semibold text-foreground">{vehicle.name}</span>
                      {vehicle.registration_number && (
                        <span className="text-[10px] text-muted-foreground">{vehicle.registration_number}</span>
                      )}
                      <Badge variant="outline" className="ml-auto text-[10px] h-5">
                        {vehicleAssignments.length} stopp
                      </Badge>
                    </div>
                    <div className="divide-y divide-border/20">
                      {vehicleAssignments.map((assignment, idx) => (
                        <div 
                          key={assignment.id}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors cursor-pointer"
                          onClick={() => {
                            if (assignment.booking_id) navigate(`/booking/${assignment.booking_id}`);
                          }}
                        >
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                            {assignment.stop_order || idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {assignment.booking?.client || 'Okänd kund'}
                            </p>
                            {assignment.booking?.deliveryaddress && (
                              <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                                <MapPin className="h-2.5 w-2.5 shrink-0" />
                                {assignment.booking.deliveryaddress}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </>
          )}
        </div>
      </PremiumCard>

      {/* Transport Booking - 3 columns */}
      <TransportBookingTab vehicles={vehicles} />
    </PageContainer>
  );
};

export default LogisticsPlanning;
