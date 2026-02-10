
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
      <CardHeader className="py-2 px-3">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <User className="h-3.5 w-3.5" />
          <span>Kund: {client}</span>
        </CardTitle>
      </CardHeader>
    </Card>
  );
};
