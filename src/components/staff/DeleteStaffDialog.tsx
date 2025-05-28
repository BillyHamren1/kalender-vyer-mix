
import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { StaffMember } from '@/services/staffService';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DeleteStaffDialogProps {
  staff: StaffMember;
  isOpen: boolean;
  onClose: () => void;
  onStaffDeleted: () => void;
}

const DeleteStaffDialog: React.FC<DeleteStaffDialogProps> = ({ 
  staff, 
  isOpen, 
  onClose, 
  onStaffDeleted 
}) => {
  const [isDeleting, setIsDeleting] = React.useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    
    try {
      const { error } = await supabase
        .from('staff_members')
        .delete()
        .eq('id', staff.id);

      if (error) throw error;
      
      onStaffDeleted();
      toast.success('Staff member deleted successfully');
    } catch (error) {
      console.error('Error deleting staff member:', error);
      toast.error('Failed to delete staff member');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Delete Staff Member</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete {staff.name}? This action cannot be undone.
            All assignments and related data for this staff member will also be removed.
          </DialogDescription>
        </DialogHeader>
        
        <DialogFooter>
          <Button 
            type="button" 
            variant="outline" 
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button 
            type="button" 
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete Staff Member'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteStaffDialog;
