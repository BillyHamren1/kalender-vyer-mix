
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { User, Mail, Phone, Edit2, Palette } from 'lucide-react';
import { getContrastTextColor } from '@/utils/staffColors';

interface StaffMember {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  color?: string;
}

interface StaffListProps {
  staffMembers: StaffMember[];
  isLoading: boolean;
  onRefresh: () => void;
  onColorEdit?: (staff: StaffMember) => void;
}

const StaffList: React.FC<StaffListProps> = ({ 
  staffMembers, 
  isLoading,
  onRefresh,
  onColorEdit 
}) => {
  const navigate = useNavigate();

  const handleStaffClick = (staffId: string) => {
    navigate(`/staff/${staffId}`);
  };

  const handleColorEditClick = (e: React.MouseEvent, staff: StaffMember) => {
    e.stopPropagation(); // Prevent card click navigation
    if (onColorEdit) {
      onColorEdit(staff);
    }
  };

  const handleEditClick = (e: React.MouseEvent, staffId: string) => {
    e.stopPropagation(); // Prevent card click navigation
    // TODO: Implement edit functionality
    console.log('Edit staff:', staffId);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <div className="flex items-center space-x-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-8 w-16" />
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
    <div className="space-y-3">
      {staffMembers.map((staff) => {
        const staffColor = staff.color || '#E3F2FD';
        const textColor = getContrastTextColor(staffColor);
        
        return (
          <Card 
            key={staff.id} 
            className="transition-shadow hover:shadow-md cursor-pointer"
            onClick={() => handleStaffClick(staff.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4 flex-1">
                  {/* Color indicator with name */}
                  <div 
                    className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold border"
                    style={{ 
                      backgroundColor: staffColor,
                      color: textColor,
                      borderColor: '#e5e7eb'
                    }}
                  >
                    {staff.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="mb-1">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">
                        {staff.name}
                      </h3>
                    </div>
                    
                    <div className="space-y-1">
                      {staff.email && (
                        <div className="flex items-center text-xs text-gray-600">
                          <Mail className="h-3 w-3 mr-2" />
                          <span className="truncate">{staff.email}</span>
                        </div>
                      )}
                      {staff.phone && (
                        <div className="flex items-center text-xs text-gray-600">
                          <Phone className="h-3 w-3 mr-2" />
                          <span>{staff.phone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  {onColorEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => handleColorEditClick(e, staff)}
                      className="text-xs"
                    >
                      <Palette className="h-3 w-3 mr-1" />
                      Färg
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => handleEditClick(e, staff.id)}
                    className="text-xs"
                  >
                    <Edit2 className="h-3 w-3 mr-1" />
                    Redigera
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
