
import React from 'react';
import { User } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Booking } from '@/types/booking';

interface ClientInformationProps {
  client: string;
}

export const ClientInformation = ({ client }: ClientInformationProps) => {
  return (
    <Card className="shadow-sm">
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <User className="h-4 w-4" />
          <span>Client Information</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-3">
        <div>
          <p className="text-xs font-medium text-gray-500">Client Name:</p>
          <p className="text-sm font-medium">{client}</p>
        </div>
      </CardContent>
    </Card>
  );
};
