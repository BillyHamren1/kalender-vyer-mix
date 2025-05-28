
import React, { useState } from 'react';
import { StaffMember } from '@/services/staffService';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, Mail, Phone, Edit, Trash2 } from 'lucide-react';
import EditStaffDialog from './EditStaffDialog';
import DeleteStaffDialog from './DeleteStaffDialog';

interface StaffListProps {
  staffMembers: StaffMember[];
  isLoading: boolean;
  onRefresh: () => void;
}

const StaffList: React.FC<StaffListProps> = ({ staffMembers, isLoading, onRefresh }) => {
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [deletingStaff, setDeletingStaff] = useState<StaffMember | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                </div>
                <div className="flex space-x-2">
                  <div className="h-8 w-16 bg-gray-200 rounded"></div>
                  <div className="h-8 w-16 bg-gray-200 rounded"></div>
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
        <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500 text-lg mb-2">No staff members found</p>
        <p className="text-gray-400 text-sm">Add your first staff member to get started</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {staffMembers.map((staff) => (
          <Card key={staff.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4 flex-1">
                  <div className="w-10 h-10 bg-[#82b6c6] rounded-full flex items-center justify-center">
                    <User className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{staff.name}</h3>
                    <div className="flex flex-wrap items-center gap-4 mt-1">
                      {staff.email && (
                        <div className="flex items-center text-sm text-gray-600">
                          <Mail className="h-3 w-3 mr-1" />
                          {staff.email}
                        </div>
                      )}
                      {staff.phone && (
                        <div className="flex items-center text-sm text-gray-600">
                          <Phone className="h-3 w-3 mr-1" />
                          {staff.phone}
                        </div>
                      )}
                      {staff.assignedTeam && (
                        <Badge variant="secondary" className="text-xs">
                          Team: {staff.assignedTeam}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingStaff(staff)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeletingStaff(staff)}
                    className="text-red-600 hover:text-red-700 hover:border-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Dialog */}
      {editingStaff && (
        <EditStaffDialog
          staff={editingStaff}
          isOpen={!!editingStaff}
          onClose={() => setEditingStaff(null)}
          onStaffUpdated={() => {
            setEditingStaff(null);
            onRefresh();
          }}
        />
      )}

      {/* Delete Dialog */}
      {deletingStaff && (
        <DeleteStaffDialog
          staff={deletingStaff}
          isOpen={!!deletingStaff}
          onClose={() => setDeletingStaff(null)}
          onStaffDeleted={() => {
            setDeletingStaff(null);
            onRefresh();
          }}
        />
      )}
    </>
  );
};

export default StaffList;
