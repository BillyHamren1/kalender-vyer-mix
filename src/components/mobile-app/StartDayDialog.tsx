/**
 * StartDayDialog — REN dagstart.
 *
 * Användaren kan ENDAST starta arbetsdagen. Inga projekt/bokningar/
 * lager/locations kan väljas härifrån. Time Engine kopplar projekt,
 * lager och transport automatiskt utifrån GPS/geofence.
 *
 * Returnerar alltid en `presence`-selection. Faktisk start sker i
 * parent (CompactWorkDayTimer / WorkDayPanel) via
 * mobileApi.startTimeRegistration utan target.
 */
import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Clock, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/LanguageContext';

export type StartDaySelection = {
  kind: 'presence';
  startedAtIso?: string;
};

interface StartDayDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (selection: StartDaySelection) => void | Promise<void>;
  starting?: boolean;
}

type StartMode = 'now' | 'custom';

const pad = (n: number) => String(n).padStart(2, '0');
const nowHHMM = (): string => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** "now" → undefined (server uses now). Custom HH:MM is interpreted on
 *  today; future times collapse to undefined. */
function resolveStartedAtIso(mode: StartMode, customHHMM: string): string | undefined {
  if (mode === 'now') return undefined;
  const m = /^(\d{1,2}):(\d{2})$/.exec(customHHMM.trim());
  if (!m) return undefined;
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  const candidate = new Date();
  candidate.setHours(h, min, 0, 0);
  if (candidate.getTime() > Date.now()) return undefined;
  return candidate.toISOString();
}

export const StartDayDialog: React.FC<StartDayDialogProps> = ({
  open, onClose, onConfirm, starting,
}) => {
  const { t } = useLanguage();
  const [mode, setMode] = useState<StartMode>('now');
  const [customHHMM, setCustomHHMM] = useState<string>(nowHHMM);

  useEffect(() => {
    if (open) {
      setMode('now');
      setCustomHHMM(nowHHMM());
    }
  }, [open]);

  const handlePresence = () => {
    if (starting) return;
    void onConfirm({
      kind: 'presence',
      startedAtIso: resolveStartedAtIso(mode, customHHMM),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !starting) onClose(); }}>
      <DialogContent className="max-w-md flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle>{t('startDay.title')}</DialogTitle>
          <DialogDescription>
            Starta arbetsdagen. Projekt, lager och transport kopplas
            automatiskt av Time Engine.
          </DialogDescription>
        </DialogHeader>

        {/* ─────────── Starttid ─────────── */}
        <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            Starttid
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              { key: 'now', label: 'Starta nu' },
              { key: 'custom', label: 'Välj starttid' },
            ] as Array<{ key: StartMode; label: string }>).map(opt => (
              <button
                key={opt.key}
                type="button"
                disabled={starting}
                onClick={() => setMode(opt.key)}
                className={cn(
                  'h-10 rounded-lg text-sm font-semibold border transition-colors',
                  mode === opt.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border hover:bg-accent',
                  starting && 'opacity-50',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {mode === 'custom' && (
            <div className="space-y-1">
              <Input
                type="time"
                value={customHHMM}
                onChange={(e) => setCustomHHMM(e.target.value)}
                disabled={starting}
                className="h-10 text-base tabular-nums"
                step={60}
              />
              <p className="text-[11px] text-muted-foreground">
                Välj valfri tid tidigare samma dag.
              </p>
            </div>
          )}
        </div>

        {/* ─────────── Primär CTA ─────────── */}
        <Button
          size="lg"
          className="w-full h-12 rounded-xl text-sm font-bold gap-2"
          onClick={handlePresence}
          disabled={starting}
        >
          <Play className="w-4 h-4 fill-current" />
          {starting ? 'Startar…' : 'Starta arbetsdag'}
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default StartDayDialog;
