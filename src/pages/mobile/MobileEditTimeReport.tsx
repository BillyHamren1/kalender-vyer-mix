import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { mobileApi, MobileTimeReport } from '@/services/mobileApiService';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useInvalidateMobileData } from '@/hooks/useMobileData';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { ArrowLeft, Loader2, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { MobileHeroHeader } from '@/components/mobile-app/MobileHeader';
import { formatHoursMinutes } from '@/utils/formatHours';

const MobileEditTimeReport = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { staff } = useMobileAuth();
  const { invalidateTimeReports } = useInvalidateMobileData();

  const [report, setReport] = useState<MobileTimeReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Editable fields
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [breakTime, setBreakTime] = useState('');
  const [overtime, setOvertime] = useState('');
  const [description, setDescription] = useState('');
  const [editReason, setEditReason] = useState('');

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const res = await mobileApi.getTimeReports();
        const found = res.time_reports?.find(r => r.id === id);
        if (found) {
          setReport(found);
          setStartTime(found.start_time?.slice(0, 5) || '');
          setEndTime(found.end_time?.slice(0, 5) || '');
          setBreakTime(String(found.break_time || 0));
          setOvertime(String(found.overtime_hours || 0));
          setDescription(found.description || '');
        }
      } catch (err) {
        console.warn('Failed to fetch report:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [id]);

  const calculateHours = () => {
    if (!startTime || !endTime) return 0;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let total = (eh + em / 60) - (sh + sm / 60);
    if (total < 0) total += 24;
    const breakHours = parseFloat(breakTime || '0');
    total -= breakHours;
    return Math.max(0, Math.round(total * 100) / 100);
  };

  const hasChanges = () => {
    if (!report) return false;
    return (
      startTime !== (report.start_time?.slice(0, 5) || '') ||
      endTime !== (report.end_time?.slice(0, 5) || '') ||
      breakTime !== String(report.break_time || 0) ||
      overtime !== String(report.overtime_hours || 0) ||
      description !== (report.description || '')
    );
  };

  const handleSave = async () => {
    if (!report || !id) return;

    if (!editReason.trim()) {
      toast.error('Du måste ange en anledning till ändringen');
      return;
    }

    if (!startTime || !endTime) {
      toast.error('Start- och sluttid krävs');
      return;
    }

    const hours = calculateHours();
    if (hours <= 0) {
      toast.error('Arbetad tid måste vara mer än 0');
      return;
    }

    setSaving(true);
    try {
      const updatedDescription = description
        ? `${description}\n\n[Ändrad: ${editReason.trim()}]`
        : `[Ändrad: ${editReason.trim()}]`;

      await mobileApi.updateTimeReport({
        time_report_id: id,
        start_time: startTime,
        end_time: endTime,
        hours_worked: hours,
        break_time: parseFloat(breakTime || '0'),
        overtime_hours: parseFloat(overtime || '0'),
        description: updatedDescription,
      });
      toast.success('Tidrapport uppdaterad');
      invalidateTimeReports();
      navigate(-1);
    } catch (err: any) {
      toast.error(err.message || 'Kunde inte uppdatera tidrapport');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;

    if (!editReason.trim()) {
      toast.error('Du måste ange en anledning innan du raderar');
      return;
    }

    setDeleting(true);
    try {
      await mobileApi.deleteTimeReport(id);
      toast.success('Tidrapport raderad');
      invalidateTimeReports();
      navigate(-1);
    } catch (err: any) {
      toast.error(err.message || 'Kunde inte radera tidrapport');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-card">
        <MobileHeroHeader eyebrow="TIDRAPPORT" title="Redigera" subtitle="Laddar..." />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex flex-col min-h-screen bg-card">
        <MobileHeroHeader eyebrow="TIDRAPPORT" title="Hittades inte" subtitle="" />
        <div className="flex-1 flex items-center justify-center flex-col gap-3">
          <p className="text-sm text-muted-foreground">Tidrapporten kunde inte hittas</p>
          <Button variant="outline" onClick={() => navigate(-1)}>Tillbaka</Button>
        </div>
      </div>
    );
  }

  const jobName = report.large_project_name || report.bookings?.client || 'Okänt jobb';
  const dateLabel = format(parseISO(report.report_date), 'd MMMM yyyy', { locale: sv });

  return (
    <div className="flex flex-col min-h-screen bg-card pb-24">
      <MobileHeroHeader
        eyebrow="REDIGERA TIDRAPPORT"
        title={jobName}
        subtitle={dateLabel}
        rightAction={
          <button
            onClick={() => navigate(-1)}
            className="p-2.5 rounded-xl bg-primary-foreground/10 active:scale-95 transition-all"
          >
            <ArrowLeft className="w-4.5 h-4.5 text-primary-foreground/80" />
          </button>
        }
      />

      <div className="flex-1 px-5 pt-5 pb-28 space-y-5">
        {/* Current values summary */}
        <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Nuvarande</p>
          <p className="text-sm text-foreground">
            {report.start_time?.slice(0, 5)} – {report.end_time?.slice(0, 5)}
            {report.break_time > 0 && ` · ${report.break_time}h rast`}
            {' · '}
            <span className="font-bold">{formatHoursMinutes(report.hours_worked)}</span>
          </p>
          {report.approved && (
            <p className="text-[11px] text-primary font-semibold mt-1">✓ Godkänd</p>
          )}
        </div>

        {/* Edit fields */}
        <div className="space-y-4">
          <div className="flex gap-3 w-full">
            <div className="flex-1 min-w-0 space-y-2">
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Start</Label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="h-12 w-full rounded-xl text-sm bg-muted/40 border border-border text-center px-2 box-border"
              />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Slut</Label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="h-12 w-full rounded-xl text-sm bg-muted/40 border border-border text-center px-2 box-border"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Rast</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: 'Ingen', value: '0' },
                { label: '30m', value: '0.5' },
                { label: '45m', value: '0.75' },
                { label: '60m', value: '1' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setBreakTime(opt.value)}
                  className={`py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    breakTime === opt.value
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/60 text-muted-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Övertid (h)</Label>
            <Input
              type="number"
              step="0.5"
              value={overtime}
              onChange={e => setOvertime(e.target.value)}
              className="h-12 rounded-xl text-sm bg-muted/40 border-border"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Beskrivning</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Vad gjorde du..."
              className="rounded-xl min-h-[72px] text-sm bg-muted/40 border-border"
            />
          </div>

          <div className="h-px bg-border/50" />

          {/* Mandatory reason */}
          <div className="space-y-2">
            <Label className="text-[11px] font-semibold text-destructive uppercase tracking-wide">
              Anledning till ändring *
            </Label>
            <Textarea
              value={editReason}
              onChange={e => setEditReason(e.target.value)}
              placeholder="Ange varför du ändrar denna rapport..."
              className="rounded-xl min-h-[72px] text-sm bg-destructive/5 border-destructive/20 placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Summary + actions */}
        <div className="flex items-center justify-between pt-3 border-t border-border/40">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs text-muted-foreground">Ny tid:</span>
            <span className="text-lg font-extrabold text-foreground tabular-nums">{formatHoursMinutes(calculateHours())}</span>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving || !editReason.trim() || !hasChanges()}
            className="rounded-xl gap-2 h-11 px-6 text-sm font-semibold active:scale-[0.98] transition-all"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Spara
          </Button>
        </div>

        {/* Delete section */}
        <div className="pt-4 border-t border-border/40">
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 text-xs text-destructive/70 hover:text-destructive transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Radera tidrapport
            </button>
          ) : (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 space-y-3">
              <p className="text-xs font-semibold text-destructive">Är du säker? Detta kan inte ångras.</p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleting || !editReason.trim()}
                  className="rounded-xl text-xs"
                >
                  {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Radera
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="rounded-xl text-xs"
                >
                  Avbryt
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MobileEditTimeReport;
