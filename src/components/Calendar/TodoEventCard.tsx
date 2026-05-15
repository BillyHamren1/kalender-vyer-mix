import { useQuery } from '@tanstack/react-query';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { CalendarEvent } from './ResourceData';
import { ClipboardList, MapPin, User, Phone, Mail, Calendar as CalendarIcon, Clock, StickyNote } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

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

  const { data: todo } = useQuery({
    queryKey: ['todo-detail', todoId],
    enabled: !!todoId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('todos')
        .select('*')
        .eq('id', todoId)
        .maybeSingle();
      return data;
    },
    staleTime: 60_000,
  });

  const title = event.title || todo?.title || 'To-do';
  const client = todo?.client || '';
  const address = todo?.address || '';
  const city = todo?.city || '';
  const locLine = [address, city].filter(Boolean).join(', ');
  const start = event.start;
  const end = event.end;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div
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
            <span>{formatTimeRange(start, end)}</span>
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 overflow-hidden"
        align="start"
        sideOffset={6}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-l-4 border-orange-500 bg-orange-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-orange-700" />
            <div className="text-xs uppercase tracking-wide font-semibold text-orange-700">
              To-do
            </div>
          </div>
          <div className="mt-1 text-base font-semibold text-gray-900">{title}</div>
        </div>

        <div className="p-4 space-y-2.5 text-sm">
          <div className="flex items-start gap-2 text-gray-700">
            <CalendarIcon className="h-4 w-4 mt-0.5 text-gray-500 shrink-0" />
            <div>
              {format(new Date(start), 'EEEE d MMM yyyy', { locale: sv })}
              <span className="text-gray-500"> · {formatTimeRange(start, end)}</span>
            </div>
          </div>

          {client && (
            <div className="flex items-start gap-2 text-gray-700">
              <User className="h-4 w-4 mt-0.5 text-gray-500 shrink-0" />
              <span>{client}</span>
            </div>
          )}

          {locLine && (
            <div className="flex items-start gap-2 text-gray-700">
              <MapPin className="h-4 w-4 mt-0.5 text-gray-500 shrink-0" />
              <span>{locLine}</span>
            </div>
          )}

          {todo?.contact_name && (
            <div className="flex items-start gap-2 text-gray-700">
              <User className="h-4 w-4 mt-0.5 text-gray-500 shrink-0" />
              <span>{todo.contact_name}</span>
            </div>
          )}
          {todo?.contact_phone && (
            <div className="flex items-start gap-2 text-gray-700">
              <Phone className="h-4 w-4 mt-0.5 text-gray-500 shrink-0" />
              <a className="hover:underline" href={`tel:${todo.contact_phone}`}>{todo.contact_phone}</a>
            </div>
          )}
          {todo?.contact_email && (
            <div className="flex items-start gap-2 text-gray-700">
              <Mail className="h-4 w-4 mt-0.5 text-gray-500 shrink-0" />
              <a className="hover:underline" href={`mailto:${todo.contact_email}`}>{todo.contact_email}</a>
            </div>
          )}

          {todo?.internal_notes && (
            <div className="flex items-start gap-2 text-gray-700 pt-1 border-t mt-2">
              <StickyNote className="h-4 w-4 mt-0.5 text-gray-500 shrink-0" />
              <div className="whitespace-pre-wrap text-sm">{todo.internal_notes}</div>
            </div>
          )}

          {!todo && todoId && (
            <div className="text-xs text-gray-500">Hämtar detaljer…</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
