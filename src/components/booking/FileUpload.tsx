import React, { useRef, useState } from 'react';
import { Upload, Plus, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface FileUploadProps {
  bookingId: string;
  onFileUploaded: (attachment: any) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ bookingId, onFileUploaded }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast.error('File size must be less than 10MB');
      return;
    }

    setUploading(true);

    try {
      console.log('📤 Uploading file:', file.name, 'Size:', file.size);

      // Generate unique filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileExtension = file.name.split('.').pop();
      const uniqueFileName = `${bookingId}-${timestamp}.${fileExtension}`;
      const filePath = `${bookingId}/${uniqueFileName}`;

      // Upload file to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('map-snapshots') // Using existing public bucket
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('❌ Upload error:', uploadError);
        toast.error('Kunde inte ladda upp filen');
        return;
      }

      console.log('✅ File uploaded successfully:', uploadData);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('map-snapshots')
        .getPublicUrl(filePath);

      console.log('🔗 Public URL generated:', urlData.publicUrl);

      // Save attachment record via Booking API (source of truth)
      const { createAttachmentViaApi } = await import('@/services/planningApiService');
      let attachmentData: any;
      let dbError: any = null;
      try {
        attachmentData = await createAttachmentViaApi(bookingId, {
          file_name: file.name,
          file_type: file.type,
          url: urlData.publicUrl
        });
      } catch (e) {
        dbError = e;
      }

      if (dbError) {
        console.error('❌ Database error:', dbError);
        // Try to clean up uploaded file
        await supabase.storage.from('map-snapshots').remove([filePath]);
        toast.error('Kunde inte spara bilagepost');
        return;
      }

      console.log('✅ Attachment saved successfully:', attachmentData);
      toast.success(`Filen "${file.name}" har laddats upp`);

      // Call callback with new attachment
      onFileUploaded({
        id: attachmentData.id,
        fileName: attachmentData.file_name,
        fileType: attachmentData.file_type,
        url: attachmentData.url
      });

      // Clear the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error) {
      console.error('❌ Unexpected error uploading file:', error);
      toast.error('Ett oväntat fel inträffade');
    } finally {
      setUploading(false);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        className="hidden"
        accept="image/*,.pdf,.doc,.docx,.txt,.xlsx,.xls"
      />
      
      <Button
        variant="outline"
        size="sm"
        onClick={handleButtonClick}
        disabled={uploading}
        className="flex items-center gap-1.5"
      >
        {uploading ? (
          <>
            <div className="animate-spin h-3 w-3 border-2 border-primary border-t-transparent rounded-full" />
            <span>Laddar upp...</span>
          </>
        ) : (
          <>
            <Plus className="h-3 w-3" />
            <span>Lägg till fil</span>
          </>
        )}
      </Button>
    </div>
  );
};