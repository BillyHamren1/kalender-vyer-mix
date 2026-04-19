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
import StaffScheduleView from './StaffScheduleView';

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
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-base">{staff.name}</DialogTitle>
            {staff.isCurrentlyActive ? (
              <Badge variant="outline" className="border-warehouse/40 text-warehouse">
                {staff.activation?.activation_type === 'permanent'
                  ? 'Aktiv – tillsvidare'
                  : `Aktiv t.o.m. ${staff.activation?.end_date}`}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">Inaktiv</Badge>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Activation controls */}
          {staff.isCurrentlyActive ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleDeactivate}
            >
              Avaktivera
            </Button>
          ) : (
            <div className="space-y-2">
              <Button size="sm" className="w-full bg-warehouse hover:bg-warehouse-hover text-white" onClick={handleActivatePermanent}>
                Aktivera tillsvidare
              </Button>
              <div className="border rounded-md p-2 space-y-2">
                <p className="text-xs font-medium">Aktivera för period</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Från</Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Till</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-7 text-xs"
                  onClick={handleActivateTemporary}
                  disabled={!endDate}
                >
                  Aktivera för period
                </Button>
              </div>
            </div>
          )}

          {/* Schedule */}
          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-foreground tracking-wide mb-2">Schema</p>
            <StaffScheduleView staffId={staff.id} staffName={staff.name} />
          </div>
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
      className="flex items-center justify-between py-0.5 px-1 cursor-pointer hover:bg-muted/40 rounded-md transition-colors group"
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
                <p className="text-xs font-semibold text-foreground tracking-wide mb-0.5">Aktiva</p>
                <div>
                  {active.map(s => <NameRow key={s.id} staff={s} />)}
                </div>
              </div>
            )}
            {inactive.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground tracking-wide mb-0.5">Inaktiva</p>
                <div>
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
