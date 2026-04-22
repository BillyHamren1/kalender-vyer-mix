import React, { useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, RotateCcw, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/i18n/LanguageContext';
import { useMobileBookings } from '@/hooks/useMobileData';
import { supabase } from '@/integrations/supabase/client';
import { createAttachmentViaApi } from '@/services/planningApiService';
import { toast } from 'sonner';
import { format } from 'date-fns';

const MobileCameraCapture: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: bookings = [] } = useMobileBookings();

  const [selectedBookingId, setSelectedBookingId] = useState<string>('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Bookings sorted with today's/upcoming first
  const sortedBookings = useMemo(() => {
    return [...bookings].sort((a, b) => {
      const ad = a.eventdate || a.rigdaydate || '';
      const bd = b.eventdate || b.rigdaydate || '';
      return ad.localeCompare(bd);
    });
  }, [bookings]);

  const openCamera = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const reset = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (!photoFile || !selectedBookingId) return;
    setSaving(true);
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const ext = photoFile.name.split('.').pop() || 'jpg';
      const path = `${selectedBookingId}/${selectedBookingId}-${ts}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('map-snapshots')
        .upload(path, photoFile, { cacheControl: '3600', upsert: false });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from('map-snapshots').getPublicUrl(path);

      await createAttachmentViaApi(selectedBookingId, {
        file_name: photoFile.name,
        file_type: photoFile.type,
        url: urlData.publicUrl,
      });

      toast.success(t('tools.cameraSaved'));
      reset();
      navigate('/m/tools');
    } catch (err) {
      console.error('Camera save failed:', err);
      toast.error(t('tools.cameraError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border/60">
        <button
          onClick={() => navigate('/m/tools')}
          className="p-2 -ml-2 rounded-lg active:bg-muted"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold">{t('tools.cameraTitle')}</h1>
      </header>

      <div className="p-4 space-y-5">
        {/* Booking selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('tools.cameraSelectBooking')}</label>
          {sortedBookings.length === 0 ? (
            <div className="p-4 rounded-xl bg-muted text-sm text-muted-foreground text-center">
              {t('tools.cameraNoBookings')}
            </div>
          ) : (
            <select
              value={selectedBookingId}
              onChange={(e) => setSelectedBookingId(e.target.value)}
              className="w-full h-12 rounded-xl border border-border bg-card px-3 text-sm"
            >
              <option value="">—</option>
              {sortedBookings.map((b) => {
                const date = b.eventdate || b.rigdaydate;
                const dateLabel = date ? format(new Date(date), 'yyyy-MM-dd') : '';
                return (
                  <option key={b.id} value={b.id}>
                    {dateLabel} · {b.client}
                  </option>
                );
              })}
            </select>
          )}
        </div>

        {/* Photo area */}
        <div className="space-y-3">
          {photoPreview ? (
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/4] max-h-[60vh]">
              <img src={photoPreview} alt="" className="w-full h-full object-contain" />
            </div>
          ) : (
            <button
              onClick={openCamera}
              className="w-full aspect-[3/4] max-h-[60vh] rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-3 text-muted-foreground active:bg-muted"
            >
              <Camera className="w-12 h-12" />
              <span className="text-sm font-medium">{t('tools.cameraTake')}</span>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />

          {photoPreview && (
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-12"
                onClick={reset}
                disabled={saving}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                {t('tools.cameraRetake')}
              </Button>
              <Button
                type="button"
                className="flex-1 h-12"
                onClick={handleSave}
                disabled={saving || !selectedBookingId}
              >
                {saving ? (
                  <>{t('tools.cameraSaving')}</>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    {t('tools.cameraSave')}
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MobileCameraCapture;
