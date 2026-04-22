import { useEffect, useRef, useState } from 'react';
import { mobileApi } from '@/services/mobileApiService';
import { Image as ImageIcon, Camera, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { takePhotoBase64 } from '@/utils/capacitorCamera';
import { toast } from 'sonner';
import { useLanguage } from '@/i18n/LanguageContext';

const LagerPhotosSection = () => {
  const { t } = useLanguage();
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    mobileApi.getLagerFiles()
      .then(res => setFiles((res.files || []).filter((f: any) => f.file_type?.startsWith('image/'))))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const upload = async (base64: string, fileName: string, fileType: string) => {
    setUploading(true);
    try {
      await mobileApi.uploadLagerFile({ file_name: fileName, file_data: base64, file_type: fileType });
      toast.success(t('lager.imageSaved'));
      load();
    } catch (e: any) {
      toast.error(e?.message || t('lager.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const handleCamera = async () => {
    const base64 = await takePhotoBase64();
    if (base64) {
      await upload(base64, `lager_${Date.now()}.jpg`, 'image/jpeg');
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      await upload(ev.target?.result as string, file.name, file.type);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {t('lager.images')}
          </h2>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />

      <Button onClick={handleCamera} disabled={uploading} className="w-full h-11 rounded-xl gap-2 mb-3">
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
        {uploading ? t('lager.uploading') : t('lager.takeOrChoose')}
      </Button>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : files.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-5 text-center">
          <p className="text-sm text-muted-foreground">{t('lager.noImages')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {files.map((f: any) => (
            <button
              key={f.id}
              onClick={() => setPreview(f.url)}
              className="aspect-square rounded-xl border overflow-hidden bg-muted active:scale-95 transition-transform"
            >
              <img src={f.url} alt={f.file_name || ''} className="w-full h-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-[100] bg-black flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <button className="absolute top-4 right-4 p-2 rounded-full bg-white/20 z-10">
            <X className="w-6 h-6 text-white" />
          </button>
          <img src={preview} alt="" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
};

export default LagerPhotosSection;
