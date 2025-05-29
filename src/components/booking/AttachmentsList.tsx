
import React, { useState } from 'react';
import { Paperclip, FileImage, Trash2 } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookingAttachment } from '@/types/booking';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ConfirmationDialog from '@/components/ConfirmationDialog';

interface AttachmentsListProps {
  attachments: BookingAttachment[];
  onAttachmentDeleted?: (attachmentId: string) => void;
}

export const AttachmentsList = ({ attachments, onAttachmentDeleted }: AttachmentsListProps) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDeleteAttachment = async (attachmentId: string) => {
    setDeletingId(attachmentId);
    setConfirmDeleteId(null);

    try {
      console.log('🗑️ Deleting attachment:', attachmentId);

      const { data, error } = await supabase.functions.invoke('delete-attachment', {
        body: { attachmentId }
      });

      if (error) {
        console.error('❌ Error deleting attachment:', error);
        toast.error('Misslyckades att ta bort bilaga');
        return;
      }

      console.log('✅ Attachment deleted successfully:', data);
      toast.success('Bilaga borttagen');
      
      // Notify parent component to update the list
      if (onAttachmentDeleted) {
        onAttachmentDeleted(attachmentId);
      }

    } catch (error) {
      console.error('❌ Unexpected error deleting attachment:', error);
      toast.error('Ett oväntat fel uppstod');
    } finally {
      setDeletingId(null);
    }
  };

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
              <li key={attachment.id} className="py-2 flex items-center justify-between">
                <a 
                  href={attachment.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center text-blue-600 hover:underline text-sm flex-1"
                >
                  <FileImage className="h-3.5 w-3.5 mr-1.5" />
                  {attachment.fileName}
                  <span className="text-xs text-gray-500 ml-1.5">
                    ({attachment.fileType})
                  </span>
                </a>
                
                <ConfirmationDialog
                  title="Ta bort bilaga"
                  description={`Är du säker på att du vill ta bort "${attachment.fileName}"? Denna åtgärd kan inte ångras.`}
                  confirmLabel="Ta bort"
                  cancelLabel="Avbryt"
                  onConfirm={() => handleDeleteAttachment(attachment.id)}
                  open={confirmDeleteId === attachment.id}
                  onOpenChange={(open) => setConfirmDeleteId(open ? attachment.id : null)}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDeleteId(attachment.id)}
                    disabled={deletingId === attachment.id}
                    className="ml-2 text-red-600 hover:text-red-800 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </ConfirmationDialog>
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
