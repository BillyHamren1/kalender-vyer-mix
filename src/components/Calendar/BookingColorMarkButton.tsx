import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Palette, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { BOOKING_COLOR_PRESETS, setBookingCalendarColor } from '@/services/bookingColorService';

interface BookingColorMarkButtonProps {
  bookingId: string;
  currentColor?: string | null;
  onChanged?: () => void;
}

/**
 * Liten paletten-knapp som visas i hörnet av ett kalenderkort. Klick öppnar
 * en popover där användaren kan välja Transport (blå), Endast uthyrning
 * (orange), valfri färg eller rensa märkningen.
 */
export const BookingColorMarkButton: React.FC<BookingColorMarkButtonProps> = ({
  bookingId,
  currentColor,
  onChanged,
}) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customColor, setCustomColor] = useState<string>(
    currentColor && currentColor.startsWith('#') ? currentColor : '#A7F3D0',
  );

  const apply = async (color: string | null) => {
    try {
      setSaving(true);
      await setBookingCalendarColor(bookingId, color);
      toast.success(color ? 'Färgmärkning uppdaterad' : 'Färgmärkning borttagen');
      setOpen(false);
      onChanged?.();
    } catch (err: any) {
      console.error('[BookingColorMarkButton] Failed:', err);
      toast.error(err?.message || 'Kunde inte spara färg');
    } finally {
      setSaving(false);
    }
  };

  const stop = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={stop}
          onMouseDown={stop}
          onDoubleClick={stop}
          className="absolute top-0.5 right-0.5 z-20 p-0.5 rounded bg-background/80 hover:bg-background border border-border/60 shadow-sm transition-colors"
          title="Märk kortets färg"
          aria-label="Märk kortets färg"
        >
          <Palette className="h-3 w-3 text-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-3 space-y-2"
        align="end"
        onClick={stop}
        onMouseDown={stop}
        onDoubleClick={stop}
      >
        <div className="text-xs font-semibold text-foreground mb-1">Färgmärkning</div>

        <button
          type="button"
          disabled={saving}
          onClick={() => apply(BOOKING_COLOR_PRESETS.transport.hex)}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-sm transition-colors"
        >
          <span
            className="h-4 w-4 rounded border border-border"
            style={{ backgroundColor: BOOKING_COLOR_PRESETS.transport.hex }}
          />
          <span className="flex-1 text-left">{BOOKING_COLOR_PRESETS.transport.label}</span>
          {currentColor === BOOKING_COLOR_PRESETS.transport.hex && <Check className="h-3 w-3" />}
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={() => apply(BOOKING_COLOR_PRESETS.rental.hex)}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-sm transition-colors"
        >
          <span
            className="h-4 w-4 rounded border border-border"
            style={{ backgroundColor: BOOKING_COLOR_PRESETS.rental.hex }}
          />
          <span className="flex-1 text-left">{BOOKING_COLOR_PRESETS.rental.label}</span>
          {currentColor === BOOKING_COLOR_PRESETS.rental.hex && <Check className="h-3 w-3" />}
        </button>

        <div className="pt-2 border-t border-border">
          <label className="text-[11px] text-muted-foreground block mb-1">Valfri färg</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              className="h-7 w-10 rounded border border-border cursor-pointer"
              onClick={stop}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={saving}
              onClick={() => apply(customColor)}
              className="flex-1"
            >
              Använd
            </Button>
          </div>
        </div>

        {currentColor && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={() => apply(null)}
            className="w-full text-destructive hover:text-destructive"
          >
            <X className="h-3 w-3 mr-1" /> Ta bort färg
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default BookingColorMarkButton;
