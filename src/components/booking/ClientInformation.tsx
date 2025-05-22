
import React from 'react';
import { User } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Booking } from '@/types/booking';

interface ClientInformationProps {
  client: string;
}

export const ClientInformation = ({ client }: ClientInformationProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          <span>Client Information</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div>
          <p className="font-medium">Client:</p>
          <p className="text-lg">{client}</p>
        </div>
      </CardContent>
    </Card>
  );
};
