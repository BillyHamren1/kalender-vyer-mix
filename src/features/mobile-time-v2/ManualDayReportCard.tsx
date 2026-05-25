/**
 * ManualDayReportCard — fallback när inget GPS-förslag finns.
 * Användaren fyller i start, slut, rast och skickar in en manuell tidrapport.
 */
import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2, ClipboardEdit } from 'lucide-react';

interface Props {
  date: string;
  userComment: string;
  onUserCommentChange: (v: string) => void;
  onSubmitManual: (input: {
    startTime: string;
    endTime: string;
    breakMinutes: number;
  }) => void | Promise<void>;
  isSubmitting: boolean;
  disabled?: boolean;
  disabledReason?: string | null;
}

function diffMinutes(start: string, end: string): number {
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60; // stötta nattpass
  return mins;
}

function fmtDuration(mins: number): string {
  if (mins <= 0) return '0h';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const ManualDayReportCard: React.FC<Props> = ({
  userComment,
  onUserCommentChange,
  onSubmitManual,
  isSubmitting,
  disabled,
  disabledReason,
}) => {
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('16:00');
  const [breakStr, setBreakStr] = useState('30');

  const breakMinutes = Math.max(0, Math.round(Number(breakStr) || 0));
  const grossMin = useMemo(() => diffMinutes(startTime, endTime), [startTime, endTime]);
  const netMin = Math.max(0, grossMin - breakMinutes);

  const startValid = /^\d{2}:\d{2}$/.test(startTime);
  const endValid = /^\d{2}:\d{2}$/.test(endTime);
  const canSubmit =
    !disabled && !isSubmitting && startValid && endValid && grossMin > 0 && breakMinutes < grossMin;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardEdit className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Manuell tidrapport</h3>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        Inget GPS-förslag hittades. Fyll i din arbetstid och skicka in.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="manual-start">Start</Label>
          <Input
            id="manual-start"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            disabled={disabled || isSubmitting}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="manual-end">Slut</Label>
          <Input
            id="manual-end"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            disabled={disabled || isSubmitting}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="manual-break">Rast (minuter)</Label>
        <Input
          id="manual-break"
          type="number"
          min={0}
          inputMode="numeric"
          value={breakStr}
          onChange={(e) => setBreakStr(e.target.value)}
          disabled={disabled || isSubmitting}
        />
      </div>

      <div className="rounded-md bg-muted/50 p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Brutto</span>
          <span className="font-medium">{fmtDuration(grossMin)}</span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-muted-foreground">Rast</span>
          <span className="font-medium">{fmtDuration(breakMinutes)}</span>
        </div>
        <div className="flex items-center justify-between mt-1 pt-1 border-t">
          <span className="text-muted-foreground">Arbetstid</span>
          <span className="font-semibold">{fmtDuration(netMin)}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="manual-comment">Kommentar till admin (valfri)</Label>
        <Textarea
          id="manual-comment"
          rows={3}
          value={userComment}
          onChange={(e) => onUserCommentChange(e.target.value)}
          disabled={disabled || isSubmitting}
          placeholder="t.ex. glömde slå på telefonen, jobbade på lager …"
        />
      </div>

      {disabled && disabledReason && (
        <p className="text-sm text-muted-foreground">{disabledReason}</p>
      )}

      <Button
        onClick={() => onSubmitManual({ startTime, endTime, breakMinutes })}
        disabled={!canSubmit}
        className="w-full"
        size="lg"
      >
        {isSubmitting ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Skickar…</>
        ) : (
          <><Send className="h-4 w-4 mr-2" />Skicka in tidrapport</>
        )}
      </Button>
    </Card>
  );
};

export default ManualDayReportCard;
