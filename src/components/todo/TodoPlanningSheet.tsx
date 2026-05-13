import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';

interface TodoPlanningSheetProps {
  todoId: string | null;
  onClose: () => void;
}

/** Placerar en to-do i personalkalendern via calendar_events (event_type='todo'). */
export function TodoPlanningSheet({ todoId, onClose }: TodoPlanningSheetProps) {
  const { organizationId } = useCurrentOrg();
  const qc = useQueryClient();
  const open = !!todoId;

  const [resourceId, setResourceId] = useState<string>('');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('16:00');

  const { data: todo } = useQuery({
    queryKey: ['todo-detail', todoId],
    enabled: !!todoId,
    queryFn: async () => {
      const { data } = await (supabase as any).from('todos').select('*').eq('id', todoId).maybeSingle();
      return data;
    },
  });

  // Resources from localStorage (samma mönster som CustomEvent.tsx via loadResourcesFromStorage),
  // men för att hålla det enkelt: använd team1..team5 + 'project'.
  const teams = [
    { id: 'team1', label: 'Team 1' },
    { id: 'team2', label: 'Team 2' },
    { id: 'team3', label: 'Team 3' },
    { id: 'team4', label: 'Team 4' },
    { id: 'team5', label: 'Team 5' },
  ];

  useEffect(() => {
    if (!todo) return;
    setDate(todo.scheduled_date || new Date().toISOString().slice(0, 10));
    setStart(todo.start_time?.slice(0, 5) || '08:00');
    setEnd(todo.end_time?.slice(0, 5) || '16:00');
    if (!resourceId) setResourceId('team1');
  }, [todo, resourceId]);

  const place = useMutation({
    mutationFn: async () => {
      if (!todo || !organizationId) throw new Error('Saknar data');
      if (!date || !start || !end || !resourceId) throw new Error('Fyll i datum, tid och team');
      const startISO = new Date(`${date}T${start}:00`).toISOString();
      const endISO = new Date(`${date}T${end}:00`).toISOString();
      const { error } = await (supabase as any).from('calendar_events').insert({
        resource_id: resourceId,
        title: todo.title,
        start_time: startISO,
        end_time: endISO,
        event_type: 'todo',
        source_date: date,
        organization_id: organizationId,
        todo_id: todo.id,
      });
      if (error) throw error;
      // Persist date/time on todo
      await (supabase as any).from('todos').update({
        scheduled_date: date,
        start_time: `${start}:00`,
        end_time: `${end}:00`,
      }).eq('id', todo.id);
    },
    onSuccess: () => {
      toast.success('To do placerad i kalendern');
      qc.invalidateQueries({ queryKey: ['unplanned-todos'] });
      qc.invalidateQueries({ queryKey: ['calendar-events'] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message || 'Kunde inte placera'),
  });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[420px] sm:max-w-[420px]">
        <SheetHeader>
          <SheetTitle>Planera to do</SheetTitle>
        </SheetHeader>
        {todo && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border-l-4 border-orange-500 bg-orange-50 p-3">
              <div className="text-xs uppercase text-orange-700 font-semibold">{todo.title}</div>
              {todo.client && <div className="text-sm">{todo.client}</div>}
              {todo.address && <div className="text-xs text-muted-foreground">{todo.address}</div>}
            </div>

            <div>
              <Label>Team</Label>
              <Select value={resourceId} onValueChange={setResourceId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Datum</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start</Label>
                <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div>
                <Label>Slut</Label>
                <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
          </div>
        )}
        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button onClick={() => place.mutate()} disabled={place.isPending} className="bg-orange-500 hover:bg-orange-600 text-white">
            {place.isPending ? 'Placerar…' : 'Placera i kalendern'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
