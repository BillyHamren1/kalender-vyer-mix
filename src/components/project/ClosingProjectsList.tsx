import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ChevronRight, ChevronDown, Calendar, AlertCircle, Check, CheckCheck,
  Clock, Receipt, Lock, Loader2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

import { fetchJobs } from '@/services/jobService';
import { fetchProjects } from '@/services/projectService';
import { fetchLargeProjects } from '@/services/largeProjectService';
import { useApproveTimeReport } from '@/hooks/useApproveTimeReport';
import { format, differenceInDays } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

async function getApproverName(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'Okänd';
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('user_id', user.id)
    .single();
  return profile?.full_name || user.email || 'Admin';
}

interface ClosingItem {
  id: string;
  name: string;
  type: 'small' | 'medium' | 'large';
  eventDate: string;
  subtitle: string | null;
  navigateTo: string;
  daysSinceEvent: number;
  bookingId: string | null;
  bookingIds: string[]; // for large projects with multiple bookings
  projectId: string | null;
}

const TYPE_LABELS: Record<string, string> = { small: 'Litet', medium: 'Medel', large: 'Stort' };
const TYPE_BADGE_CLASSES: Record<string, string> = {
  small: 'bg-[hsl(var(--project-small))] text-[hsl(var(--project-small-foreground))] ring-1 ring-[hsl(var(--project-small-border))]',
  medium: 'bg-[hsl(var(--project-medium))] text-[hsl(var(--project-medium-foreground))] ring-1 ring-[hsl(var(--project-medium-border))]',
  large: 'bg-[hsl(var(--project-large))] text-[hsl(var(--project-large-foreground))] ring-1 ring-[hsl(var(--project-large-border))]',
};

