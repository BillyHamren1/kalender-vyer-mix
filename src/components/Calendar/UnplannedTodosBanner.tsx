import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Calendar, MapPin, ListChecks } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useUnplannedTodos } from '@/hooks/useUnplannedTodos';
import { TodoPlanningSheet } from '@/components/todo/TodoPlanningSheet';

export const UnplannedTodosBanner: React.FC = () => {
  const { data: todos = [], isLoading } = useUnplannedTodos();
  const [openId, setOpenId] = useState<string | null>(null);

  if (isLoading || todos.length === 0) return null;

  const fmt = (s: string | null) => {
    if (!s) return '–';
    try { return format(new Date(s), 'd MMM yyyy', { locale: sv }); } catch { return s; }
  };

  return (
    <>
      <div className="rounded-xl border border-orange-300 bg-card overflow-hidden shadow-sm mx-2 mb-2">
        <div className="px-4 py-2 border-b border-orange-200 bg-orange-50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-orange-200">
              <ListChecks className="h-4 w-4 text-orange-700" />
            </div>
            <h3 className="font-semibold text-sm text-foreground">To-dos att planera</h3>
            <span className="text-[11px] text-muted-foreground">Dra in i personalkalendern</span>
          </div>
          <Badge className="h-5 px-2 text-xs font-medium bg-orange-200 text-orange-800 border-0">{todos.length}</Badge>
        </div>

        <div className="divide-y divide-border/30 max-h-[160px] overflow-y-auto">
          {todos.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setOpenId(t.id)}
              className="w-full text-left group flex items-center gap-3 px-4 py-2 hover:bg-orange-50 transition-colors"
            >
              <ListChecks className="h-4 w-4 text-orange-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium truncate text-foreground group-hover:text-orange-700">{t.title}</h4>
                  {t.type_label && (
                    <Badge variant="outline" className="h-4 px-1.5 text-[10px] border-orange-300 text-orange-700 shrink-0">
                      {t.type_label}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                  {t.scheduled_date && (
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{fmt(t.scheduled_date)}</span>
                  )}
                  {t.address && (
                    <span className="flex items-center gap-1 truncate max-w-[260px]"><MapPin className="w-3 h-3 shrink-0" />{t.address}</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <TodoPlanningSheet todoId={openId} onClose={() => setOpenId(null)} />
    </>
  );
};
