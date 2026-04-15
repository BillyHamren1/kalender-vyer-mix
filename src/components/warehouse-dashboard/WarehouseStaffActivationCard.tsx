import { useState } from 'react';
import { Users, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useWarehouseStaffActivations, WarehouseStaffMember } from '@/hooks/useWarehouseStaffActivations';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';

const StaffDetailDialog = ({
  staff,
  open,
  onOpenChange,
  onActivatePermanent,
  onActivateTemporary,
  onDeactivate,
}: {
  staff: WarehouseStaffMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActivatePermanent: (id: string) => void;
  onActivateTemporary: (params: { staffId: string; startDate: string; endDate: string }) => void;
  onDeactivate: (id: string) => void;
}) => {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState('');

  if (!staff) return null;

  const handleActivatePermanent = () => {
    onActivatePermanent(staff.id);
    onOpenChange(false);
  };

  const handleActivateTemporary = () => {
    if (!endDate) return;
    onActivateTemporary({ staffId: staff.id, startDate, endDate });
    onOpenChange(false);
    setEndDate('');
  };

  const handleDeactivate = () => {
    onDeactivate(staff.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{staff.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {staff.isCurrentlyActive ? (
            <>
              <div className="text-sm text-muted-foreground">
                {staff.activation?.activation_type === 'permanent'
                  ? 'Aktiverad tillsvidare'
                  : `Aktiverad t.o.m. ${staff.activation?.end_date}`}
              </div>
              <Button
                variant="destructive"
                className="w-full"
                onClick={handleDeactivate}
              >
                Avaktivera
              </Button>
            </>
          ) : (
            <>
              <Button className="w-full" onClick={handleActivatePermanent}>
                Aktivera tillsvidare
              </Button>

              <div className="border-t pt-3 space-y-3">
                <p className="text-sm font-medium">Aktivera för period</p>
                <div className="grid grid-cols-2 gap-2">
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
                  variant="outline"
                  className="w-full"
                  onClick={handleActivateTemporary}
                  disabled={!endDate}
                >
                  Aktivera för period
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
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

  const [selectedStaff, setSelectedStaff] = useState<WarehouseStaffMember | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const active = staffWithActivations.filter(s => s.isCurrentlyActive);
  const inactive = staffWithActivations.filter(s => !s.isCurrentlyActive);

  const handleClick = (staff: WarehouseStaffMember) => {
    setSelectedStaff(staff);
    setDialogOpen(true);
  };

  const NameRow = ({ staff }: { staff: WarehouseStaffMember }) => (
    <div
      onClick={() => handleClick(staff)}
      className="flex items-center justify-between py-1.5 px-1 cursor-pointer hover:bg-muted/40 rounded-md transition-colors group"
    >
      <span className="text-sm truncate">{staff.name}</span>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
    </div>
  );

  return (
    <div className="rounded-xl border border-border/50 bg-card shadow-sm">
      <div className="flex items-center gap-2 p-4 pb-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm"
          style={{ background: 'linear-gradient(135deg, hsl(38 92% 55%) 0%, hsl(32 95% 40%) 100%)' }}
        >
          <Users className="h-4 w-4 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Lagerpersonal</h3>
          <p className="text-xs text-muted-foreground">
            {active.length} av {staffWithActivations.length} aktiva
          </p>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-3 max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Laddar...</p>
        ) : staffWithActivations.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Ingen personal med taggen "Lager" hittades
          </p>
        ) : (
          <>
            {active.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Aktiva</p>
                <div className="divide-y divide-border/30">
                  {active.map(s => <NameRow key={s.id} staff={s} />)}
                </div>
              </div>
            )}
            {inactive.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Inaktiva</p>
                <div className="divide-y divide-border/30">
                  {inactive.map(s => <NameRow key={s.id} staff={s} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <StaffDetailDialog
        staff={selectedStaff}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onActivatePermanent={activatePermanent}
        onActivateTemporary={activateTemporary}
        onDeactivate={deactivate}
      />
    </div>
  );
};

export default WarehouseStaffActivationCard;
