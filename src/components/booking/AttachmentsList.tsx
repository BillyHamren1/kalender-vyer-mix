
import React from 'react';
import { Paperclip, FileImage } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { BookingAttachment } from '@/types/booking';

interface AttachmentsListProps {
  attachments: BookingAttachment[];
}

export const AttachmentsList = ({ attachments }: AttachmentsListProps) => {
  return (
    <Card className="shadow-sm">
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <Paperclip className="h-4 w-4" />
          <span>Attachments</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-3">
        {attachments && attachments.length > 0 ? (
          <ul className="divide-y divide-gray-100">
            {attachments.map(attachment => (
              <li key={attachment.id} className="py-2">
                <a 
                  href={attachment.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center text-blue-600 hover:underline text-sm"
                >
                  <FileImage className="h-3.5 w-3.5 mr-1.5" />
                  {attachment.fileName}
                  <span className="text-xs text-gray-500 ml-1.5">
                    ({attachment.fileType})
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-gray-400 italic py-2">
            No attachments available
          </div>
        )}
      </CardContent>
    </Card>
  );
};
