import { useRef } from 'react';
import { Camera, Video, X } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { takePhotoBase64 } from '@/utils/capacitorCamera';
import { toast } from 'sonner';

export interface MediaItem {
  id: string;
  type: 'image' | 'video';
  dataUrl: string;
}

interface StepTransportRouteProps {
  media: MediaItem[];
  onAddMedia: (item: MediaItem) => void;
  onRemoveMedia: (id: string) => void;
  transportInfo: string;
  onTransportInfoChange: (value: string) => void;
}

const MAX_VIDEO_SECONDS = 10;

const StepTransportRoute = ({
  media,
  onAddMedia,
  onRemoveMedia,
  transportInfo,
  onTransportInfoChange,
}: StepTransportRouteProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCameraClick = async () => {
    const base64 = await takePhotoBase64();
    if (base64) {
      onAddMedia({ id: crypto.randomUUID(), type: 'image', dataUrl: base64 });
    } else {
      // Web fallback – open file picker
      fileInputRef.current?.click();
    }
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const validateVideoDuration = (dataUrl: string): Promise<boolean> =>
    new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        if (video.duration > MAX_VIDEO_SECONDS) {
          toast.error(`Video får vara max ${MAX_VIDEO_SECONDS} sekunder (var ${Math.round(video.duration)}s)`);
          resolve(false);
        } else {
          resolve(true);
        }
      };
      video.onerror = () => {
        resolve(false);
      };
      video.src = dataUrl;
    });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const dataUrl = await readFileAsDataUrl(file);
      const isVideo = file.type.startsWith('video/');

      if (isVideo) {
        const ok = await validateVideoDuration(URL.createObjectURL(file));
        if (!ok) continue;
        onAddMedia({ id: crypto.randomUUID(), type: 'video', dataUrl });
      } else {
        onAddMedia({ id: crypto.randomUUID(), type: 'image', dataUrl });
      }
    }

    // Reset so same file can be re-selected
    e.target.value = '';
  };

  return (
    <div className="space-y-5">
      <p className="text-sm font-semibold text-foreground">
        Dokumentera transportväg in samt yta för avlastning
      </p>

      {/* Camera / file button */}
      <button
        type="button"
        onClick={handleCameraClick}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-primary/40 text-primary font-medium text-sm active:scale-[0.98] transition-all"
      >
        <Camera className="w-5 h-5" />
        <span>Ta bild / video</span>
        <Video className="w-5 h-5" />
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Media gallery */}
      {media.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {media.map((item) => (
            <div key={item.id} className="relative aspect-square rounded-xl overflow-hidden border border-border bg-muted">
              {item.type === 'image' ? (
                <img src={item.dataUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <video src={item.dataUrl} className="w-full h-full object-cover" muted playsInline />
              )}
              <button
                type="button"
                onClick={() => onRemoveMedia(item.id)}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              {item.type === 'video' && (
                <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded">
                  Video
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Transport info text */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
          Transportinfo
        </label>
        <Textarea
          value={transportInfo}
          onChange={(e) => onTransportInfoChange(e.target.value)}
          placeholder="Beskriv transportväg, hinder, avlastningsyta…"
          className="min-h-[100px] rounded-xl text-sm"
        />
      </div>
    </div>
  );
};

export default StepTransportRoute;
