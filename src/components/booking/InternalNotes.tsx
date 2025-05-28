
import React from 'react';
import { FileText } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';

interface InternalNotesProps {
  notes: string;
}

export const InternalNotes = ({ notes }: InternalNotesProps) => {
  if (!notes) return null;

  return (
    <Card className="shadow-sm">
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <FileText className="h-4 w-4" />
          <span>Internal Notes</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-3">
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{notes}</p>
      </CardContent>
    </Card>
  );
};
