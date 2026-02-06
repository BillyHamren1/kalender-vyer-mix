import { useState, useEffect, useRef } from 'react';
import { mobileApi } from '@/services/mobileApiService';
import { Image, Camera, Upload, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface JobPhotosTabProps {
  bookingId: string;
}

const JobPhotosTab = ({ bookingId }: JobPhotosTabProps) => {
  const [files, setFiles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = () => {
    mobileApi.getProjectFiles(bookingId)
      .then(res => setFiles(res.files || []))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { fetchFiles(); }, [bookingId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target?.result as string;
        await mobileApi.uploadFile({
          booking_id: bookingId,
          file_name: file.name,
          file_data: base64,
          file_type: file.type,
        });
        toast.success('Fil uppladdad!');
        fetchFiles();
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      toast.error('Uppladdning misslyckades');
    } finally {
      setIsUploading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Upload button */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleUpload}
        className="hidden"
      />
      <Button
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className="w-full h-12 rounded-xl gap-2"
      >
        {isUploading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Camera className="w-5 h-5" />
        )}
        {isUploading ? 'Laddar upp...' : 'Ta foto / ladda upp'}
      </Button>

      {/* Image grid */}
      {files.length === 0 ? (
        <div className="text-center py-8">
          <Image className="w-10 h-10 mx-auto text-muted-foreground/20 mb-2" />
          <p className="text-sm text-muted-foreground">Inga bilder ännu</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {files.map((file: any) => (
            <button
              key={file.id || file.url}
              onClick={() => setPreviewUrl(file.url)}
              className="rounded-xl border overflow-hidden aspect-square bg-muted"
            >
              <img
                src={file.url}
                alt={file.name || 'Foto'}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

      {/* Full-screen preview */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <button className="absolute top-4 right-4 p-2 rounded-full bg-white/20 z-10">
            <X className="w-6 h-6 text-white" />
          </button>
          <img src={previewUrl} alt="Preview" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
};

export default JobPhotosTab;
