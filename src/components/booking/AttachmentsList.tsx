
import React, { useState } from 'react';
import { Paperclip, FileImage, Trash2, Edit3, Check, X } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { BookingAttachment } from '@/types/booking';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import { FileUpload } from './FileUpload';

interface AttachmentsListProps {
  bookingId: string;
  attachments: BookingAttachment[];
  onAttachmentDeleted?: (attachmentId: string) => void;
  onAttachmentRenamed?: (attachmentId: string, newName: string) => void;
  onAttachmentAdded?: (attachment: BookingAttachment) => void;
}

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];

const isImageFile = (fileName: string, fileType: string): boolean => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (IMAGE_EXTENSIONS.includes(ext)) return true;
  if (fileType.startsWith('image/')) return true;
  return false;
};

export const AttachmentsList = ({ bookingId, attachments, onAttachmentDeleted, onAttachmentRenamed, onAttachmentAdded }: AttachmentsListProps) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteMultiple, setConfirmDeleteMultiple] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [selectedAttachments, setSelectedAttachments] = useState<Set<string>>(new Set());
  const [deletingMultiple, setDeletingMultiple] = useState(false);

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

  const handleDeleteMultiple = async () => {
    setDeletingMultiple(true);
    setConfirmDeleteMultiple(false);

    try {
      console.log('🗑️ Deleting multiple attachments:', Array.from(selectedAttachments));

      const deletePromises = Array.from(selectedAttachments).map(attachmentId =>
        supabase.functions.invoke('delete-attachment', {
          body: { attachmentId }
        })
      );

      const results = await Promise.allSettled(deletePromises);
      
      let successCount = 0;
      let failCount = 0;

      results.forEach((result, index) => {
        const attachmentId = Array.from(selectedAttachments)[index];
        if (result.status === 'fulfilled' && !result.value.error) {
          successCount++;
          if (onAttachmentDeleted) {
            onAttachmentDeleted(attachmentId);
          }
        } else {
          failCount++;
          console.error('❌ Failed to delete attachment:', attachmentId, result);
        }
      });

      if (successCount > 0) {
        toast.success(`${successCount} bilagor borttagna`);
      }
      if (failCount > 0) {
        toast.error(`Misslyckades att ta bort ${failCount} bilagor`);
      }

      setSelectedAttachments(new Set());

    } catch (error) {
      console.error('❌ Unexpected error deleting multiple attachments:', error);
      toast.error('Ett oväntat fel uppstod');
    } finally {
      setDeletingMultiple(false);
    }
  };

  const handleRenameAttachment = async (attachmentId: string, newName: string) => {
    if (!newName.trim()) {
      toast.error('Filnamnet kan inte vara tomt');
      return;
    }

    try {
      console.log('✏️ Renaming attachment:', attachmentId, 'to:', newName);

      const { error } = await supabase
        .from('booking_attachments')
        .update({ file_name: newName.trim() })
        .eq('id', attachmentId);

      if (error) {
        console.error('❌ Error renaming attachment:', error);
        toast.error('Misslyckades att byta namn på bilagan');
        return;
      }

      console.log('✅ Attachment renamed successfully');
      toast.success('Bilaga omdöpt');
      
      if (onAttachmentRenamed) {
        onAttachmentRenamed(attachmentId, newName.trim());
      }

      setEditingId(null);
      setEditingName('');

    } catch (error) {
      console.error('❌ Unexpected error renaming attachment:', error);
      toast.error('Ett oväntat fel uppstod');
    }
  };

  const startEditing = (attachment: BookingAttachment) => {
    setEditingId(attachment.id);
    setEditingName(attachment.fileName);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleSelectAttachment = (attachmentId: string, checked: boolean) => {
    const newSelected = new Set(selectedAttachments);
    if (checked) {
      newSelected.add(attachmentId);
    } else {
      newSelected.delete(attachmentId);
    }
    setSelectedAttachments(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedAttachments(new Set(attachments.map(a => a.id)));
    } else {
      setSelectedAttachments(new Set());
    }
  };

  const allSelected = attachments.length > 0 && selectedAttachments.size === attachments.length;
  const someSelected = selectedAttachments.size > 0 && selectedAttachments.size < attachments.length;

  return (
    <Card className="shadow-sm">
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-1.5">
            <Paperclip className="h-4 w-4" />
            <span>Bilagor</span>
          </div>
          
          <div className="flex items-center gap-2">
            <FileUpload 
              bookingId={bookingId}
              onFileUploaded={onAttachmentAdded}
            />
            
            {attachments.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={handleSelectAll}
                    className="data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground"
                    {...(someSelected ? { 'data-state': 'indeterminate' } : {})}
                  />
                  <span className="text-xs text-gray-500">
                    {selectedAttachments.size > 0 ? `${selectedAttachments.size} valda` : 'Välj alla'}
                  </span>
                </div>
                
                {selectedAttachments.size > 0 && (
                  <ConfirmationDialog
                    title="Ta bort bilagor"
                    description={`Är du säker på att du vill ta bort ${selectedAttachments.size} bilagor? Denna åtgärd kan inte ångras.`}
                    confirmLabel="Ta bort alla"
                    cancelLabel="Avbryt"
                    onConfirm={handleDeleteMultiple}
                    open={confirmDeleteMultiple}
                    onOpenChange={setConfirmDeleteMultiple}
                  >
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setConfirmDeleteMultiple(true)}
                      disabled={deletingMultiple}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Ta bort ({selectedAttachments.size})
                    </Button>
                  </ConfirmationDialog>
                )}
              </div>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-3">
        {attachments && attachments.length > 0 ? (
          <ul className="divide-y divide-gray-100">
            {attachments.map(attachment => (
              <li key={attachment.id} className="py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Checkbox
                    checked={selectedAttachments.has(attachment.id)}
                    onCheckedChange={(checked) => handleSelectAttachment(attachment.id, checked as boolean)}
                  />
                  
                  {editingId === attachment.id ? (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="h-7 text-sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleRenameAttachment(attachment.id, editingName);
                          } else if (e.key === 'Escape') {
                            cancelEditing();
                          }
                        }}
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRenameAttachment(attachment.id, editingName)}
                        className="h-7 w-7 p-0"
                      >
                        <Check className="h-3 w-3 text-green-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={cancelEditing}
                        className="h-7 w-7 p-0"
                      >
                        <X className="h-3 w-3 text-red-600" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      {isImageFile(attachment.fileName, attachment.fileType) ? (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                            <img
                              src={attachment.url}
                              alt={attachment.fileName}
                              className="h-12 w-12 object-cover rounded border hover:opacity-80 transition-opacity"
                            />
                          </a>
                          <a 
                            href={attachment.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-sm truncate"
                          >
                            {attachment.fileName}
                          </a>
                        </div>
                      ) : (
                        <a 
                          href={attachment.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center text-blue-600 hover:underline text-sm flex-1 min-w-0"
                        >
                          <FileImage className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                          <span className="truncate">{attachment.fileName}</span>
                          <span className="text-xs text-gray-500 ml-1.5 flex-shrink-0">
                            ({attachment.fileType})
                          </span>
                        </a>
                      )}
                    </>
                  )}
                </div>
                
                {editingId !== attachment.id && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEditing(attachment)}
                      className="h-7 w-7 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                    >
                      <Edit3 className="h-3 w-3" />
                    </Button>
                    
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
                        className="h-7 w-7 p-0 text-red-600 hover:text-red-800 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </ConfirmationDialog>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-gray-400 italic py-2">
            Inga bilagor tillgängliga
          </div>
        )}
      </CardContent>
    </Card>
  );
};
