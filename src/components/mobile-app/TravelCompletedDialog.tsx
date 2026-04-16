import { useState } from 'react';
import { MapPin, Clock, MessageSquare, Check, X } from 'lucide-react';
import { TravelCompletedInfo } from '@/hooks/useTravelDetection';
import { mobileApi } from '@/services/mobileApiService';
import { toast } from 'sonner';

interface TravelCompletedDialogProps {
  info: TravelCompletedInfo;
  onDismiss: () => void;
}

function formatDuration(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m} min`;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export default function TravelCompletedDialog({ info, onDismiss }: TravelCompletedDialogProps) {
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await mobileApi.updateTravelLog({
        travel_log_id: info.travelLogId,
        description: comment || undefined,
        manual_project_name: info.matchedBookingId ? undefined : (info.toAddress || 'Unknown location'),
      });
      toast.success('Travel saved');
      onDismiss();
    } catch (err) {
      console.error('[TravelCompleted] Save failed:', err);
      toast.error('Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-card rounded-t-3xl shadow-2xl border-t border-border/50 p-6 pb-10 animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-base">Travel completed</h3>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>{formatDuration(info.hoursWorked)}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="p-2 rounded-xl hover:bg-muted/60 transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Destination */}
        <div className="rounded-2xl bg-muted/40 border border-border/50 p-4 mb-4">
          <p className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground mb-1">
            Destination
          </p>
          <p className="text-sm font-semibold text-foreground">
            {info.toAddress || 'Unknown location'}
          </p>
          {info.matchedBookingId && (
            <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
              Linked to booking
            </span>
          )}
        </div>

        {/* Comment field */}
        {!info.matchedBookingId && (
          <div className="mb-5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-2">
              <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
              What did you do here?
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Briefly describe what you did..."
              className="w-full rounded-xl border border-border/60 bg-background px-4 py-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              rows={3}
            />
          </div>
        )}

        {/* Actions */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          <Check className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
