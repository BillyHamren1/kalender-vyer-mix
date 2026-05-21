import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, ExternalLink, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { formatHoursMinutes } from '@/utils/formatHours';
import { formatStockholmHm } from '@/lib/staff/formatStockholmTime';

interface PendingRow {
  id: string;
  staff_id: string;
  staff_name: string;
  staff_color: string | null;
  report_date: string;
  start_time: string | null;
  end_time: string | null;
  hours_worked: number;
  break_time: number | null;
  description: string | null;
  booking_id: string | null;
  large_project_id: string | null;
  location_id: string | null;
  target_label: string;
  created_at: string;
}

async function fetchPending(): Promise<PendingRow[]> {
  const [trRes, staffRes, bRes, lpRes, locRes] = await Promise.all([
    supabase
      .from('time_reports')
      .select(
        'id, staff_id, report_date, start_time, end_time, hours_worked, break_time, description, booking_id, large_project_id, location_id, created_at, end_time, is_subdivision',
      )
      .eq('approved', false)
      .not('end_time', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('staff_members').select('id, name, color'),
    supabase.from('bookings').select('id, client, booking_number'),
    supabase.from('large_projects').select('id, name, project_number').limit(1000),
    supabase.from('organization_locations').select('id, name').limit(1000),
  ]);

  const staffById = new Map<string, any>((staffRes.data || []).map((s: any) => [s.id, s]));
  const bookings = new Map<string, any>((bRes.data || []).map((b: any) => [b.id, b]));
  const lps = new Map<string, any>((lpRes.data || []).map((p: any) => [p.id, p]));
  const locs = new Map<string, any>((locRes.data || []).map((l: any) => [l.id, l]));

  return ((trRes.data || []) as any[])
    .filter((r) => !r.is_subdivision)
    .map((r): PendingRow => {
      const staff = staffById.get(r.staff_id);
      let target_label = 'Okänt';
      if (r.booking_id && bookings.has(r.booking_id)) {
        const b = bookings.get(r.booking_id);
        target_label = b.client || b.booking_number || 'Bokning';
      } else if (r.large_project_id && lps.has(r.large_project_id)) {
        const p = lps.get(r.large_project_id);
        target_label = p.name || p.project_number || 'Stort projekt';
      } else if (r.location_id && locs.has(r.location_id)) {
        target_label = locs.get(r.location_id).name || 'Plats';
      }
      return {
        id: r.id,
        staff_id: r.staff_id,
        staff_name: staff?.name || 'Okänd',
        staff_color: staff?.color ?? null,
        report_date: r.report_date,
        start_time: r.start_time ?? null,
        end_time: r.end_time ?? null,
        hours_worked: Number(r.hours_worked || 0),
        break_time: r.break_time != null ? Number(r.break_time) : null,
        description: r.description ?? null,
        booking_id: r.booking_id ?? null,
        large_project_id: r.large_project_id ?? null,
        location_id: r.location_id ?? null,
        target_label,
        created_at: r.created_at,
      };
    });
}

async function reviewerName(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  return data.user?.email || data.user?.id || 'admin';
}

export const PendingApprovalsTab = () => {
  const qc = useQueryClient();

  useRealtimeInvalidation({
    channelName: 'time-reports-pending',
    tables: ['time_reports'],
    queryKeys: [['time-reports-pending']],
    debounceMs: 500,
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['time-reports-pending'],
    queryFn: fetchPending,
    refetchInterval: 60_000,
  });

  const [cursor, setCursor] = useState(0);

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const name = await reviewerName();
      const { error } = await supabase
        .from('time_reports')
        .update({
          approved: true,
          approved_at: new Date().toISOString(),
          approved_by: name,
          rejected_at: null,
          rejected_by: null,
          rejection_comment: null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Rapport godkänd');
      qc.invalidateQueries({ queryKey: ['time-reports-pending'] });
    },
    onError: () => toast.error('Kunde inte godkänna'),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const name = await reviewerName();
      const { error } = await supabase
        .from('time_reports')
        .update({
          approved: false,
          rejected_at: new Date().toISOString(),
          rejected_by: name,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Rapport avvisad');
      qc.invalidateQueries({ queryKey: ['time-reports-pending'] });
    },
    onError: () => toast.error('Kunde inte avvisa'),
  });

  const total = rows.length;
  const totalHours = useMemo(() => rows.reduce((s, r) => s + r.hours_worked, 0), [rows]);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground p-4">Laddar väntande rapporter…</div>;
  }

  if (total === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="text-sm text-muted-foreground">Inga rapporter väntar på attest. 🎉</div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-muted-foreground">
          {total} rapporter väntar · totalt {formatHoursMinutes(totalHours)}
        </div>
        <Link
          to="/staff-management/time-approvals"
          className="text-sm text-primary hover:underline inline-flex items-center gap-1"
        >
          Full attestvy <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      <div className="space-y-2">
        {rows.map((row, idx) => (
          <PendingCard
            key={row.id}
            row={row}
            highlighted={idx === cursor}
            onApprove={() => {
              approveMutation.mutate(row.id);
              setCursor((c) => Math.min(c + 1, rows.length - 1));
            }}
            onApproveAndNext={() => {
              approveMutation.mutate(row.id);
              setCursor((c) => Math.min(c + 1, rows.length - 1));
            }}
            onReject={() => rejectMutation.mutate(row.id)}
            disabled={approveMutation.isPending || rejectMutation.isPending}
          />
        ))}
      </div>
    </div>
  );
};

