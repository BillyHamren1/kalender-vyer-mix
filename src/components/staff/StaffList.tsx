
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { User, Mail, Phone, Edit2, Palette, Calendar, Key, KeyRound } from 'lucide-react';
import { getContrastTextColor } from '@/utils/staffColors';
import { updateStaffActiveStatus } from '@/services/staffAvailabilityService';
import { toast } from 'sonner';
import StaffAvailabilityDialog from './StaffAvailabilityDialog';
import { supabase } from '@/integrations/supabase/client';

interface StaffMember {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  color?: string;
  role?: string;
  is_active?: boolean;
}

interface StaffListProps {
  staffMembers: StaffMember[];
  isLoading: boolean;
  onRefresh: () => void;
  onColorEdit?: (staff: StaffMember) => void;
  onEdit?: (staff: StaffMember) => void;
}

const StaffList: React.FC<StaffListProps> = ({ 
  staffMembers, 
  isLoading,
  onRefresh,
  onColorEdit,
  onEdit 
}) => {
  const navigate = useNavigate();
  const [availabilityDialogOpen, setAvailabilityDialogOpen] = useState(false);
  const [selectedStaffForAvailability, setSelectedStaffForAvailability] = useState<StaffMember | null>(null);

  // Fetch staff accounts to show which staff have accounts
  const { data: staffAccounts = [] } = useQuery({
    queryKey: ['staffAccountsList'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_accounts')
        .select('staff_id');
      if (error) throw error;
      return data.map(a => a.staff_id);
    },
  });

  const hasAccount = (staffId: string) => staffAccounts.includes(staffId);

  const handleStaffClick = (staffId: string) => {
    console.log('Staff clicked:', staffId);
    console.log('Navigating to:', `/staff/${staffId}`);
    navigate(`/staff/${staffId}`);
  };

  const handleColorEditClick = (e: React.MouseEvent, staff: StaffMember) => {
    e.stopPropagation();
    console.log('Color edit clicked for staff:', staff.id);
    if (onColorEdit) {
      onColorEdit(staff);
    }
  };

  const handleEditClick = (e: React.MouseEvent, staff: StaffMember) => {
    e.stopPropagation();
    console.log('Edit clicked for staff:', staff.id);
    if (onEdit) {
      onEdit(staff);
    }
  };

  const handleAvailabilityClick = (e: React.MouseEvent, staff: StaffMember) => {
    e.stopPropagation();
    setSelectedStaffForAvailability(staff);
    setAvailabilityDialogOpen(true);
  };

  const handleActiveToggle = async (e: React.ChangeEvent<HTMLButtonElement>, staff: StaffMember) => {
    e.stopPropagation();
    const newActiveStatus = !staff.is_active;
    
    try {
      await updateStaffActiveStatus(staff.id, newActiveStatus);
      toast.success(`${staff.name} är nu ${newActiveStatus ? 'aktiv' : 'inaktiv'}`);
      onRefresh();
    } catch (error) {
      toast.error('Kunde inte uppdatera status');
      console.error(error);
    }
  };

  const displayValue = (value?: string) => {
    if (value === undefined || value === null || value === '') return 'Not set';
    return value;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <div className="flex items-center space-x-4">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-8 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (staffMembers.length === 0) {
    return (
      <div className="text-center py-8">
        <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 mb-4">No staff members found</p>
        <Button onClick={onRefresh} variant="outline">
          Refresh List
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {staffMembers.map((staff) => {
          const staffColor = staff.color || '#E3F2FD';
          const textColor = getContrastTextColor(staffColor);
          const isActive = staff.is_active ?? true;
          
          return (
            <Card 
              key={staff.id} 
              className={`transition-shadow hover:shadow-md cursor-pointer ${!isActive ? 'opacity-60' : ''}`}
              onClick={() => {
                console.log('Card clicked for staff:', staff.id, staff.name);
                handleStaffClick(staff.id);
              }}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start space-x-3 flex-1">
                    {/* Color indicator with initials */}
                    <div className="relative">
                      <div 
                        className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold border-2 flex-shrink-0"
                        style={{ 
                          backgroundColor: staffColor,
                          color: textColor,
                          borderColor: 'hsl(var(--border))'
                        }}
                      >
                        {staff.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      {/* Account status indicator */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div 
                              className={`absolute -bottom-1 -right-1 h-5 w-5 rounded-full flex items-center justify-center border-2 border-background ${
                                hasAccount(staff.id) 
                                  ? 'bg-primary text-primary-foreground' 
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {hasAccount(staff.id) 
                                ? <Key className="h-3 w-3" /> 
                                : <KeyRound className="h-3 w-3" />
                              }
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            {hasAccount(staff.id) ? 'Har inloggningskonto' : 'Saknar inloggningskonto'}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-foreground">
                          {staff.name}
                        </h3>
                        {!isActive && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            Inaktiv
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {displayValue(staff.role)}
                      </p>
                      
                      {/* Basic contact info */}
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        {staff.email && (
                          <div className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            <span className="truncate">{staff.email}</span>
                          </div>
                        )}
                        {staff.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            <span>{staff.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {/* Active/Inactive toggle */}
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <span className="text-xs text-gray-600">
                        {isActive ? 'Aktiv' : 'Inaktiv'}
                      </span>
                      <Switch
                        checked={isActive}
                        onCheckedChange={(checked) => {
                          const fakeEvent = { stopPropagation: () => {} } as any;
                          handleActiveToggle(fakeEvent, staff);
                        }}
                      />
                    </div>
                    
                    {/* Action buttons */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => handleAvailabilityClick(e, staff)}
                        className="text-xs"
                        title="Hantera tillgänglighet"
                      >
                        <Calendar className="h-3 w-3" />
                      </Button>
                      {onColorEdit && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => handleColorEditClick(e, staff)}
                          className="text-xs"
                          title="Ändra färg"
                        >
                          <Palette className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => handleEditClick(e, staff)}
                        className="text-xs"
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Availability Dialog */}
      {selectedStaffForAvailability && (
        <StaffAvailabilityDialog
          isOpen={availabilityDialogOpen}
          onClose={() => {
            setAvailabilityDialogOpen(false);
            setSelectedStaffForAvailability(null);
          }}
          staffId={selectedStaffForAvailability.id}
          staffName={selectedStaffForAvailability.name}
        />
      )}
    </>
  );
};

export default StaffList;