// Inline detail panel for a single project
function ClosingItemDetail({ item }: { item: ClosingItem }) {
  const queryClient = useQueryClient();
  const { approveMutation } = useApproveTimeReport();
  const [isClosing, setIsClosing] = useState(false);
  const [approvingPurchaseIds, setApprovingPurchaseIds] = useState<Set<string>>(new Set());

  // Fetch time reports for this booking
  const { data: timeReports = [], isLoading: loadingTR } = useQuery({
    queryKey: ['closing-time-reports', item.bookingId],
    queryFn: async () => {
      if (!item.bookingId) return [];
      const { data } = await supabase
        .from('time_reports')
        .select(`
          id, report_date, start_time, end_time, hours_worked, overtime_hours,
          description, approved, approved_by,
          staff_members!inner(name)
        `)
        .eq('booking_id', item.bookingId)
        .order('report_date', { ascending: false });
      return data ?? [];
    },
    enabled: !!item.bookingId,
  });

  // Fetch purchases for this project (medium uses project_purchases, large uses large_project_purchases)
  const isLargeProject = item.type === 'large';

  const approvePurchaseInDb = async (updatePayload: any, filter: { id?: string; ids?: string[] }) => {
    if (isLargeProject) {
      if (filter.ids) {
        return supabase.from('large_project_purchases').update(updatePayload).in('id', filter.ids);
      }
      return supabase.from('large_project_purchases').update(updatePayload).eq('id', filter.id!);
    }
    if (filter.ids) {
      return supabase.from('project_purchases').update(updatePayload).in('id', filter.ids);
    }
    return supabase.from('project_purchases').update(updatePayload).eq('id', filter.id!);
  };

  const { data: purchases = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ['closing-purchases', item.projectId, item.type],
    queryFn: async () => {
      if (!item.projectId) return [];
      if (item.type === 'large') {
        const { data } = await supabase
          .from('large_project_purchases')
          .select('id, purchase_date, amount, description, supplier, category, approved, approved_by')
          .eq('large_project_id', item.projectId)
          .order('purchase_date', { ascending: false });
        return (data ?? []) as any[];
      }
      const { data } = await supabase
        .from('project_purchases')
        .select('id, purchase_date, amount, description, supplier, category, approved, approved_by')
        .eq('project_id', item.projectId)
        .order('purchase_date', { ascending: false });
      return (data ?? []) as any[];
    },
    enabled: !!item.projectId && item.type !== 'small',
  });

  const pendingTR = timeReports.filter((tr: any) => !tr.approved);
  const approvedTR = timeReports.filter((tr: any) => tr.approved);
  const totalPurchaseAmount = purchases.reduce((sum: number, p: any) => sum + (p.amount ?? 0), 0);
  const pendingPurchases = purchases.filter((p: any) => !p.approved);
  const approvedPurchases = purchases.filter((p: any) => p.approved);

  const handleApproveAll = () => {
    const ids = pendingTR.map((tr: any) => tr.id);
    if (!ids.length) return;
    approveMutation.mutate(ids, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['closing-time-reports', item.bookingId] });
      },
    });
  };

  const handleApproveSingle = (id: string) => {
    approveMutation.mutate(id, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['closing-time-reports', item.bookingId] });
      },
    });
  };

  const handleApprovePurchase = async (purchaseId: string) => {
    setApprovingPurchaseIds(prev => new Set(prev).add(purchaseId));
    try {
      const approverName = await getApproverName();
      const updatePayload = {
        approved: true,
        approved_at: new Date().toISOString(),
        approved_by: approverName,
      };
      const { error } = await approvePurchaseInDb(updatePayload, { id: purchaseId });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['closing-purchases', item.projectId, item.type] });
      toast.success('Utlägg godkänt');
    } catch (err) {
      console.error(err);
      toast.error('Kunde inte godkänna utlägget');
    } finally {
      setApprovingPurchaseIds(prev => {
        const next = new Set(prev);
        next.delete(purchaseId);
        return next;
      });
    }
  };

  const handleApproveAllPurchases = async () => {
    const ids = pendingPurchases.map((p: any) => p.id);
    if (!ids.length) return;
    setApprovingPurchaseIds(new Set(ids));
    try {
      const approverName = await getApproverName();
      const updatePayload = {
        approved: true,
        approved_at: new Date().toISOString(),
        approved_by: approverName,
      };
      const { error } = await approvePurchaseInDb(updatePayload, { ids });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['closing-purchases', item.projectId, item.type] });
      toast.success(`${ids.length} utlägg godkända`);
    } catch (err) {
      console.error(err);
      toast.error('Kunde inte godkänna utlägg');
    } finally {
      setApprovingPurchaseIds(new Set());
    }
  };

  const handleCloseProject = async () => {
    if (!item.projectId) {
      toast.error('Inget projekt-ID kopplat');
      return;
    }
    setIsClosing(true);
    try {
      const table = item.type === 'large' ? 'large_projects' : item.type === 'small' ? 'jobs' : 'projects';
      const { error } = await supabase
        .from(table)
        .update({ status: 'completed' })
        .eq('id', item.projectId);
      if (error) throw error;

      if (item.bookingId) {
        try {
          const { markReadyForInvoicing } = await import('@/services/planningApiService');
          await markReadyForInvoicing(item.bookingId);
        } catch (syncErr) {
          console.warn('External sync failed (non-blocking):', syncErr);
        }
      }

      toast.success(`${item.name} stängt`);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['large-projects'] });
      queryClient.invalidateQueries({ queryKey: ['economy-overview'] });
    } catch (err) {
      console.error(err);
      toast.error('Kunde inte stänga projektet');
    } finally {
      setIsClosing(false);
    }
  };

  const allTimeReportsApproved = timeReports.length > 0 && pendingTR.length === 0;
  const noTimeReports = timeReports.length === 0;
  const allPurchasesApproved = purchases.length > 0 && pendingPurchases.length === 0;
  const noPurchases = purchases.length === 0;
  const timeOk = allTimeReportsApproved || noTimeReports;
  const purchaseOk = allPurchasesApproved || noPurchases;
  const canClose = timeOk && purchaseOk;

  const blockers: string[] = [];
  if (!timeOk) blockers.push('tidrapporter');
  if (!purchaseOk) blockers.push('utlägg');

  const formatDate = (d: string) => {
    try { return format(new Date(d), 'd MMM', { locale: sv }); }
    catch { return d; }
  };

  return (
    <div className="bg-muted/30 border-t border-border/30 px-4 py-4 space-y-4">
      {/* Time Reports Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Tidrapporter
            {!loadingTR && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
                {approvedTR.length}/{timeReports.length} godkända
              </Badge>
            )}
          </h4>
          {pendingTR.length > 0 && (
            <Button
              size="sm"
              variant="default"
              className="h-7 text-xs"
              onClick={handleApproveAll}
              disabled={approveMutation.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              Godkänn alla ({pendingTR.length})
            </Button>
          )}
        </div>
        {loadingTR ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Laddar...
          </div>
        ) : timeReports.length === 0 ? (
          <p className="text-xs text-muted-foreground py-1">Inga tidrapporter</p>
        ) : (
          <div className="space-y-1">
            {timeReports.map((tr: any) => {
              const staff = tr.staff_members as any;
              return (
                <div
                  key={tr.id}
                  className={cn(
                    'flex items-center gap-3 text-xs px-3 py-2 rounded-md border',
                    tr.approved
                      ? 'border-green-200/60 bg-green-50/40 dark:border-green-800/30 dark:bg-green-950/10'
                      : 'border-amber-200/60 bg-amber-50/40 dark:border-amber-800/30 dark:bg-amber-950/10'
                  )}
                >
                  <span className="font-medium text-foreground w-24 truncate">{staff?.name ?? '–'}</span>
                  <span className="text-muted-foreground w-16">{formatDate(tr.report_date)}</span>
                  <span className="text-foreground font-medium w-12">{tr.hours_worked}h</span>
                  {(tr.overtime_hours ?? 0) > 0 && (
                    <span className="text-amber-600 text-[10px]">+{tr.overtime_hours}h öt</span>
                  )}
                  <span className="flex-1 text-muted-foreground truncate">{tr.description ?? ''}</span>
                  {tr.approved ? (
                    <Badge variant="outline" className="text-[10px] border-green-300 text-green-600 bg-green-50 dark:bg-green-950/20 px-1.5 py-0">
                      <Check className="h-3 w-3 mr-0.5" /> Godkänd
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] px-2 border-primary/30 text-primary hover:bg-primary/10"
                      onClick={() => handleApproveSingle(tr.id)}
                      disabled={approveMutation.isPending}
                    >
                      <Check className="h-3 w-3 mr-0.5" /> Godkänn
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Purchases Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Receipt className="h-3.5 w-3.5" />
            Utlägg
            {!loadingPurchases && purchases.length > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
                {approvedPurchases.length}/{purchases.length} godkända · {totalPurchaseAmount.toLocaleString('sv-SE')} kr
              </Badge>
            )}
          </h4>
          {pendingPurchases.length > 0 && (
            <Button
              size="sm"
              variant="default"
              className="h-7 text-xs"
              onClick={handleApproveAllPurchases}
              disabled={approvingPurchaseIds.size > 0}
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              Godkänn alla ({pendingPurchases.length})
            </Button>
          )}
        </div>
        {loadingPurchases ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Laddar...
          </div>
        ) : purchases.length === 0 ? (
          <p className="text-xs text-muted-foreground py-1">Inga utlägg</p>
        ) : (
          <div className="space-y-1">
            {purchases.map((p: any) => (
              <div
                key={p.id}
                className={cn(
                  'flex items-center gap-3 text-xs px-3 py-2 rounded-md border',
                  p.approved
                    ? 'border-green-200/60 bg-green-50/40 dark:border-green-800/30 dark:bg-green-950/10'
                    : 'border-amber-200/60 bg-amber-50/40 dark:border-amber-800/30 dark:bg-amber-950/10'
                )}
              >
                <span className="font-medium text-foreground w-24 truncate">{p.supplier ?? '–'}</span>
                <span className="text-muted-foreground w-16">{p.purchase_date ? formatDate(p.purchase_date) : '–'}</span>
                <span className="flex-1 text-muted-foreground truncate">{p.description}</span>
                <span className="font-medium text-foreground">{p.amount?.toLocaleString('sv-SE')} kr</span>
                {p.approved ? (
                  <Badge variant="outline" className="text-[10px] border-green-300 text-green-600 bg-green-50 dark:bg-green-950/20 px-1.5 py-0">
                    <Check className="h-3 w-3 mr-0.5" /> Godkänd
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-2 border-primary/30 text-primary hover:bg-primary/10"
                    onClick={() => handleApprovePurchase(p.id)}
                    disabled={approvingPurchaseIds.has(p.id)}
                  >
                    {approvingPurchaseIds.has(p.id) ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <><Check className="h-3 w-3 mr-0.5" /> Godkänn</>
                    )}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Close Project Action */}
      <div className="flex items-center justify-between pt-2 border-t border-border/30">
        <div className="text-xs text-muted-foreground">
          {canClose ? (
            <span className="text-green-600 font-medium">✓ Redo att stängas</span>
          ) : (
            <span className="text-amber-600">Godkänn {blockers.join(' och ')} innan stängning</span>
          )}
        </div>
        <Button
          size="sm"
          disabled={!canClose || isClosing}
          onClick={handleCloseProject}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          {isClosing ? (
            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Stänger...</>
          ) : (
            <><Lock className="h-3.5 w-3.5 mr-1.5" /> Stäng projekt</>
          )}
        </Button>
      </div>
    </div>
  );
}

