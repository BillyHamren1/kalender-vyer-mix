
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Plus, Search, RotateCcw, Download, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchStaffMembers, updateStaffColor } from '@/services/staffService';
import { importStaffData } from '@/services/staffImportService';
import { toast } from 'sonner';
import StaffList from '@/components/staff/StaffList';
import AddStaffDialog from '@/components/staff/AddStaffDialog';
import EditStaffDialog from '@/components/staff/EditStaffDialog';
import StaffColorSettings from '@/components/staff/StaffColorSettings';
import StaffAccountsPanel from '@/components/staff/StaffAccountsPanel';
import StaffExportDialog from '@/components/staff/StaffExportDialog';
import TimeReportApprovalPanel from '@/components/staff/TimeReportApprovalPanel';

const StaffManagement: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedStaffForColor, setSelectedStaffForColor] = useState<any>(null);
  const [selectedStaffForEdit, setSelectedStaffForEdit] = useState<any>(null);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isImportingStaff, setIsImportingStaff] = useState(false);

  // Fetch staff members
  const { 
    data: staffMembers = [], 
    isLoading, 
    error,
    refetch 
  } = useQuery({
    queryKey: ['staffMembers'],
    queryFn: fetchStaffMembers,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  const handleRefresh = () => {
    refetch();
    toast.success('Staff list refreshed');
  };

  const handleStaffImport = async () => {
    setIsImportingStaff(true);
    try {
      const result = await importStaffData();
      if (result.success) {
        refetch(); // Refresh the local staff list
      }
    } catch (error) {
      console.error('Staff import failed:', error);
    } finally {
      setIsImportingStaff(false);
    }
  };

  const handleStaffAdded = () => {
    setIsAddDialogOpen(false);
    refetch();
    toast.success('Staff member added successfully');
  };

  const handleStaffUpdated = () => {
    setSelectedStaffForEdit(null);
    refetch();
    toast.success('Staff member updated successfully');
  };

  const handleColorUpdate = async (staffId: string, color: string) => {
    await updateStaffColor(staffId, color);
    refetch(); // Refresh the list to show updated colors
  };

  // Filter staff based on search term
  const filteredStaff = staffMembers.filter(staff =>
    staff.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    staff.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    staff.phone?.includes(searchTerm) ||
    staff.role?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">Error loading staff: {error.message}</p>
          <Button onClick={handleRefresh}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Users className="h-8 w-8 text-[#82b6c6]" />
            <h1 className="text-3xl font-bold text-gray-900">Staff Management</h1>
          </div>
          <div className="flex items-center space-x-4">
            <Button 
              onClick={handleStaffImport}
              disabled={isImportingStaff}
              variant="outline"
              className="flex items-center gap-2"
            >
              <UserPlus className={`h-4 w-4 ${isImportingStaff ? 'animate-spin' : ''}`} />
              Import Staff
            </Button>
            <Button 
              onClick={() => setIsExportDialogOpen(true)}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Export Staff
            </Button>
            <Button 
              onClick={() => setIsAddDialogOpen(true)}
              className="bg-[#82b6c6] hover:bg-[#6a9fb0] text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Staff Member
            </Button>
            <Button 
              onClick={handleRefresh} 
              variant="outline" 
              size="sm"
              disabled={isLoading}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left side - Staff Directory */}
          <div className="lg:col-span-2 space-y-6">
            {/* Search and Filters */}
            <Card>
              <CardHeader className="py-4">
                <CardTitle className="text-lg">Staff Directory</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center space-x-4 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search by name, email, phone, or role..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                
                {/* Staff List */}
                <StaffList 
                  staffMembers={filteredStaff}
                  isLoading={isLoading}
                  onRefresh={refetch}
                  onColorEdit={setSelectedStaffForColor}
                  onEdit={setSelectedStaffForEdit}
                />
              </CardContent>
            </Card>
          </div>

          {/* Right side - Time Report Approvals, Staff Accounts and Color Settings */}
          <div className="space-y-6">
            {/* Time Report Approval Panel */}
            <TimeReportApprovalPanel />

            {/* Staff Accounts Panel */}
            <StaffAccountsPanel />

            {/* Color Settings */}
            {selectedStaffForColor ? (
              <StaffColorSettings
                staff={selectedStaffForColor}
                onColorUpdate={handleColorUpdate}
              />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Färginställningar</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">
                    Välj en personal från listan för att ändra deras färg.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Add Staff Dialog */}
      <AddStaffDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onStaffAdded={handleStaffAdded}
      />

      {/* Edit Staff Dialog */}
      {selectedStaffForEdit && (
        <EditStaffDialog
          staff={selectedStaffForEdit}
          isOpen={!!selectedStaffForEdit}
          onClose={() => setSelectedStaffForEdit(null)}
          onStaffUpdated={handleStaffUpdated}
        />
      )}

      {/* Export Staff Dialog */}
      <StaffExportDialog
        isOpen={isExportDialogOpen}
        onClose={() => setIsExportDialogOpen(false)}
        staffMembers={staffMembers}
      />
    </div>
  );
};

export default StaffManagement;
