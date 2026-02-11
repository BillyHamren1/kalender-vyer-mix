
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
          <span>Kund: {client}</span>
        </CardTitle>
      </CardHeader>
    </Card>
  );
};
