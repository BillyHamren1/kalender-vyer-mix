
import React from 'react';
import { Paperclip, FileImage } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { BookingAttachment } from '@/types/booking';

interface AttachmentsListProps {
  attachments: BookingAttachment[];
}

export const AttachmentsList = ({ attachments }: AttachmentsListProps) => {
  if (!attachments || attachments.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Paperclip className="h-5 w-5" />
          <span>Attachments</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {attachments.map(attachment => (
            <li key={attachment.id} className="py-3">
              <a 
                href={attachment.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center text-blue-600 hover:underline"
              >
                <FileImage className="h-4 w-4 mr-2" />
                {attachment.fileName}
                <span className="text-xs text-gray-500 ml-2">
                  ({attachment.fileType})
                </span>
              </a>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};
