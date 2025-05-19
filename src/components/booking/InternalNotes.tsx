
import React from 'react';
import { FileText } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';

interface InternalNotesProps {
  notes: string;
}

export const InternalNotes = ({ notes }: InternalNotesProps) => {
  if (!notes) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          <span>Internal Notes</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-gray-700 whitespace-pre-wrap">{notes}</p>
      </CardContent>
    </Card>
  );
};
