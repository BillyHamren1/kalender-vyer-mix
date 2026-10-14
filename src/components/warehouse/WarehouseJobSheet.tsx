import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import QuickAssignStaffPopover from '@/components/warehouse-ops/QuickAssignStaffPopover';
import { updateWarehouseCalendarEvent } from '@/services/warehouseCalendarService';
import { warehouseDateOf, warehouseTimeOf, warehouseLocalToIso } from '@/lib/warehouse/warehouseTime';
import { toast } from 'sonner';

export interface WarehouseJobTarget {
  warehouseEventId?: string | null;
  packingId?: string | null;
  bookingId?: string | null;
  title?: string | null;
}

interface Props {
  target: WarehouseJobTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/** One detail surface; ids select existing owner records, never a copied job. */
export default function WarehouseJobSheet({ target, open, onOpenChange, onSaved }: Props) {
  const { organizationId } = useCurrentOrg();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedEvent, setSelectedEvent] = useState<{ owner: string; id: string } | null>(null);
  const ownerKey = `${target?.warehouseEventId || ''}|${target?.packingId || ''}|${target?.bookingId || ''}`;
  const eventId = selectedEvent?.owner === ownerKey ? selectedEvent.id : target?.warehouseEventId;
  const [saving, setSaving] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const query = useQuery({
    queryKey: ['warehouse-job-detail', organizationId, eventId, target?.packingId, target?.bookingId],
    enabled: open && !!organizationId && !!target,
    queryFn: async () => {
      const eventResult = eventId
        ? await supabase.from('warehouse_calendar_events').select('*').eq('organization_id', organizationId!).eq('id', eventId).single()
        : { data: null, error: null };
      if (eventResult.error) throw eventResult.error;
      const packingResult = target?.packingId
        ? await supabase.from('packing_projects').select('id,name,booking_id,status,client_name').eq('organization_id', organizationId!).eq('id', target.packingId).single()
        : { data: null, error: null };
      if (packingResult.error) throw packingResult.error;
      const event = eventResult.data;
      const packing = packingResult.data;
      const assignmentsQuery = supabase.from('warehouse_assignments')
        .select('id,staff_id,project_task_id,title,description,start_time,end_time,status')
        .eq('organization_id', organizationId!);
      const assignmentsResult = event
        ? await assignmentsQuery.eq('warehouse_event_id', event.id)
        : packing ? await assignmentsQuery.eq('packing_id', packing.id).is('warehouse_event_id', null)
        : { data: [], error: null };
      if (assignmentsResult.error) throw assignmentsResult.error;
      const assignments = assignmentsResult.data || [];
      const linkedTaskId = (event as (typeof event & { project_task_id?: string | null }))?.project_task_id;
      const taskIds = [...new Set([linkedTaskId, ...assignments.map(a => a.project_task_id)].filter((id): id is string => !!id))];
      const tasksResult = taskIds.length
        ? await supabase.from('project_tasks').select('id,title,description,completed').eq('organization_id', organizationId!).in('id', taskIds)
        : { data: [], error: null };
      if (tasksResult.error) throw tasksResult.error;
      const bookingId = event?.booking_id || packing?.booking_id || target?.bookingId;
      const relatedResult = bookingId ? await supabase.from('warehouse_calendar_events').select('id,title,event_type,start_time,end_time').eq('organization_id', organizationId!).eq('booking_id', bookingId).order('start_time') : { data: [], error: null };
      if (relatedResult.error) throw relatedResult.error;
      return { relatedEvents: relatedResult.data || [], event, packing, assignments, tasks: tasksResult.data || [], bookingId: event?.booking_id || packing?.booking_id || target?.bookingId };
    },
  });

  useEffect(() => {
    const event = query.data?.event;
    setStart(event ? `${warehouseDateOf(event.start_time)}T${warehouseTimeOf(event.start_time)}` : '');
    setEnd(event ? `${warehouseDateOf(event.end_time)}T${warehouseTimeOf(event.end_time)}` : '');
  }, [query.data?.event]);

  const initialStart = query.data?.event ? `${warehouseDateOf(query.data.event.start_time)}T${warehouseTimeOf(query.data.event.start_time)}` : '';
  const initialEnd = query.data?.event ? `${warehouseDateOf(query.data.event.end_time)}T${warehouseTimeOf(query.data.event.end_time)}` : '';
  const timeChanged = start !== initialStart || end !== initialEnd;

