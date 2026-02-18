import { useState, useEffect, useRef } from 'react';
import { mobileApi } from '@/services/mobileApiService';
import { Image, Camera, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface JobPhotosTabProps {
  bookingId: string;
}

const isImageFile = (file: any): boolean => {
  if (file.file_type?.startsWith('image/')) return true;
  return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.url || '');
};

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

  // Separate by source, keep only images
  const uploadedPhotos = files.filter(f => f.source === 'project' && isImageFile(f));
  const bookingImages = files
    .filter(f => f.source === 'booking' && isImageFile(f))
    .filter((f, idx, arr) => arr.findIndex((x: any) => x.url === f.url) === idx);

  return (
    <div className="space-y-6">
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

      {/* Uploaded project photos */}
      {uploadedPhotos.length === 0 ? (
        <div className="text-center py-6">
          <Image className="w-10 h-10 mx-auto text-muted-foreground/20 mb-2" />
          <p className="text-sm text-muted-foreground">Inga egna bilder ännu</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {uploadedPhotos.map((file: any) => (
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

      {/* Booking images section */}
      {bookingImages.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
            Bilder från bokning
          </p>
          <div className="grid grid-cols-2 gap-2">
            {bookingImages.map((img: any) => (
              <button
                key={img.id || img.url}
                onClick={() => setPreviewUrl(img.url)}
                className="rounded-xl border overflow-hidden aspect-video bg-muted"
              >
                <img
                  src={img.url}
                  alt={img.file_name || img.name || 'Bild'}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
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
