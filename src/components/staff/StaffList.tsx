import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { User, Mail, Phone, Edit2 } from 'lucide-react';
import { getContrastTextColor } from '@/utils/staffColors';
import { updateStaffActiveStatus } from '@/services/staffAvailabilityService';
import { toast } from 'sonner';

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
  onEdit?: (staff: StaffMember) => void;
}

const StaffList: React.FC<StaffListProps> = ({ 
  staffMembers, 
  isLoading,
  onRefresh,
  onEdit 
}) => {
  const navigate = useNavigate();

  const handleStaffClick = (staffId: string) => {
    navigate(`/staff/${staffId}`);
  };

  const handleEditClick = (e: React.MouseEvent, staff: StaffMember) => {
    e.stopPropagation();
    if (onEdit) {
      onEdit(staff);
    }
  };

  const handleActiveToggle = async (staff: StaffMember) => {
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

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
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
        <User className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
        <p className="text-muted-foreground mb-4">Inga personalmedlemmar hittades</p>
        <Button onClick={onRefresh} variant="outline">
          Uppdatera
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {staffMembers.map((staff) => {
        const staffColor = staff.color || '#E3F2FD';
        const textColor = getContrastTextColor(staffColor);
        const isActive = staff.is_active ?? true;
        
        return (
          <Card 
            key={staff.id} 
            className={`group transition-shadow hover:shadow-md cursor-pointer ${!isActive ? 'opacity-50' : ''}`}
            onClick={() => handleStaffClick(staff.id)}
          >
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div 
                  className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                  style={{ 
                    backgroundColor: staffColor,
                    color: textColor,
                  }}
                >
                  {staff.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-sm text-foreground truncate">
                      {staff.name}
                    </h3>
                    {!isActive && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                        Inaktiv
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {staff.role && <span>{staff.role}</span>}
                    {staff.email && (
                      <span className="hidden sm:flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        <span className="truncate">{staff.email}</span>
                      </span>
                    )}
                    {staff.phone && (
                      <span className="hidden md:flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {staff.phone}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={isActive}
                    onCheckedChange={() => handleActiveToggle(staff)}
                    className="scale-75"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => handleEditClick(e, staff)}
                    title="Redigera"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default StaffList;
