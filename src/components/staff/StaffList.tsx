
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { User, Mail, Phone, Edit2, Palette, MapPin, Building, Calendar, DollarSign, AlertTriangle, FileText } from 'lucide-react';
import { getContrastTextColor } from '@/utils/staffColors';

interface StaffMember {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  color?: string;
  hourly_rate?: number;
  role?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  department?: string;
  salary?: number;
  hire_date?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  overtime_rate?: number;
  notes?: string;
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

  const handleStaffClick = (staffId: string) => {
    console.log('Staff clicked:', staffId);
    console.log('Navigating to:', `/staff/${staffId}`);
    navigate(`/staff/${staffId}`);
  };

  const handleColorEditClick = (e: React.MouseEvent, staff: StaffMember) => {
    e.stopPropagation(); // Prevent card click navigation
    console.log('Color edit clicked for staff:', staff.id);
    if (onColorEdit) {
      onColorEdit(staff);
    }
  };

  const handleEditClick = (e: React.MouseEvent, staff: StaffMember) => {
    e.stopPropagation(); // Prevent card click navigation
    console.log('Edit clicked for staff:', staff.id);
    if (onEdit) {
      onEdit(staff);
    }
  };

  const formatCurrency = (amount?: number) => {
    if (amount === undefined || amount === null) return 'Not set';
    return `${amount} SEK`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString();
  };

  const displayValue = (value?: string | number) => {
    if (value === undefined || value === null || value === '') return 'Not set';
    return value;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, index) => (
          <Card key={index}>
            <CardContent className="p-6">
              <div className="flex items-start space-x-4">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex-1 space-y-3">
                  <Skeleton className="h-4 w-32" />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-32" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-36" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
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
    <div className="space-y-4">
      {staffMembers.map((staff) => {
        const staffColor = staff.color || '#E3F2FD';
        const textColor = getContrastTextColor(staffColor);
        
        return (
          <Card 
            key={staff.id} 
            className="transition-shadow hover:shadow-md cursor-pointer"
            onClick={() => {
              console.log('Card clicked for staff:', staff.id, staff.name);
              handleStaffClick(staff.id);
            }}
          >
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-4">
                  {/* Color indicator with initials */}
                  <div 
                    className="h-12 w-12 rounded-full flex items-center justify-center text-sm font-semibold border-2"
                    style={{ 
                      backgroundColor: staffColor,
                      color: textColor,
                      borderColor: '#e5e7eb'
                    }}
                  >
                    {staff.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {staff.name}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {displayValue(staff.role)}
                    </p>
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
                    onClick={(e) => handleEditClick(e, staff)}
                    className="text-xs"
                  >
                    <Edit2 className="h-3 w-3 mr-1" />
                    Redigera
                  </Button>
                </div>
              </div>

              {/* Comprehensive Information Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                
                {/* Contact Information */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-900 flex items-center">
                    <Mail className="h-4 w-4 mr-2" />
                    Contact Information
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-gray-500">Email:</span>
                      <p className="text-gray-900">{displayValue(staff.email)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Phone:</span>
                      <p className="text-gray-900">{displayValue(staff.phone)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Address:</span>
                      <p className="text-gray-900">{displayValue(staff.address)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">City:</span>
                      <p className="text-gray-900">{displayValue(staff.city)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Postal Code:</span>
                      <p className="text-gray-900">{displayValue(staff.postal_code)}</p>
                    </div>
                  </div>
                </div>

                {/* Employment Information */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-900 flex items-center">
                    <Building className="h-4 w-4 mr-2" />
                    Employment Information
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-gray-500">Role:</span>
                      <p className="text-gray-900">{displayValue(staff.role)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Department:</span>
                      <p className="text-gray-900">{displayValue(staff.department)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Hire Date:</span>
                      <p className="text-gray-900">{formatDate(staff.hire_date)}</p>
                    </div>
                  </div>
                </div>

                {/* Financial Information */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-900 flex items-center">
                    <DollarSign className="h-4 w-4 mr-2" />
                    Financial Information
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-gray-500">Hourly Rate:</span>
                      <p className="text-gray-900 font-medium">{formatCurrency(staff.hourly_rate)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Overtime Rate:</span>
                      <p className="text-gray-900">{formatCurrency(staff.overtime_rate)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Monthly Salary:</span>
                      <p className="text-gray-900">{formatCurrency(staff.salary)}</p>
                    </div>
                  </div>
                </div>

                {/* Emergency Contact */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-900 flex items-center">
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Emergency Contact
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-gray-500">Name:</span>
                      <p className="text-gray-900">{displayValue(staff.emergency_contact_name)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Phone:</span>
                      <p className="text-gray-900">{displayValue(staff.emergency_contact_phone)}</p>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-3 md:col-span-2">
                  <h4 className="text-sm font-medium text-gray-900 flex items-center">
                    <FileText className="h-4 w-4 mr-2" />
                    Notes
                  </h4>
                  <div className="text-sm">
                    <p className="text-gray-900 bg-gray-50 p-3 rounded-md min-h-[60px]">
                      {staff.notes || 'No notes added'}
                    </p>
                  </div>
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
