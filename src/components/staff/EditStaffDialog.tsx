import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StaffMember, syncStaffMember } from '@/services/staffService';
import { toast } from 'sonner';
import ColorPicker from './ColorPicker';

const staffSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postal_code: z.string().optional(),
  role: z.string().optional(),
  department: z.string().optional(),
  hire_date: z.string().optional(),
  hourly_rate: z.string().optional(),
  overtime_rate: z.string().optional(),
  salary: z.string().optional(),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  notes: z.string().optional(),
});

type StaffFormData = z.infer<typeof staffSchema>;

interface EditStaffDialogProps {
  staff: StaffMember;
  isOpen: boolean;
  onClose: () => void;
  onStaffUpdated: () => void;
  onColorUpdate?: (staffId: string, color: string) => Promise<void>;
}

const EditStaffDialog: React.FC<EditStaffDialogProps> = ({ 
  staff, 
  isOpen, 
  onClose, 
  onStaffUpdated,
  onColorUpdate 
}) => {
  const [selectedColor, setSelectedColor] = useState(staff.color || '#E3F2FD');

  const form = useForm<StaffFormData>({
    resolver: zodResolver(staffSchema),
    defaultValues: {
      name: staff.name || '',
      email: staff.email || '',
      phone: staff.phone || '',
      address: staff.address || '',
      city: staff.city || '',
      postal_code: staff.postal_code || '',
      role: staff.role || '',
      department: staff.department || '',
      hire_date: staff.hire_date || '',
      hourly_rate: staff.hourly_rate?.toString() || '',
      overtime_rate: staff.overtime_rate?.toString() || '',
      salary: staff.salary?.toString() || '',
      emergency_contact_name: staff.emergency_contact_name || '',
      emergency_contact_phone: staff.emergency_contact_phone || '',
      notes: staff.notes || '',
    },
  });

  useEffect(() => {
    if (staff) {
      form.reset({
        name: staff.name || '',
        email: staff.email || '',
        phone: staff.phone || '',
        address: staff.address || '',
        city: staff.city || '',
        postal_code: staff.postal_code || '',
        role: staff.role || '',
        department: staff.department || '',
        hire_date: staff.hire_date || '',
        hourly_rate: staff.hourly_rate?.toString() || '',
        overtime_rate: staff.overtime_rate?.toString() || '',
        salary: staff.salary?.toString() || '',
        emergency_contact_name: staff.emergency_contact_name || '',
        emergency_contact_phone: staff.emergency_contact_phone || '',
        notes: staff.notes || '',
      });
      setSelectedColor(staff.color || '#E3F2FD');
    }
  }, [staff, form]);

  const onSubmit = async (data: StaffFormData) => {
    try {
      const updatedStaffData = {
        id: staff.id,
        name: data.name,
        email: data.email || undefined,
        phone: data.phone || undefined,
        address: data.address || undefined,
        city: data.city || undefined,
        postal_code: data.postal_code || undefined,
        role: data.role || undefined,
        department: data.department || undefined,
        hire_date: data.hire_date || undefined,
        hourly_rate: data.hourly_rate ? parseFloat(data.hourly_rate) : undefined,
        overtime_rate: data.overtime_rate ? parseFloat(data.overtime_rate) : undefined,
        salary: data.salary ? parseFloat(data.salary) : undefined,
        emergency_contact_name: data.emergency_contact_name || undefined,
        emergency_contact_phone: data.emergency_contact_phone || undefined,
        notes: data.notes || undefined,
      };

      await syncStaffMember(updatedStaffData);

      // Save color if changed
      if (onColorUpdate && selectedColor !== staff.color) {
        await onColorUpdate(staff.id, selectedColor);
      }
      
      onStaffUpdated();
    } catch (error) {
      console.error('Error updating staff member:', error);
      toast.error('Kunde inte uppdatera personal');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[75vw] max-h-[85vh] overflow-y-auto bg-card">
        <DialogHeader>
          <DialogTitle>Redigera personal</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <Tabs defaultValue="personal" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="personal">Personligt</TabsTrigger>
                <TabsTrigger value="employment">Anställning</TabsTrigger>
                <TabsTrigger value="financial">Ekonomi</TabsTrigger>
                <TabsTrigger value="emergency">Kontaktperson</TabsTrigger>
                <TabsTrigger value="color">Färg</TabsTrigger>
              </TabsList>

              <TabsContent value="personal" className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Namn *</FormLabel>
                      <FormControl>
                        <Input placeholder="Ange namn" {...field} />
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
                      <FormLabel>E-post</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="Ange e-postadress" {...field} />
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
                      <FormLabel>Telefon</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="Ange telefonnummer" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Adress</FormLabel>
                      <FormControl>
                        <Input placeholder="Ange adress" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Stad</FormLabel>
                        <FormControl>
                          <Input placeholder="Ange stad" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="postal_code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Postnummer</FormLabel>
                        <FormControl>
                          <Input placeholder="Ange postnummer" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              <TabsContent value="employment" className="space-y-4">
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Roll</FormLabel>
                      <FormControl>
                        <Input placeholder="Ange roll" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Avdelning</FormLabel>
                      <FormControl>
                        <Input placeholder="Ange avdelning" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="hire_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Anställningsdatum</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Anteckningar</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Ytterligare anteckningar" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value="financial" className="space-y-4">
                <FormField
                  control={form.control}
                  name="hourly_rate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Timlön (SEK)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="Ange timlön" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="overtime_rate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Övertidsersättning (SEK)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="Ange övertidsersättning" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="salary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Månadslön (SEK)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="Ange månadslön" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value="emergency" className="space-y-4">
                <FormField
                  control={form.control}
                  name="emergency_contact_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kontaktpersonens namn</FormLabel>
                      <FormControl>
                        <Input placeholder="Ange namn" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="emergency_contact_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kontaktpersonens telefon</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="Ange telefonnummer" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value="color" className="space-y-4">
                <ColorPicker
                  selectedColor={selectedColor}
                  onColorChange={setSelectedColor}
                  staffName={staff.name}
                />
              </TabsContent>
            </Tabs>
            
            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Avbryt
              </Button>
              <Button 
                type="submit" 
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? 'Sparar...' : 'Spara'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default EditStaffDialog;
