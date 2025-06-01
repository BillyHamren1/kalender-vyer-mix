
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Palette, Save } from 'lucide-react';
import { toast } from 'sonner';
import ColorPicker from './ColorPicker';

interface StaffMember {
  id: string;
  name: string;
  color?: string;
}

interface StaffColorSettingsProps {
  staff: StaffMember;
  onColorUpdate: (staffId: string, color: string) => Promise<void>;
}

const StaffColorSettings: React.FC<StaffColorSettingsProps> = ({ 
  staff, 
  onColorUpdate 
}) => {
  const [selectedColor, setSelectedColor] = useState(staff.color || '#E3F2FD');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await onColorUpdate(staff.id, selectedColor);
      toast.success('Färg sparad!');
    } catch (error) {
      console.error('Error updating staff color:', error);
      toast.error('Kunde inte spara färg');
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = selectedColor !== staff.color;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Palette className="h-5 w-5 text-blue-600" />
          Färginställningar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ColorPicker
          selectedColor={selectedColor}
          onColorChange={setSelectedColor}
          staffName={staff.name}
        />
        
        {hasChanges && (
          <div className="flex justify-end pt-4 border-t">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {isSaving ? 'Sparar...' : 'Spara färg'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default StaffColorSettings;
