
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            <span>Delivery Contact</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">No delivery contact information available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          <span>Delivery Contact</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {contactName && (
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-gray-500" />
            <div>
              <label className="text-xs text-gray-500">Contact Name</label>
              <p className="text-sm font-medium">{contactName}</p>
            </div>
          </div>
        )}
        
        {contactPhone && (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-gray-500" />
            <div>
              <label className="text-xs text-gray-500">Phone</label>
              <p className="text-sm font-medium">{contactPhone}</p>
            </div>
          </div>
        )}
        
        {contactEmail && (
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-gray-500" />
            <div>
              <label className="text-xs text-gray-500">Email</label>
              <p className="text-sm font-medium">{contactEmail}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
