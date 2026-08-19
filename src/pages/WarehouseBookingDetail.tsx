import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ClipboardCheck, Package, ShieldCheck, Warehouse } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import BookingInfoExpanded from '@/components/project/BookingInfoExpanded';
import ManualPackingChecklist from '@/components/packing/ManualPackingChecklist';
import PackingIntegrityBanner from '@/components/packing/PackingIntegrityBanner';
import PackingPreflightPanel from '@/components/scanner/PackingPreflightPanel';
import WarehouseBookingQuickOpen from '@/components/warehouse/WarehouseBookingQuickOpen';
import { usePackingList } from '@/hooks/usePackingList';
import { PACKING_STATUS_COLORS, PACKING_STATUS_LABELS, type PackingStatus } from '@/types/packing';
import { cn } from '@/lib/utils';

const BOOKING_SELECT = 'id, booking_number, client, title, status, eventdate, rigdaydate, rigdowndate, deliveryaddress, delivery_city, delivery_postal_code, contact_name, contact_phone, contact_email, carry_more_than_10m, ground_nails_allowed, exact_time_needed, exact_time_info, rental_only, internalnotes, rig_start_time, rig_end_time, event_start_time, event_end_time, rigdown_start_time, rigdown_end_time';

const WarehouseBookingDetail = () => {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();

  const { data: booking, isLoading: bookingLoading } = useQuery({
    queryKey: ['warehouse-booking-detail', bookingId],
    enabled: Boolean(bookingId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(BOOKING_SELECT)
        .eq('id', bookingId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: packings = [], isLoading: packingsLoading } = useQuery({
    queryKey: ['warehouse-booking-packings', bookingId],
    enabled: Boolean(bookingId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('packing_projects')
        .select('*')
        .eq('booking_id', bookingId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const activePacking = useMemo(() => {
    return packings.find((packing) => packing.status !== 'cancelled' && packing.status !== 'completed')
      || packings.find((packing) => packing.status !== 'cancelled')
      || packings[0]
      || null;
  }, [packings]);

  const nonCancelledPackings = useMemo(
    () => packings.filter((packing) => packing.status !== 'cancelled'),
    [packings],
  );

  const {
    items,
    integrity,
    integrityError,
    isLoading: packingListLoading,
    refetchItems,
  } = usePackingList(activePacking?.id || '');

  const { data: tasks = [] } = useQuery({
    queryKey: ['packing-tasks', activePacking?.id],
    enabled: Boolean(activePacking?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('packing_tasks')
        .select('id, completed')
        .eq('packing_id', activePacking!.id);
      if (error) throw error;
      return data || [];
    },
  });

  const packingProgress = useMemo(() => {
    const activeRows = items.filter((item) => !item.excluded);
    const total = activeRows.reduce((sum, item) => sum + Number(item.quantity_to_pack || 0), 0);
    const packed = activeRows.reduce(
      (sum, item) => sum + Math.min(Number(item.quantity_packed || 0), Number(item.quantity_to_pack || 0)),
      0,
    );
    return {
      total,
      packed,
      percent: total > 0 ? Math.round((packed / total) * 100) : 0,
    };
  }, [items]);

  const completedTasks = tasks.filter((task) => task.completed).length;
  const isLoading = bookingLoading || packingsLoading;

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto" style={{ background: 'var(--gradient-page)' }}>
        <div className="max-w-[1280px] mx-auto p-6 space-y-4">
          <div className="h-10 w-56 rounded-lg bg-muted animate-pulse" />
          <div className="h-32 rounded-2xl bg-card border border-border/50 animate-pulse" />
          <div className="h-72 rounded-2xl bg-card border border-border/50 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="h-full overflow-y-auto" style={{ background: 'var(--gradient-page)' }}>
        <div className="max-w-[900px] mx-auto p-6">
          <Card className="rounded-2xl border-border/60">
            <CardContent className="py-12 text-center">
              <Warehouse className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <h1 className="text-lg font-semibold">Bokningen kunde inte hittas</h1>
              <Button variant="outline" className="mt-4" onClick={() => navigate('/warehouse')}>Till lageröversikten</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const packingStatus = activePacking?.status as PackingStatus | undefined;
  const controlDone = activePacking?.control_status === 'completed';

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--gradient-page)' }}>
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="min-w-0">
            <Button variant="ghost" size="sm" className="-ml-2 mb-1" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Tillbaka
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <div className="h-10 w-10 rounded-xl bg-warehouse/10 flex items-center justify-center shrink-0">
                <Warehouse className="h-5 w-5 text-warehouse" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold text-[hsl(var(--heading))]">
                    {booking.booking_number || 'Bokning'}
                  </h1>
                  {booking.status && <Badge variant="outline">{booking.status}</Badge>}
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {booking.client}{booking.title ? ` · ${booking.title}` : ''}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {activePacking ? (
              <Button onClick={() => navigate(`/warehouse/packing/${activePacking.id}`)} className="bg-warehouse hover:bg-warehouse-hover">
                <Package className="h-4 w-4 mr-2" /> Öppna packlista
              </Button>
            ) : (
              <Button variant="outline" onClick={() => navigate('/warehouse/packing')}>
                <Package className="h-4 w-4 mr-2" /> Till packning
              </Button>
            )}
          </div>
        </div>

        <WarehouseBookingQuickOpen compact />

        {nonCancelledPackings.length > 1 && (
          <div className="rounded-2xl border-2 border-destructive/45 bg-destructive/5 p-4">
            <div className="flex items-start gap-3">
              <Package className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-destructive">Flera aktiva packlistor är kopplade till samma bokning</h2>
                <p className="text-xs text-destructive/85 mt-1">
                  Detta är en avvikelse som måste redas ut innan lagret betraktar en packlista som den enda operativa sanningen.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {nonCancelledPackings.map((packing) => (
                    <Button key={packing.id} variant="outline" size="sm" onClick={() => navigate(`/warehouse/packing/${packing.id}`)}>
                      {packing.name} · {PACKING_STATUS_LABELS[packing.status as PackingStatus] || packing.status}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {!activePacking ? (
          <div className="rounded-2xl border-2 border-amber-300/60 bg-amber-50/70 dark:bg-amber-950/20 p-5">
            <h2 className="font-semibold text-amber-900 dark:text-amber-200">Ingen packlista är kopplad till bokningen</h2>
            <p className="text-sm text-amber-800/90 dark:text-amber-200/80 mt-1">
              Bokningsinformationen går att läsa här, men lagerarbetet ska inte startas förrän ett packningsprojekt har skapats via det ordinarie packningsflödet.
            </p>
          </div>
        ) : (
          <>
            <section className="rounded-2xl border-2 border-warehouse/25 bg-card p-5 sm:p-6 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Att göra nu</p>
                  <h2 className="text-xl font-bold text-[hsl(var(--heading))] mt-1">Packa {booking.booking_number || booking.title || booking.client}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {packingListLoading ? 'Kontrollerar packlistan…' : `${packingProgress.packed} av ${packingProgress.total} packade · ${packingProgress.percent}% klart`}
                  </p>
                  <div className="h-2 rounded-full bg-muted overflow-hidden mt-3 max-w-xl">
                    <div className="h-full bg-warehouse transition-all" style={{ width: `${Math.min(100, packingProgress.percent)}%` }} />
                  </div>
                </div>
                <Button size="lg" onClick={() => navigate(`/warehouse/packing/${activePacking.id}`)} className="bg-warehouse hover:bg-warehouse-hover font-bold shrink-0">
                  <Package className="h-5 w-5 mr-2" /> Öppna packlista
                </Button>
              </div>
            </section>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatusCard
                icon={Package}
                label="Packstatus"
                value={packingStatus ? PACKING_STATUS_LABELS[packingStatus] : activePacking.status}
                badgeClass={packingStatus ? PACKING_STATUS_COLORS[packingStatus] : undefined}
              />
              <StatusCard
                icon={ClipboardCheck}
                label="Packat"
                value={packingListLoading ? 'Kontrollerar…' : `${packingProgress.packed}/${packingProgress.total} st · ${packingProgress.percent}%`}
              />
              <StatusCard
                icon={ShieldCheck}
                label="Kontrollräkning"
                value={controlDone ? 'Godkänd' : activePacking.control_status === 'in_progress' ? 'Pågår' : 'Inte klar'}
                positive={controlDone}
              />
              <StatusCard
                icon={CheckCircle2}
                label="Lageruppgifter"
                value={tasks.length > 0 ? `${completedTasks}/${tasks.length} klara` : 'Ingen lista ännu'}
                positive={tasks.length > 0 && completedTasks === tasks.length}
              />
            </div>

            <PackingIntegrityBanner
              integrity={integrity}
              error={integrityError}
              packingStatus={activePacking.status}
              onRefresh={refetchItems}
            />

            <PackingPreflightPanel
              packingId={activePacking.id}
              bookingNumber={booking.booking_number}
              className="border-border/60 shadow-sm"
              autoRun
            />
          </>
        )}

        <section>
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-sm font-semibold text-[hsl(var(--heading))]">Bokningsunderlag för lager</h2>
              <p className="text-xs text-muted-foreground">Leverans, kontakt, tider och bokade produkter i en samlad läsvy.</p>
            </div>
          </div>
          <BookingInfoExpanded booking={booking} projectLeader={activePacking?.project_leader || null} />
          {booking.internalnotes && (
            <Card className="rounded-2xl border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/15">
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-wide font-semibold text-amber-800 dark:text-amber-300">Intern information till produktion/lager</p>
                <p className="text-sm whitespace-pre-wrap mt-1 text-foreground">{booking.internalnotes}</p>
              </CardContent>
            </Card>
          )}
        </section>

        {activePacking && (
          <section className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
            <ManualPackingChecklist
              packingId={activePacking.id}
              packingName={activePacking.name}
              bookingNumber={booking.booking_number}
              client={booking.client}
            />
          </section>
        )}
      </div>
    </div>
  );
};

const StatusCard = ({
  icon: Icon,
  label,
  value,
  positive = false,
  badgeClass,
}: {
  icon: typeof Package;
  label: string;
  value: string;
  positive?: boolean;
  badgeClass?: string;
}) => (
  <Card className="rounded-xl border-border/60 shadow-sm">
    <CardContent className="p-4 flex items-center gap-3">
      <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0', positive ? 'bg-emerald-500/10' : 'bg-muted')}>
        <Icon className={cn('h-4 w-4', positive ? 'text-emerald-600' : 'text-muted-foreground')} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
        {badgeClass ? (
          <Badge className={cn('mt-1 border-0 shadow-none', badgeClass)}>{value}</Badge>
        ) : (
          <p className="text-sm font-semibold text-[hsl(var(--heading))] truncate mt-0.5">{value}</p>
        )}
      </div>
    </CardContent>
  </Card>
);

export default WarehouseBookingDetail;
