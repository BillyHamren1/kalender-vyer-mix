import { useState, useEffect } from 'react';
import { MapPin, Play, Square, X, Building2, FolderOpen, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GeofenceEvent } from '@/hooks/useGeofencing';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/LanguageContext';

interface GeofencePromptProps {
  event: GeofenceEvent;
  onConfirm: (correctedStartTime?: string) => void;
  onDismiss: () => void;
}

const GeofencePrompt = ({ event, onConfirm, onDismiss }: GeofencePromptProps) => {
  const { t } = useLanguage();
  const isEnter = event.type === 'enter';
  const isLocation = event.locationType === 'fixed';
  const isProject = event.locationType === 'project';

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const arrivalTimestamp = event.arrivalTimestamp;
  const timeSinceArrival = arrivalTimestamp ? now - arrivalTimestamp : 0;
  const showArrivalCorrection = isEnter && arrivalTimestamp && timeSinceArrival > 5 * 60 * 1000;

  const arrivalDate = arrivalTimestamp ? new Date(arrivalTimestamp) : null;
  const arrivalTimeStr = arrivalDate
    ? arrivalDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : '';

  const formatTimeSince = (ms: number): string => {
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return t('geo.minAgo', { mins });
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return remainMins > 0
      ? t('geo.hoursMinAgo', { h: hours, m: remainMins })
      : t('geo.hoursAgo', { h: hours });
  };

  const Icon = isProject ? FolderOpen : isLocation ? Building2 : MapPin;
  const label = isProject
    ? event.largeProjectName || t('geo.projectFallback')
    : isLocation
      ? event.locationName || t('geo.locationFallback')
      : event.booking?.client || '';

  const enterTitle = isProject
    ? t('geo.atProject')
    : t('geo.atSite');
  const exitTitle = isProject
    ? t('geo.leavingProject')
    : isLocation
      ? t('geo.leavingLocation')
      : t('geo.leavingSite');

  const enterBody = isProject
    ? t('geo.startProjectQ')
    : isLocation
      ? t('geo.startLocationQ')
      : t('geo.startJobQ');
  const exitBody = isProject
    ? t('geo.endProjectQ')
    : isLocation
      ? t('geo.endLocationQ')
      : t('geo.endJobQ');

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
      style={{
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)',
      }}
    >
      <div className="w-full max-w-sm bg-card rounded-2xl shadow-2xl border overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        <div className={cn(
          "px-5 py-4 flex items-center gap-3",
          isEnter
            ? "bg-gradient-to-r from-primary to-primary/80"
            : "bg-gradient-to-r from-amber-500 to-amber-500/80"
        )}>
          <div className="p-2 rounded-full bg-white/20">
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-white font-semibold text-sm">
              {isEnter ? enterTitle : exitTitle}
            </p>
            <p className="text-white/80 text-xs">
              {t('geo.distanceFrom', { dist: event.distance, label })}
            </p>
          </div>
          <button
            onClick={onDismiss}
            className="p-1 rounded-full hover:bg-white/20 transition-colors"
            aria-label={t('geo.dismiss')}
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <h3 className="font-bold text-foreground">{label}</h3>
            {!isLocation && !isProject && event.booking?.booking_number && (
              <p className="text-xs text-muted-foreground font-mono">#{event.booking.booking_number}</p>
            )}
            {!isLocation && !isProject && event.booking?.deliveryaddress && (
              <p className="text-sm text-muted-foreground mt-1">{event.booking.deliveryaddress}</p>
            )}
            {isProject && event.largeProjectAddress && (
              <p className="text-sm text-muted-foreground mt-1">{event.largeProjectAddress}</p>
            )}
            {isLocation && event.locationAddress && (
              <p className="text-sm text-muted-foreground mt-1">{event.locationAddress}</p>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            {isEnter ? enterBody : exitBody}
          </p>

          {showArrivalCorrection && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {t('geo.gpsArrived', { time: arrivalTimeStr, since: formatTimeSince(timeSinceArrival) })}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {showArrivalCorrection && (
              <Button
                className="w-full gap-2 bg-amber-500 hover:bg-amber-600 text-white"
                onClick={() => onConfirm(arrivalDate!.toISOString())}
              >
                <Clock className="w-4 h-4" />
                {t('geo.startFromTime', { time: arrivalTimeStr })}
              </Button>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={onDismiss}
              >
                {t('geo.notNow')}
              </Button>
              <Button
                className={cn(
                  "flex-1 gap-2",
                  isEnter
                    ? "bg-primary hover:bg-primary/90"
                    : "bg-amber-500 hover:bg-amber-600"
                )}
                onClick={() => onConfirm()}
              >
                {isEnter ? (
                  <>
                    <Play className="w-4 h-4" />
                    {t('geo.startNow')}
                  </>
                ) : (
                  <>
                    <Square className="w-4 h-4" />
                    {t('geo.end')}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeofencePrompt;
