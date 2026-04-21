import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { XCircle, EyeOff, ArrowUpRight, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';

interface CancelledProject {
  id: string;
  name: string;
  booking_id: string | null;
  client: string | null;
  eventDate: string | null;
  bookingNumber: string | null;
  type: 'project' | 'job';
}

const DashboardCancelledBookings: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: cancelled = [], isLoading } = useQuery({
    queryKey: ['cancelled-projects'],
    queryFn: async (): Promise<CancelledProject[]> => {
      // Fetch cancelled projects
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name, booking_id, bookings(client, eventdate, booking_number)')
        .eq('status', 'cancelled')
        .order('updated_at', { ascending: false });

      // Fetch cancelled jobs
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, name, booking_id, bookings(client, eventdate, booking_number)')
        .eq('status', 'cancelled')
        .order('updated_at', { ascending: false });

      const items: CancelledProject[] = [];

      for (const p of projects || []) {
        const b = p.bookings as any;
        items.push({
          id: p.id,
          name: p.name,
          booking_id: p.booking_id,
          client: b?.client || null,
          eventDate: b?.eventdate || null,
          bookingNumber: b?.booking_number || null,
          type: 'project',
        });
      }

      for (const j of jobs || []) {
        const b = j.bookings as any;
        items.push({
          id: j.id,
          name: j.name,
          booking_id: j.booking_id,
          client: b?.client || null,
          eventDate: b?.eventdate || null,
          bookingNumber: b?.booking_number || null,
          type: 'job',
        });
      }

      return items;
    },
  });

  const hideMutation = useMutation({
    mutationFn: async (item: CancelledProject) => {
      // Mark booking as manually-hidden cancelled so it stays out of the inbox
      if (item.booking_id) {
        await supabase
          .from('bookings')
          .update({
            assigned_to_project: true,
            assigned_project_id: null,
            assigned_project_name: null,
          })
          .eq('id', item.booking_id);
      }
      // Audit
      await (supabase.from('project_audit_log') as any).insert({
        project_id: item.id,
        project_type: item.type === 'job' ? 'small' : 'medium',
        action: 'hide_cancelled',
        booking_id: item.booking_id,
        details: { name: item.name },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cancelled-projects'] });
      queryClient.invalidateQueries({ queryKey: ['bookings-without-project'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Avbokat projekt dolt — historiken finns kvar');
    },
    onError: () => {
      toast.error('Kunde inte dölja projektet');
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

  if (isLoading || cancelled.length === 0) return null;

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--card) / 0.95) 100%)',
        boxShadow: '0 4px 24px -4px rgba(0, 0, 0, 0.08), 0 0 0 1px hsl(var(--border) / 0.5)',
      }}
    >
      <div className="h-1.5 bg-gradient-to-r from-red-400/60 via-red-500 to-red-400/60" />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-red-500/15 to-red-500/5 ring-1 ring-red-500/20">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-foreground">Avbokade projekt</h3>
              <p className="text-xs text-muted-foreground">Dölj manuellt när du hanterat avbokningen</p>
            </div>
          </div>
          <Badge
            variant="secondary"
            className="h-7 px-3 text-sm font-medium bg-red-100 text-red-800 hover:bg-red-100"
          >
            {cancelled.length} avbokade
          </Badge>
        </div>

        {/* List */}
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {cancelled.map(item => (
            <div
              key={`${item.type}-${item.id}`}
              className="group relative rounded-xl border border-red-200/60 bg-gradient-to-br from-red-50/40 to-red-100/20 dark:from-red-950/20 dark:to-red-900/10 dark:border-red-800/30"
            >
              <div className="flex items-center gap-3 px-3 py-2.5">
                {/* Left: info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-sm text-red-800 dark:text-red-300 leading-tight truncate">
                      {item.client || item.name}
                    </h4>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-red-300 text-red-600 dark:border-red-700 dark:text-red-400 shrink-0">
                      Avbokad
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    {item.bookingNumber && (
                      <Badge variant="outline" className="text-xs shrink-0 font-mono h-5 px-1.5">
                        #{item.bookingNumber}
                      </Badge>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-muted-foreground/60" />
                      {formatDate(item.eventDate)}
                    </span>
                  </div>
                </div>

                {/* Right: actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => hideMutation.mutate(item)}
                    disabled={hideMutation.isPending}
                    className="gap-1 h-7 px-2.5 text-xs rounded-lg"
                  >
                    <EyeOff className="w-3 h-3" />
                    Dölj
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(item.type === 'job' ? `/jobs/${item.id}` : `/projects/${item.id}`)}
                    className="h-7 w-7 p-0 rounded-lg text-muted-foreground/40 hover:text-muted-foreground"
                    title="Öppna"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardCancelledBookings;
