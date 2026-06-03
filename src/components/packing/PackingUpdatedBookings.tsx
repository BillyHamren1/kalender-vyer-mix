import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Calendar, ChevronRight, ChevronDown, CheckCircle2, ArrowUpRight, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import BookingChangesDetail from '@/components/booking/BookingChangesDetail';

const PackingUpdatedBookings: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: packings = [], isLoading } = useQuery({
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
    onError: () => {
      toast.error('Kunde inte godkänna ändringen');
    },
  });

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), 'd MMM yyyy', { locale: sv });
    } catch {
      return dateStr;
    }
  };

  if (isLoading || packings.length === 0) return null;

  return (
    <div
      className="relative rounded-2xl overflow-hidden ring-2 ring-amber-400/40 mb-4"
      style={{
        background: 'linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--card) / 0.95) 100%)',
        boxShadow: '0 4px 24px -4px rgba(217, 119, 6, 0.15), 0 0 0 1px hsl(var(--border) / 0.5)',
      }}
    >
      <div className="h-2 bg-gradient-to-r from-amber-400/70 via-amber-500 to-orange-400/70" />

      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-amber-500/15 to-orange-500/5 ring-1 ring-amber-500/20">
              <RefreshCw className="h-5 w-5 text-amber-600" />
              <Sparkles className="absolute -top-1 -right-1 h-3.5 w-3.5 text-amber-500" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-foreground">Uppdaterade packningar</h3>
              <p className="text-xs text-amber-700 font-medium">Kräver granskning</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
            </span>
            <Badge variant="secondary" className="h-7 px-3 text-sm font-semibold bg-amber-100 text-amber-900 hover:bg-amber-100 border border-amber-300/50">
              {packings.length} uppdaterade
            </Badge>
          </div>
        </div>

        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {packings.map(packing => {
            const isExpanded = expandedId === packing.id;
            const reasonLabel = packing.needs_packing_review_reason === 'cancelled' ? 'Avbokad' : 'Ändrad';
            return (
              <div
                key={packing.id}
                className="group relative rounded-xl border border-amber-200/50 bg-gradient-to-br from-background to-amber-50/20 hover:shadow-sm transition-all duration-200 hover:border-amber-300/60"
              >
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : packing.id)}
                  >
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm leading-tight truncate group-hover:text-primary transition-colors text-foreground">
                        {packing.client_name || packing.name}
                      </h4>
                      <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-medium shrink-0 border-amber-300 text-amber-700 bg-amber-50">
                        {reasonLabel}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span className="truncate">{packing.name}</span>
                      {packing.start_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-muted-foreground/60" />
                          {formatDate(packing.start_date)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {packing.booking_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setExpandedId(isExpanded ? null : packing.id)}
                        className="gap-1 h-7 px-2 text-xs rounded-lg border-amber-200/60 hover:border-amber-300 hover:bg-amber-50"
                      >
                        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        Visa
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => approveMutation.mutate(packing.id)}
                      disabled={approveMutation.isPending}
                      className="gap-1 h-7 px-2 text-xs rounded-lg border-green-200/60 text-green-700 hover:border-green-300 hover:bg-green-50"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      Godkänn
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/warehouse/packing/${packing.id}`)}
                      className="h-7 w-7 p-0 rounded-lg text-muted-foreground/40 hover:text-muted-foreground"
                      title="Öppna packning"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {isExpanded && packing.booking_id && (
                  <div className="px-3 pb-3 border-t border-amber-100/50">
                    <BookingChangesDetail bookingId={packing.booking_id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PackingUpdatedBookings;
