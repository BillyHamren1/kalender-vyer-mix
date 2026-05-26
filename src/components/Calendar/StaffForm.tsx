
import React, { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface StaffFormProps {
  onSave: (name: string, email: string, phone: string) => void;
  onCancel: () => void;
}

const StaffForm: React.FC<StaffFormProps> = ({ onSave, onCancel }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Namn krävs');
      return;
    }
    onSave(name, email, phone);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Namn</Label>
        <Input 
          id="name" 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          placeholder="Fullständigt namn" 
          required 
        />
      </div>
      <div>
        <Label htmlFor="email">E-post</Label>
        <Input 
          id="email" 
          type="email" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} 
          placeholder="E-postadress" 
        />
      </div>
      <div>
        <Label htmlFor="phone">Telefon</Label>
        <Input 
          id="phone" 
          value={phone} 
          onChange={(e) => setPhone(e.target.value)} 
          placeholder="Telefonnummer" 
        />
      </div>
      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onCancel}>Avbryt</Button>
        <Button type="submit">Spara personal</Button>
      </div>
    </form>
  );
};

export default StaffForm;
