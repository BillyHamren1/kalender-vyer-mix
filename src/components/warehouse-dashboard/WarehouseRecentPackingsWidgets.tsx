import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, CalendarClock, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

interface PackingItem {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  createdAt: string;
  eventDate: string | null;
  projectNumber: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  planning: 'Planering',
  in_progress: 'Pågående',
  completed: 'Klar',
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  planning: 'bg-blue-500/15 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-500/15 text-amber-700 border-amber-200',
  completed: 'bg-emerald-500/15 text-emerald-700 border-emerald-200',
};

const WarehouseRecentPackingsWidgets = () => {
  const navigate = useNavigate();

  const { data: packings = [], isLoading } = useQuery({
    queryKey: ['warehouse-recent-packings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('packing_projects')
        .select('id, name, status, created_at, updated_at, booking_id, warehouse_project_id')
        .order('updated_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      const rows = data || [];
      const bookingIds = Array.from(new Set(rows.map(r => r.booking_id).filter(Boolean))) as string[];
      const wpIds = Array.from(new Set(rows.map(r => r.warehouse_project_id).filter(Boolean))) as string[];

      const [bookingsRes, wpsRes] = await Promise.all([
        bookingIds.length
          ? supabase.from('bookings').select('id, eventdate').in('id', bookingIds)
          : Promise.resolve({ data: [], error: null } as any),
        wpIds.length
          ? supabase.from('warehouse_projects').select('id, project_number').in('id', wpIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      const bookingMap = new Map((bookingsRes.data || []).map((b: any) => [b.id, b.eventdate]));
      const wpMap = new Map((wpsRes.data || []).map((w: any) => [w.id, w.project_number]));

      return rows.map(p => ({
        id: p.id,
        name: p.name,
        status: p.status,
        updatedAt: p.updated_at,
        createdAt: p.created_at,
        eventDate: p.booking_id ? (bookingMap.get(p.booking_id) as string | null) ?? null : null,
        projectNumber: p.warehouse_project_id ? (wpMap.get(p.warehouse_project_id) as string | null) ?? null : null,
      })) as PackingItem[];
    },
  });

  const recentlyCreated = useMemo(() =>
    [...packings].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5),
    [packings]
  );

  const recentlyUpdated = useMemo(() =>
    [...packings].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 6),
    [packings]
  );

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    try { return format(new Date(dateStr), 'd MMM', { locale: sv }); } catch { return '—'; }
  };

  const PackingRow = ({ item }: { item: PackingItem }) => (
    <div
      onClick={() => navigate(`/warehouse/packing/${item.id}`)}
      className="flex items-center justify-between py-2.5 px-1 cursor-pointer hover:bg-muted/40 rounded-md transition-colors group"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-medium shrink-0 ${STATUS_BADGE_CLASSES[item.status] || ''}`}>
          {STATUS_LABELS[item.status] || item.status}
        </Badge>
        <p className="text-sm font-medium truncate">
          {item.name}
          {item.projectNumber && (
            <span className="ml-2 text-xs text-muted-foreground font-normal">{item.projectNumber}</span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-muted-foreground">{formatDate(item.eventDate)}</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card><CardContent className="p-5"><Skeleton className="h-48 w-full" /></CardContent></Card>
        <Card><CardContent className="p-5"><Skeleton className="h-48 w-full" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Senast skapade packningar</h3>
          </div>
          <div className="divide-y divide-border/50">
            {recentlyCreated.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Inga packningar ännu</p>
            ) : recentlyCreated.map(item => <PackingRow key={`created-${item.id}`} item={item} />)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Senast uppdaterade packningar</h3>
          </div>
          <div className="divide-y divide-border/50">
            {recentlyUpdated.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Inga uppdaterade packningar</p>
            ) : recentlyUpdated.map(item => <PackingRow key={`updated-${item.id}`} item={item} />)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WarehouseRecentPackingsWidgets;