  const saveTime = async () => {
    if (!query.data?.event || saving || !timeChanged) return;
    setSaving(true);
    try {
      const startIso = start === initialStart ? query.data.event.start_time : warehouseLocalToIso(start.slice(0, 10), start.slice(11));
      const endIso = end === initialEnd ? query.data.event.end_time : warehouseLocalToIso(end.slice(0, 10), end.slice(11));
      if (Date.parse(endIso) <= Date.parse(startIso)) throw new Error('Sluttiden måste vara efter starttiden.');
      await updateWarehouseCalendarEvent(query.data.event.id, { start_time: startIso, end_time: endIso });
      await Promise.all(['warehouse-job-detail', 'warehouse-personnel-week', 'warehouse-ops-range', 'warehouse-quick-assign-context'].map(key => qc.invalidateQueries({ queryKey: [key] })));
      onSaved?.();
      toast.success('Planeringen sparad');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Kunde inte spara planeringen');
    } finally { setSaving(false); }
  };

  const data = query.data;
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
      <SheetHeader className="text-left">
        <SheetTitle>{data?.event?.title || data?.packing?.name || target?.title || 'Lagerjobb'}</SheetTitle>
        <SheetDescription>Planering och bemanning för detta jobb.</SheetDescription>
      </SheetHeader>
      {query.isPending ? <p className="py-6" role="status">Hämtar jobbet…</p> : query.isError ? <div className="py-6 space-y-3" role="alert"><p>Kunde inte hämta jobbet. Ingen planering har ändrats.</p><Button onClick={() => query.refetch()}>Försök igen</Button></div> : data && <div className="mt-6 space-y-6">
        {data.relatedEvents.length > 0 && <section className="space-y-2"><h3 className="font-semibold">Arbetsmoment</h3><p className="text-sm text-muted-foreground">Välj det moment du vill planera och bemanna.</p>{data.relatedEvents.map(event => <Button key={event.id} variant={event.id === eventId ? 'default' : 'outline'} className="w-full justify-start h-auto min-h-11 whitespace-normal text-left" disabled={saving} onClick={() => setSelectedEvent({ owner: ownerKey, id: event.id })}>{event.event_type === 'packing' ? 'Packning' : event.event_type === 'return' ? 'Retur' : event.title} · {warehouseDateOf(event.start_time)} {warehouseTimeOf(event.start_time)}</Button>)}</section>}
        {data.event && <section className="space-y-3">
          <h3 className="font-semibold">Planerad tid</h3>
          <p className="text-sm text-muted-foreground">Alla tider visas i svensk tid.</p>
          <Label htmlFor="warehouse-job-start">Start</Label><Input id="warehouse-job-start" type="datetime-local" value={start} onChange={e => setStart(e.target.value)} disabled={saving} />
          <Label htmlFor="warehouse-job-end">Slut</Label><Input id="warehouse-job-end" type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} disabled={saving} />
          <Button onClick={saveTime} disabled={saving || !start || !end || !timeChanged}>{saving ? 'Sparar…' : 'Spara tid'}</Button>
        </section>}
        {(data.event || data.packing) && <section className="space-y-2">
          <h3 className="font-semibold">Personal</h3>
          <QuickAssignStaffPopover warehouseEventId={data.event?.id} packingId={data.packing?.id} packingName={data.event?.title || data.packing?.name} assignedNames={[]} label="Ändra bemanning" muted={false} />
          <p className="text-sm text-muted-foreground">Tilldelning visar vem som arbetar med jobbet. Bemanningsbehov är inte fastställt här.</p>
        </section>}
        {data.tasks.map(task => <section key={task.id} className="rounded-lg border p-4 space-y-2"><h3 className="font-semibold">{task.title}</h3>{task.description && <p className="whitespace-pre-wrap">{task.description}</p>}<p className="text-sm text-muted-foreground">{task.completed ? 'Klar' : 'Planerad uppgift'}</p></section>)}
        {data.event?.delivery_address && <p className="text-sm">{data.event.delivery_address}</p>}
        <div className="flex flex-wrap gap-2">
          {data.packing && <Button onClick={() => navigate(`/warehouse/packing/${data.packing!.id}`)}>Öppna packning</Button>}
          {data.bookingId && <Button variant="outline" onClick={() => navigate(`/warehouse/bookings/${data.bookingId}`)}>Öppna bokning</Button>}
          {data.event?.warehouse_project_id && <Button variant="outline" onClick={() => navigate(`/warehouse/projects/${data.event!.warehouse_project_id}`)}>Öppna lagerprojekt</Button>}
        </div>
      </div>}
    </SheetContent>
  </Sheet>;
}
