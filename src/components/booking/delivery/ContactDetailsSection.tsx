
import React from 'react';
import { User } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface ContactDetailsSectionProps {
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  onContactNameChange: (value: string) => void;
  onContactPhoneChange: (value: string) => void;
  onContactEmailChange: (value: string) => void;
}

export const ContactDetailsSection: React.FC<ContactDetailsSectionProps> = ({
  contactName,
  contactPhone,
  contactEmail,
  onContactNameChange,
  onContactPhoneChange,
  onContactEmailChange
}) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 mb-2">
        <User className="h-3.5 w-3.5 text-gray-500" />
        <span className="text-sm font-medium text-gray-700">Kontaktuppgifter</span>
      </div>
      
      <div className="space-y-2">
        <div>
          <Label htmlFor="contact-name" className="text-xs">Kontaktnamn</Label>
          <Input 
            id="contact-name"
            value={contactName}
            onChange={(e) => onContactNameChange(e.target.value)}
            placeholder="Kontaktpersonens namn"
            className="mt-1 h-8 text-sm"
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div>
            <Label htmlFor="contact-phone" className="text-xs">Telefon</Label>
            <Input 
              id="contact-phone"
              value={contactPhone}
              onChange={(e) => onContactPhoneChange(e.target.value)}
              placeholder="Telefonnummer"
              className="mt-1 h-8 text-sm"
            />
          </div>
          
          <div>
            <Label htmlFor="contact-email" className="text-xs">E-post</Label>
            <Input 
              id="contact-email"
              type="email"
              value={contactEmail}
              onChange={(e) => onContactEmailChange(e.target.value)}
              placeholder="E-postadress"
              className="mt-1 h-8 text-sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
