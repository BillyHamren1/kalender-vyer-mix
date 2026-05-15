import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarEvent } from './ResourceData';
import { ClipboardList, MapPin, Clock } from 'lucide-react';
import { format } from 'date-fns';
import CreateTodoWizard from '@/components/todo/CreateTodoWizard';

interface TodoEventCardProps {
  event: CalendarEvent;
}

const formatTimeRange = (start: string | Date, end: string | Date) => {
  const s = typeof start === 'string' ? new Date(start) : start;
  const e = typeof end === 'string' ? new Date(end) : end;
  return `${format(s, 'HH:mm')}–${format(e, 'HH:mm')}`;
};

export function TodoEventCard({ event }: TodoEventCardProps) {
  const ext = (event.extendedProps as any) || {};
  const todoId: string | undefined = ext.todoId;
  const [editOpen, setEditOpen] = useState(false);
  const queryClient = useQueryClient();

  const title = event.title || 'To-do';
  const client = ext.client || '';
  const address = ext.address || '';
  const city = ext.city || '';
  const locLine = [address, city].filter(Boolean).join(', ');

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (todoId) setEditOpen(true);
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick(e as any);
          }
        }}
        className="h-full w-full cursor-pointer rounded-md border-l-4 px-1.5 py-1 text-[11px] leading-tight overflow-hidden transition-colors hover:brightness-95"
        style={{
          background: '#FFEDD5',
          borderLeftColor: '#F97316',
          color: '#1F2937',
        }}
      >
        <div className="flex items-center gap-1">
          <ClipboardList className="h-3 w-3 shrink-0 text-orange-700" />
          <span className="font-semibold truncate">{title}</span>
        </div>
        {client && (
          <div className="truncate text-[10px] text-gray-700">{client}</div>
        )}
        {locLine && (
          <div className="flex items-center gap-1 truncate text-[10px] text-gray-600">
            <MapPin className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{locLine}</span>
          </div>
        )}
        <div className="flex items-center gap-1 text-[10px] text-gray-600">
          <Clock className="h-2.5 w-2.5 shrink-0" />
          <span>{formatTimeRange(event.start, event.end)}</span>
        </div>
      </div>

      {todoId && (
        <CreateTodoWizard
          open={editOpen}
          onOpenChange={setEditOpen}
          todoId={todoId}
          onSuccess={() => {
            setEditOpen(false);
            queryClient.invalidateQueries({ queryKey: ['todo-detail', todoId] });
            queryClient.invalidateQueries({ queryKey: ['todos'] });
            queryClient.invalidateQueries({ queryKey: ['planner-calendar-events'] });
            queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
          }}
        />
      )}
    </>
  );
}
