
import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { StaffMember, syncStaffMember } from '@/services/staffService';
import { toast } from 'sonner';

const staffSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
});

type StaffFormData = z.infer<typeof staffSchema>;

interface EditStaffDialogProps {
  staff: StaffMember;
  isOpen: boolean;
  onClose: () => void;
  onStaffUpdated: () => void;
}

const EditStaffDialog: React.FC<EditStaffDialogProps> = ({ 
  staff, 
  isOpen, 
  onClose, 
  onStaffUpdated 
}) => {
  const form = useForm<StaffFormData>({
    resolver: zodResolver(staffSchema),
    defaultValues: {
      name: staff.name,
      email: staff.email || '',
      phone: staff.phone || '',
    },
  });

  useEffect(() => {
    if (staff) {
      form.reset({
        name: staff.name,
        email: staff.email || '',
        phone: staff.phone || '',
      });
    }
  }, [staff, form]);

  const onSubmit = async (data: StaffFormData) => {
    try {
      await syncStaffMember({
        id: staff.id,
        name: data.name,
        email: data.email || undefined,
        phone: data.phone || undefined,
      });
      
      onStaffUpdated();
      toast.success('Staff member updated successfully');
    } catch (error) {
      console.error('Error updating staff member:', error);
      toast.error('Failed to update staff member');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Staff Member</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter full name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input 
                      type="email" 
                      placeholder="Enter email address" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input 
                      type="tel" 
                      placeholder="Enter phone number" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex justify-end space-x-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="bg-[#82b6c6] hover:bg-[#6a9fb0] text-white"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? 'Updating...' : 'Update Staff Member'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default EditStaffDialog;
