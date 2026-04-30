import React from 'react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Bell, Clock, MapPin, MessageSquare, User } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { useReverseGeocode } from '@/hooks/useReverseGeocode';
import type { NotificationEntry } from '@/lib/staff/dayEventLog';

interface Props {
  notification: NotificationEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ANSWER_SOURCE_LABEL: Record<string, string> = {
  staff: 'Personalen',
  admin: 'Admin',
  auto: 'Systemet (auto)',
};

const fmt = (iso: string | null | undefined) => {
  if (!iso) return '—';
  try { return format(new Date(iso), "d MMM yyyy 'kl' HH:mm:ss", { locale: sv }); }
  catch { return '—'; }
};

/** Try to extract coordinates from the flag context where the user answered. */
function extractAnsweredCoords(ctx: Record<string, any> | null | undefined):
  { lat: number; lng: number } | null {
  if (!ctx) return null;
  // Try common shapes
  const candidates = [
    [ctx.answered_lat, ctx.answered_lng],
    [ctx.answer_lat, ctx.answer_lng],
    [ctx.resolved_lat, ctx.resolved_lng],
    [ctx.location?.lat, ctx.location?.lng],
    [ctx.answer?.lat, ctx.answer?.lng],
  ];
  for (const [lat, lng] of candidates) {
    if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
  }
  return null;
}

export const NotificationDetailDialog: React.FC<Props> = ({
  notification, open, onOpenChange,
}) => {
  const coords = extractAnsweredCoords(notification?.context);
  const [addr] = useReverseGeocode([coords]);

  if (!notification) return null;
  const n = notification;

  const sourceLabel = n.answerSource
    ? ANSWER_SOURCE_LABEL[n.answerSource] || n.answerSource
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-2">
            <Bell className="h-4 w-4 mt-1 shrink-0 text-muted-foreground" />
            <span>{n.question}</span>
          </DialogTitle>
          {n.detail && (
            <DialogDescription className="pl-6">{n.detail}</DialogDescription>
          )}
        </DialogHeader>

        <div className="flex flex-col gap-4 text-sm">
          {/* Frågan ställdes */}
          <Section icon={Clock} title="Frågan ställdes">
            <div className="tabular-nums">{fmt(n.at)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Typ: <code className="text-[11px]">{n.flagType}</code>
            </div>
          </Section>

          {/* Svar */}
          <Section icon={MessageSquare} title="Svar">
            {n.resolved ? (
              <>
                <div className="text-foreground">
                  {n.answer || 'Bekräftad utan kommentar.'}
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  {sourceLabel && (
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {sourceLabel}
                      {n.resolvedBy && n.answerSource !== 'auto' && (
                        <span className="text-muted-foreground/70">
                          ({n.resolvedBy.slice(0, 12)}…)
                        </span>
                      )}
                    </span>
                  )}
                  {n.resolvedAt && (
                    <span className="tabular-nums">{fmt(n.resolvedAt)}</span>
                  )}
                </div>
              </>
            ) : (
              <div className="text-amber-700 dark:text-amber-400 text-xs font-medium">
                Inget svar än — väntar på personalen.
              </div>
            )}
          </Section>

          {/* Plats vid svar */}
          {n.resolved && (
            <Section icon={MapPin} title="Var personen befann sig vid svaret">
              {coords ? (
                <>
                  <div>{addr || 'Hämtar adress…'}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                    {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground">
                  Ingen position registrerad vid svaret.
                </div>
              )}
            </Section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const Section: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}> = ({ icon: Icon, title, children }) => (
  <div className="rounded-md border border-border/60 bg-muted/20 p-3">
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
      <Icon className="h-3 w-3" />
      {title}
    </div>
    <div>{children}</div>
  </div>
);
