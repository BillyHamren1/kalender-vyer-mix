import { useEffect } from 'react';
import { X, Download } from 'lucide-react';
import { openFileExternally } from '@/lib/files/openFileExternally';

interface Props {
  url: string;
  name?: string | null;
  onClose: () => void;
}

/** Full-screen image viewer used when tapping an image bubble. */
export const ImageLightbox = ({ url, name, onClose }: Props) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <img
        src={url}
        alt={name || 'image'}
        className="max-w-full max-h-full object-contain select-none"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />

      <button
        onClick={onClose}
        className="absolute top-3 right-3 w-10 h-10 rounded-full bg-white/15 backdrop-blur text-white flex items-center justify-center active:scale-95"
        aria-label="Stäng"
        style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <X className="w-5 h-5" />
      </button>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); openFileExternally(url, name || undefined); }}
        className="absolute top-3 left-3 w-10 h-10 rounded-full bg-white/15 backdrop-blur text-white flex items-center justify-center active:scale-95"
        aria-label="Ladda ner"
        style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <Download className="w-5 h-5" />
      </button>
    </div>
  );
};

export default ImageLightbox;
