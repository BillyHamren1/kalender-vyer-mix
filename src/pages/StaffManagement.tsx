import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Plus, Search, RotateCcw, Download, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { PremiumCard } from '@/components/ui/PremiumCard';
import { fetchStaffMembers, updateStaffColor } from '@/services/staffService';
import { importStaffData } from '@/services/staffImportService';
import { toast } from 'sonner';
import StaffList from '@/components/staff/StaffList';
import AddStaffDialog from '@/components/staff/AddStaffDialog';
import EditStaffDialog from '@/components/staff/EditStaffDialog';
import StaffColorSettings from '@/components/staff/StaffColorSettings';
import StaffAccountsPanel from '@/components/staff/StaffAccountsPanel';
import StaffExportDialog from '@/components/staff/StaffExportDialog';


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
    toast.success('Personallistan uppdaterad');
  };

  const handleStaffImport = async () => {
    setIsImportingStaff(true);
    try {
      const result = await importStaffData();
      if (result.success) {
        refetch();
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
    toast.success('Personal tillagd');
  };

  const handleStaffUpdated = () => {
    setSelectedStaffForEdit(null);
    refetch();
    toast.success('Personal uppdaterad');
  };

  const handleColorUpdate = async (staffId: string, color: string) => {
    await updateStaffColor(staffId, color);
    refetch();
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
      <PageContainer>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-destructive mb-4">Kunde inte ladda personal: {error.message}</p>
            <Button onClick={handleRefresh}>Försök igen</Button>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {/* Header */}
      <PageHeader
        icon={Users}
        title="Personaladministration"
        subtitle="Hantera personal, konton och inställningar"
        action={{
          label: "Lägg till personal",
          icon: Plus,
          onClick: () => setIsAddDialogOpen(true)
        }}
      >
        <Button 
          onClick={handleStaffImport}
          disabled={isImportingStaff}
          variant="outline"
          className="rounded-xl"
        >
          <UserPlus className={`h-4 w-4 mr-2 ${isImportingStaff ? 'animate-spin' : ''}`} />
          Importera
        </Button>
        <Button 
          onClick={() => setIsExportDialogOpen(true)}
          variant="outline"
          className="rounded-xl"
        >
          <Download className="h-4 w-4 mr-2" />
          Exportera
        </Button>
        <Button 
          onClick={handleRefresh} 
          variant="outline"
          disabled={isLoading}
          className="rounded-xl"
        >
          <RotateCcw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Uppdatera
        </Button>
      </PageHeader>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left side - Staff Directory */}
        <div className="lg:col-span-2">
          <PremiumCard
            icon={Users}
            title="Personalkatalog"
            subtitle={`${filteredStaff.length} personer`}
            count={filteredStaff.length}
          >
            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                <Input
                  placeholder="Sök namn, e-post, telefon eller roll..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-10 bg-muted/30 border-muted-foreground/10 rounded-xl"
                />
              </div>
              
              {/* Staff List */}
              <StaffList 
                staffMembers={filteredStaff}
                isLoading={isLoading}
                onRefresh={refetch}
                onColorEdit={setSelectedStaffForColor}
                onEdit={setSelectedStaffForEdit}
              />
            </div>
          </PremiumCard>
        </div>

        {/* Right side - Staff Accounts and Color Settings */}
        <div className="space-y-6">
          {/* Staff Accounts Panel */}
          <StaffAccountsPanel />

          {/* Color Settings */}
          {selectedStaffForColor ? (
            <StaffColorSettings
              staff={selectedStaffForColor}
              onColorUpdate={handleColorUpdate}
            />
          ) : (
            <PremiumCard
              title="Färginställningar"
              subtitle="Välj personal för att ändra"
            >
              <p className="text-sm text-muted-foreground">
                Välj en person från listan för att ändra deras kalenderfärg.
              </p>
            </PremiumCard>
          )}
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
    </PageContainer>
  );
};

export default StaffManagement;