const ClosingProjectsList = () => {
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: jobs = [] } = useQuery({ queryKey: ['jobs'], queryFn: fetchJobs });
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects });
  const { data: largeProjects = [] } = useQuery({ queryKey: ['large-projects'], queryFn: fetchLargeProjects });

  const today = useMemo(() => new Date(), []);
  const todayStr = today.toISOString().split('T')[0];

  const closingItems = useMemo<ClosingItem[]>(() => {
    const items: ClosingItem[] = [];

    // Small projects (jobs)
    jobs.forEach(j => {
      const eventDate = j.booking?.eventDate;
      if (j.status !== 'completed' && eventDate && eventDate < todayStr) {
        const client = j.booking?.client;
        const bookingNum = j.booking?.bookingNumber;
        const displayName = client ? `${client}${bookingNum ? ' #' + bookingNum : ''}` : j.name;
        items.push({
          id: j.id,
          name: displayName,
          type: 'small',
          eventDate,
          subtitle: j.booking?.deliveryAddress ?? null,
          navigateTo: `/jobs/${j.id}`,
          daysSinceEvent: differenceInDays(today, new Date(eventDate)),
          bookingId: j.bookingId ?? null,
          projectId: j.id,
        });
      }
    });

    projects.forEach(p => {
      const eventDate = p.booking?.eventdate ?? p.eventdate;
      if (p.status !== 'completed' && eventDate && eventDate < todayStr) {
        const client = p.booking?.client;
        const bookingNum = p.booking?.booking_number;
        const displayName = client ? `${client}${bookingNum ? ' #' + bookingNum : ''}` : p.name;
        const addressParts = [p.booking?.deliveryaddress, p.booking?.delivery_city].filter(Boolean);
        items.push({
          id: p.id,
          name: displayName,
          type: 'medium',
          eventDate,
          subtitle: addressParts.length > 0 ? addressParts.join(', ') : null,
          navigateTo: `/project/${p.id}`,
          daysSinceEvent: differenceInDays(today, new Date(eventDate)),
          bookingId: p.booking_id ?? null,
          projectId: p.id,
        });
      }
    });

    largeProjects.forEach(lp => {
      const eventDate = lp.end_date ?? lp.start_date;
      if (lp.status !== 'completed' && eventDate && eventDate < todayStr) {
        items.push({
          id: lp.id,
          name: lp.name,
          type: 'large',
          eventDate,
          subtitle: lp.location ?? null,
          navigateTo: `/large-project/${lp.id}`,
          daysSinceEvent: differenceInDays(today, new Date(eventDate)),
          bookingId: null,
          projectId: lp.id,
        });
      }
    });

    return items.sort((a, b) => b.daysSinceEvent - a.daysSinceEvent);
  }, [jobs, projects, largeProjects, todayStr, today]);

  if (closingItems.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Check className="h-8 w-8 mx-auto text-green-500 mb-2" />
          <p className="text-sm text-muted-foreground">Inga projekt behöver stängas just nu.</p>
        </CardContent>
      </Card>
    );
  }

  const formatDate = (dateStr: string) => {
    try { return format(new Date(dateStr), 'd MMM yyyy', { locale: sv }); }
    catch { return dateStr; }
  };

  const urgencyClass = (days: number) => {
    if (days > 14) return 'text-destructive font-semibold';
    if (days > 7) return 'text-amber-600 font-medium';
    return 'text-muted-foreground';
  };

  return (
    <div className="space-y-2">
      {closingItems.map(item => {
        const isExpanded = expandedId === `${item.type}-${item.id}`;
        const itemKey = `${item.type}-${item.id}`;

        return (
          <Card key={itemKey} className={cn(
            'overflow-hidden transition-shadow',
            isExpanded && 'ring-1 ring-primary/20 shadow-md'
          )}>
            <div
              onClick={() => setExpandedId(isExpanded ? null : itemKey)}
              className="group flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
            >
              <div className="shrink-0">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-primary" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary/50" />
                )}
              </div>

              <Badge className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-md ${TYPE_BADGE_CLASSES[item.type]}`}>
                {TYPE_LABELS[item.type]}
              </Badge>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-foreground">{item.name}</p>
                {item.subtitle && (
                  <p className="text-[11px] text-muted-foreground truncate">{item.subtitle}</p>
                )}
              </div>

              <div className="shrink-0 text-right">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {formatDate(item.eventDate)}
                </div>
                <p className={`text-[11px] ${urgencyClass(item.daysSinceEvent)}`}>
                  {item.daysSinceEvent} {item.daysSinceEvent === 1 ? 'dag' : 'dagar'} sedan
                </p>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={(e) => { e.stopPropagation(); navigate(item.navigateTo); }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {isExpanded && <ClosingItemDetail item={item} />}
          </Card>
        );
      })}
    </div>
  );
};

export default ClosingProjectsList;
