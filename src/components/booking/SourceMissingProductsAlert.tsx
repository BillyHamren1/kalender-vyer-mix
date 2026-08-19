import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface SourceMissingRow {
  id: string;
  name: string;
  quantity: number | null;
  source_missing_since: string | null;
}

interface SourceMissingProductsAlertProps {
  bookingId: string;
}

/**
 * Visar produkter som saknas i Bookings produktlista men som inte fick raderas
 * automatiskt (Booking skickar inte `products_complete`). Utan denna vy blir
 * blockerade borttagningar osynliga och planeringen visar produkter som inte
 * längre är beställda.
 */
export const SourceMissingProductsAlert: React.FC<SourceMissingProductsAlertProps> = ({ bookingId }) => {
  const queryClient = useQueryClient();

  const { data: rows = [] } = useQuery({
    queryKey: ['booking-source-missing-products', bookingId],
    enabled: Boolean(bookingId),
    queryFn: async (): Promise<SourceMissingRow[]> => {
      const { data, error } = await supabase
        .from('booking_products')
        .select('id, name, quantity, source_missing_since')
        .eq('booking_id', bookingId)
        .not('source_missing_since', 'is', null)
        .order('name');
      if (error) throw error;
      return (data ?? []) as SourceMissingRow[];
    },
  });

  if (rows.length === 0) return null;

  const removeLocally = async (row: SourceMissingRow) => {
    const { error } = await supabase.from('booking_products').delete().eq('id', row.id);
    if (error) {
      toast.error('Kunde inte ta bort produkten');
      return;
    }
    toast.success(`${row.name} borttagen lokalt`);
    queryClient.invalidateQueries({ queryKey: ['booking-source-missing-products', bookingId] });
    queryClient.invalidateQueries({ queryKey: ['booking', bookingId] });
    queryClient.invalidateQueries({ queryKey: ['bookings'] });
  };

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Produkter saknas i Booking men ligger kvar här</AlertTitle>
      <AlertDescription className="space-y-2">
        <p className="text-sm">
          Booking skickar inte fältet <code>products_complete</code>, därför tas produkter aldrig bort automatiskt.
          Kontrollera mot Booking och ta bort manuellt om de verkligen är strukna.
        </p>
        <ul className="space-y-1">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-2 rounded-md border border-destructive/30 px-2 py-1">
              <span className="text-sm">
                {row.name}
                {row.quantity ? ` · ${row.quantity} st` : ''}
              </span>
              <Button size="sm" variant="outline" onClick={() => removeLocally(row)}>
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Ta bort lokalt
              </Button>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
};

export default SourceMissingProductsAlert;
