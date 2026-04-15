import { useState } from 'react';
import { Users, Check, Clock, X, CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWarehouseStaffActivations, WarehouseStaffMember } from '@/hooks/useWarehouseStaffActivations';
import { format } from 'date-fns';

const StaffRow = ({
  staff,
  onActivatePermanent,
  onActivateTemporary,
  onDeactivate,
}: {
  staff: WarehouseStaffMember;
  onActivatePermanent: (id: string) => void;
  onActivateTemporary: (params: { staffId: string; startDate: string; endDate: string }) => void;
  onDeactivate: (id: string) => void;
}) => {
  const [periodOpen, setPeriodOpen] = useState(false);
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState('');

  const handlePeriodSubmit = () => {
    if (!endDate) return;
    onActivateTemporary({ staffId: staff.id, startDate, endDate });
    setPeriodOpen(false);
  };

  const statusBadge = () => {
    if (!staff.activation?.is_active || !staff.isCurrentlyActive) {
      return <Badge variant="outline" className="text-xs text-muted-foreground">Ej aktiv</Badge>;
    }
    if (staff.activation.activation_type === 'permanent') {
      return <Badge className="text-xs bg-emerald-500/15 text-emerald-700 border-emerald-200 hover:bg-emerald-500/20">Tillsvidare</Badge>;
    }
    return (
      <Badge className="text-xs bg-amber-500/15 text-amber-700 border-amber-200 hover:bg-amber-500/20">
        t.o.m. {staff.activation.end_date}
      </Badge>
    );
  };

  return (
    <div className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${staff.isCurrentlyActive ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
        <span className="text-sm font-medium truncate">{staff.name}</span>
        {statusBadge()}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {staff.isCurrentlyActive ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
            onClick={() => onDeactivate(staff.id)}
          >
            <X className="h-3 w-3 mr-1" />
            Avaktivera
          </Button>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onActivatePermanent(staff.id)}
            >
              <Check className="h-3 w-3 mr-1" />
              Tillsvidare
            </Button>

            <Popover open={periodOpen} onOpenChange={setPeriodOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                  <CalendarRange className="h-3 w-3 mr-1" />
                  Period
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72" align="end">
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Aktivera för period</h4>
                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs">Startdatum</Label>
                      <Input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Slutdatum</Label>
                      <Input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="w-full h-8"
                    onClick={handlePeriodSubmit}
                    disabled={!endDate}
                  >
                    Aktivera
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </>
        )}
      </div>
    </div>
  );
};

const WarehouseStaffActivationCard = () => {
  const {
    staffWithActivations,
    isLoading,
    activatePermanent,
    activateTemporary,
    deactivate,
  } = useWarehouseStaffActivations();

  const activeCount = staffWithActivations.filter(s => s.isCurrentlyActive).length;

  return (
    <div className="rounded-xl border border-border/50 bg-card shadow-sm">
      <div className="flex items-center justify-between p-4 pb-2">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm"
            style={{ background: 'linear-gradient(135deg, hsl(38 92% 55%) 0%, hsl(32 95% 40%) 100%)' }}
          >
            <Users className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Lagerpersonal</h3>
            <p className="text-xs text-muted-foreground">
              {activeCount} av {staffWithActivations.length} aktiva
            </p>
          </div>
        </div>
      </div>

      <div className="p-2 max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Laddar...</div>
        ) : staffWithActivations.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Ingen personal med taggen "Lager" hittades
          </div>
        ) : (
          staffWithActivations.map((staff) => (
            <StaffRow
              key={staff.id}
              staff={staff}
              onActivatePermanent={activatePermanent}
              onActivateTemporary={activateTemporary}
              onDeactivate={deactivate}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default WarehouseStaffActivationCard;