interface PendingCardProps {
  row: PendingRow;
  highlighted: boolean;
  onApprove: () => void;
  onApproveAndNext: () => void;
  onReject: () => void;
  disabled: boolean;
}

const PendingCard = ({ row, highlighted, onApprove, onApproveAndNext, onReject, disabled }: PendingCardProps) => {
  const date = new Date(row.report_date + 'T00:00:00');
  const dayLabel = format(date, 'EEE d MMM', { locale: sv });
  const startStr = row.start_time ? row.start_time.slice(0, 5) : '—';
  const endStr = row.end_time ? row.end_time.slice(0, 5) : '—';
  const submitted = formatStockholmHm(row.created_at);

  return (
    <Card className={`p-4 ${highlighted ? 'ring-1 ring-primary/40' : ''}`}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-[200px]">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: row.staff_color || 'hsl(var(--muted-foreground))' }}
          />
          <div>
            <div className="text-sm font-medium">{row.staff_name}</div>
            <div className="text-xs text-muted-foreground capitalize">
              {dayLabel} · {row.target_label}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm font-mono tabular-nums">
          <span>{startStr} → {endStr}</span>
          {row.break_time != null && row.break_time > 0 && (
            <span className="text-muted-foreground">rast {Math.round(row.break_time)} min</span>
          )}
          <Badge variant="secondary">{formatHoursMinutes(row.hours_worked)}</Badge>
        </div>

        <div className="flex-1 min-w-[160px] text-sm text-muted-foreground truncate">
          {row.description || <span className="italic">ingen beskrivning</span>}
        </div>

        <div className="text-[11px] text-muted-foreground/80 whitespace-nowrap">
          inlämnad {submitted}
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <Link
            to={`/staff-management/time-reports/${row.staff_id}/${row.report_date}`}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-border hover:bg-accent text-muted-foreground"
            title="Öppna dagsvy"
          >
            <ExternalLink className="w-4 h-4" />
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={onReject}
            disabled={disabled}
            className="text-destructive hover:text-destructive"
          >
            <X className="w-4 h-4 mr-1" />Avvisa
          </Button>
          <Button size="sm" onClick={onApprove} disabled={disabled}>
            <Check className="w-4 h-4 mr-1" />Godkänn
          </Button>
          <Button size="sm" variant="secondary" onClick={onApproveAndNext} disabled={disabled} title="Godkänn + nästa">
            <Check className="w-4 h-4" />
            <ChevronRight className="w-4 h-4 -ml-1" />
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default PendingApprovalsTab;
