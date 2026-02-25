import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Clock, CheckCircle2, AlertTriangle, User, Calendar, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { PackingWithBooking, PACKING_STATUS_LABELS, PACKING_STATUS_COLORS } from '@/types/packing';
import { format, differenceInDays, isPast } from 'date-fns';
import { sv } from 'date-fns/locale';

interface PackingDashboardProps {
  packings: PackingWithBooking[];
}

const PackingDashboard = ({ packings }: PackingDashboardProps) => {
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const planning = packings.filter(p => p.status === 'planning').length;
    const inProgress = packings.filter(p => p.status === 'in_progress').length;
    const delivered = packings.filter(p => p.status === 'delivered').length;
    const completed = packings.filter(p => p.status === 'completed').length;
    const signed = packings.filter(p => p.signed_by).length;
    const total = packings.length;

    // Packings with rig date within 7 days that aren't completed
    const urgent = packings.filter(p => {
      if (p.status === 'completed') return false;
      if (!p.booking?.rigdaydate) return false;
      const days = differenceInDays(new Date(p.booking.rigdaydate), new Date());
      return days >= 0 && days <= 7;
    });

    // Overdue = rig date has passed but not completed/delivered
    const overdue = packings.filter(p => {
      if (p.status === 'completed' || p.status === 'delivered') return false;
      if (!p.booking?.rigdaydate) return false;
      return isPast(new Date(p.booking.rigdaydate));
    });

    return { planning, inProgress, delivered, completed, signed, total, urgent, overdue };
  }, [packings]);

  const statCards = [
    { label: 'Planering', value: stats.planning, icon: Package, color: 'hsl(210 80% 55%)' },
    { label: 'Pågående', value: stats.inProgress, icon: Clock, color: 'hsl(38 92% 50%)' },
    { label: 'Levererat', value: stats.delivered, icon: ArrowRight, color: 'hsl(270 60% 55%)' },
    { label: 'Klart', value: stats.completed, icon: CheckCircle2, color: 'hsl(142 60% 40%)' },
  ];

  // Active packings sorted by urgency (closest rig date first)
  const activePackings = useMemo(() => {
    return packings
      .filter(p => p.status !== 'completed')
      .sort((a, b) => {
        const dateA = a.booking?.rigdaydate ? new Date(a.booking.rigdaydate).getTime() : Infinity;
        const dateB = b.booking?.rigdaydate ? new Date(b.booking.rigdaydate).getTime() : Infinity;
        return dateA - dateB;
      })
      .slice(0, 8);
  }, [packings]);

  if (packings.length === 0) return null;

  return (
    <div className="mb-8 space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCards.map(card => (
          <div
            key={card.label}
            className="rounded-xl border border-border/40 bg-card p-4 shadow-sm"
          >
            <div className="flex items-center gap-2 mb-2">
              <card.icon className="h-4 w-4" style={{ color: card.color }} />
              <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
            </div>
            <p className="text-2xl font-bold text-[hsl(var(--heading))]">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Urgent/overdue alerts */}
      {(stats.overdue.length > 0 || stats.urgent.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {stats.overdue.length > 0 && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-sm font-semibold text-destructive">
                  {stats.overdue.length} försenade
                </span>
              </div>
              <div className="space-y-1">
                {stats.overdue.slice(0, 3).map(p => (
                  <div
                    key={p.id}
                    className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => navigate(`/warehouse/packing/${p.id}`)}
                  >
                    {p.name} — {p.booking?.client}
                  </div>
                ))}
              </div>
            </div>
          )}
          {stats.urgent.length > 0 && (
            <div className="rounded-xl border border-warehouse/30 bg-warehouse/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-warehouse" />
                <span className="text-sm font-semibold text-warehouse">
                  {stats.urgent.length} brådskande (inom 7 dagar)
                </span>
              </div>
              <div className="space-y-1">
                {stats.urgent.slice(0, 3).map(p => {
                  const days = differenceInDays(new Date(p.booking!.rigdaydate!), new Date());
                  return (
                    <div
                      key={p.id}
                      className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors flex justify-between"
                      onClick={() => navigate(`/warehouse/packing/${p.id}`)}
                    >
                      <span>{p.name} — {p.booking?.client}</span>
                      <span className="font-medium">{days}d kvar</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active packings table */}
      {activePackings.length > 0 && (
        <div className="rounded-xl border border-border/40 bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border/30">
            <h3 className="text-sm font-semibold text-[hsl(var(--heading))]">Aktiva packningar</h3>
          </div>
          <div className="divide-y divide-border/20">
            {activePackings.map(p => {
              const rigDate = p.booking?.rigdaydate;
              const daysLeft = rigDate ? differenceInDays(new Date(rigDate), new Date()) : null;
              const isOverdue = daysLeft !== null && daysLeft < 0;

              return (
                <div
                  key={p.id}
                  className="px-5 py-3 flex items-center gap-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => navigate(`/warehouse/packing/${p.id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[hsl(var(--heading))] truncate">{p.name}</span>
                      <Badge className={`${PACKING_STATUS_COLORS[p.status]} text-[10px] px-1.5 py-0`}>
                        {PACKING_STATUS_LABELS[p.status]}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {p.booking?.client && (
                        <span className="text-xs text-muted-foreground truncate">{p.booking.client}</span>
                      )}
                      {p.project_leader && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {p.project_leader}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Rig date / time left */}
                  <div className="text-right shrink-0">
                    {rigDate && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(rigDate), 'd MMM', { locale: sv })}
                      </div>
                    )}
                    {daysLeft !== null && (
                      <span className={`text-xs font-semibold ${isOverdue ? 'text-destructive' : daysLeft <= 3 ? 'text-warehouse' : 'text-muted-foreground'}`}>
                        {isOverdue ? `${Math.abs(daysLeft)}d försenad` : `${daysLeft}d kvar`}
                      </span>
                    )}
                  </div>

                  {/* Signed indicator */}
                  <div className="shrink-0 w-20 text-right">
                    {p.signed_by ? (
                      <span className="text-xs text-primary flex items-center gap-1 justify-end">
                        <CheckCircle2 className="h-3 w-3" />
                        Signerad
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">Ej signerad</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default PackingDashboard;
