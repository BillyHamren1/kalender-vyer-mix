import { useState, useEffect, useRef } from 'react';
import { mobileApi } from '@/services/mobileApiService';
import { Image, Camera, Loader2, X, FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { takePhotoBase64 } from '@/utils/capacitorCamera';
import { openFileExternally } from '@/lib/files/openFileExternally';

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

  const uploadBase64 = async (base64: string, fileName: string, fileType: string) => {
    await mobileApi.uploadFile({
      booking_id: bookingId,
      file_name: fileName,
      file_data: base64,
      file_type: fileType,
    });
    toast.success('Photo saved!');
    fetchFiles();
  };

  const handleCameraClick = async () => {
    const base64 = await takePhotoBase64();
    if (base64) {
      setIsUploading(true);
      try {
        const fileName = `photo_${Date.now()}.jpg`;
        await uploadBase64(base64, fileName, 'image/jpeg');
      } catch {
        toast.error('Upload failed');
      } finally {
        setIsUploading(false);
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const base64 = ev.target?.result as string;
        await uploadBase64(base64, file.name, file.type);
      } catch {
        toast.error('Upload failed');
      } finally {
        setIsUploading(false);
      }
    };
    reader.onerror = () => {
      toast.error('Could not read file');
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const dedupe = (arr: any[]) => arr.filter((f, idx, a) => a.findIndex((x: any) => x.url === f.url) === idx);
  const uploadedPhotos = dedupe(files.filter(f => f.source === 'project' && isImageFile(f)));
  const bookingImages = dedupe(files.filter(f => f.source === 'booking' && isImageFile(f)));
  const otherFiles = dedupe(files.filter(f => !isImageFile(f)));

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      <Button
        onClick={handleCameraClick}
        disabled={isUploading}
        className="w-full h-12 rounded-xl gap-2"
      >
        {isUploading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Camera className="w-5 h-5" />
        )}
        {isUploading ? 'Uploading...' : 'Take photo / upload'}
      </Button>

      {uploadedPhotos.length === 0 ? (
        <div className="text-center py-6">
          <Image className="w-10 h-10 mx-auto text-muted-foreground/20 mb-2" />
          <p className="text-sm text-muted-foreground">No photos yet</p>
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
                alt={file.name || 'Photo'}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

      {bookingImages.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
            Images from booking
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
                  alt={img.file_name || img.name || 'Image'}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {otherFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
            Documents & files
          </p>
          <div className="space-y-1.5">
            {otherFiles.map((file: any) => {
              const isPdf = file.file_type === 'application/pdf' || /\.pdf$/i.test(file.url || '');
              const fileName = file.file_name || file.name || 'File';
              return (
                <button
                  key={file.id || file.url}
                  type="button"
                  onClick={() => openFileExternally(file.url, fileName)}
                  className="w-full flex items-center gap-3 rounded-xl border bg-card p-3 active:scale-[0.98] transition-transform text-left"
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isPdf ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {fileName}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {file.source === 'booking' ? 'From booking' : 'From project'}
                      {isPdf ? ' · PDF' : ''}
                    </p>
                  </div>
                  <Download className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      )}

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
