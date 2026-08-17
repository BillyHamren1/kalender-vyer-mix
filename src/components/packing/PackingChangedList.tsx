import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import BookingChangesDetail from '@/components/booking/BookingChangesDetail';

/**
 * Kompakt lista över packningar som ändrats och behöver granskas.
 * Samma query/mutation som tidigare PackingUpdatedBookings — ingen logikändring,
 * endast presentation inuti "Kräver åtgärd".
 */
export const useChangedPackings = () =>
  useQuery({
    queryKey: ['packing-needs-review'],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const horizon = new Date(today);
      horizon.setDate(horizon.getDate() + 21);
      const toIso = (d: Date) => d.toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from('packing_projects')
        .select('id, name, booking_id, client_name, start_date, needs_packing_review_reason')
        .eq('needs_packing_review', true)
        .not('start_date', 'is', null)
        .gte('start_date', toIso(today))
        .lte('start_date', toIso(horizon))
        .order('start_date', { ascending: true });

      if (error) {
        console.error('Error fetching updated packings:', error);
        return [];
      }
      return data || [];
    },
    placeholderData: [],
  });

interface Props {
  limit?: number;
  onShowAll?: () => void;
}

const PackingChangedList: React.FC<Props> = ({ limit = 5, onShowAll }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: packings = [] } = useChangedPackings();

  const approveMutation = useMutation({
    mutationFn: async (packingId: string) => {
      const { error } = await supabase
        .from('packing_projects')
        .update({ needs_packing_review: false, needs_packing_review_reason: null })
        .eq('id', packingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packing-needs-review'] });
      queryClient.invalidateQueries({ queryKey: ['packings'] });
      toast.success('Ändring godkänd');
    },
    onError: () => toast.error('Kunde inte godkänna ändringen'),
  });

  if (packings.length === 0) {
    return <p className="text-sm text-muted-foreground py-3">Inga ändrade packningar.</p>;
  }

  const visible = packings.slice(0, limit);

  return (
    <div className="divide-y divide-border/30">
      {visible.map(packing => {
        const isExpanded = expandedId === packing.id;
        const reasonLabel = packing.needs_packing_review_reason === 'cancelled' ? 'Avbokad' : 'Ordern har ändrats';
        return (
          <div key={packing.id}>
            <div className="flex items-center gap-3 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate text-foreground">
                    {packing.client_name || packing.name}
                  </span>
                  <Badge variant="outline" className="h-4 px-1.5 text-[10px] shrink-0 border-amber-300 text-amber-700">
                    {reasonLabel}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {packing.name}
                  {packing.start_date && ` · ${format(new Date(packing.start_date), 'd MMM', { locale: sv })}`}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {packing.booking_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs rounded-lg gap-1"
                    onClick={() => setExpandedId(isExpanded ? null : packing.id)}
                  >
                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    Granska
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={approveMutation.isPending}
                  className="h-7 px-2 text-xs rounded-lg gap-1 text-green-700 border-green-200/60 hover:bg-green-50"
                  onClick={() => approveMutation.mutate(packing.id)}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  Godkänn
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => navigate(`/warehouse/packing/${packing.id}`)}
                >
                  Öppna
                </Button>
              </div>
            </div>
            {isExpanded && packing.booking_id && (
              <div className="pb-3">
                <BookingChangesDetail bookingId={packing.booking_id} />
              </div>
            )}
          </div>
        );
      })}
      {packings.length > visible.length && (
        <button
          className="w-full text-left py-2 text-xs font-medium text-primary hover:underline"
          onClick={onShowAll}
        >
          Visa alla {packings.length} →
        </button>
      )}
    </div>
  );
};

export default PackingChangedList;
