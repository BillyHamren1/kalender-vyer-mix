
import React from 'react';
import { Phone, Mail, User } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';

interface DeliveryContactCardProps {
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
}

export const DeliveryContactCard = ({ contactName, contactPhone, contactEmail }: DeliveryContactCardProps) => {
  // Only show the card if we have at least one contact field
  if (!contactName && !contactPhone && !contactEmail) {
    return (
      <Card className="shadow-sm">
        <CardHeader className="py-3 px-4">
          <CardTitle className="flex items-center gap-1.5 text-base">
            <User className="h-4 w-4" />
            <span>Delivery Contact</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 px-4 pb-3">
          <p className="text-xs text-gray-500">No delivery contact information available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <User className="h-4 w-4" />
          <span>Delivery Contact</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-3 space-y-2">
        {contactName && (
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-gray-500" />
            <div>
              <label className="text-xs text-gray-500">Contact Name</label>
              <p className="text-sm">{contactName}</p>
            </div>
          </div>
        )}
        
        {contactPhone && (
          <div className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-gray-500" />
            <div>
              <label className="text-xs text-gray-500">Phone</label>
              <p className="text-sm">{contactPhone}</p>
            </div>
          </div>
        )}
        
        {contactEmail && (
          <div className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-gray-500" />
            <div>
              <label className="text-xs text-gray-500">Email</label>
              <p className="text-sm">{contactEmail}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
