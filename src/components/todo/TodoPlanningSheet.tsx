import { useQueryClient } from '@tanstack/react-query';
import CreateTodoWizard from '@/components/todo/CreateTodoWizard';

interface TodoPlanningSheetProps {
  todoId: string | null;
  onClose: () => void;
}

/**
 * Planera to-do — öppnar samma fullständiga formulär som "Skapa to do"
 * (alla fält redigerbara) men i planningMode, så Team-väljaren visas och
 * "Placera i kalendern" skapar/uppdaterar motsvarande calendar_events-rad.
 */
export function TodoPlanningSheet({ todoId, onClose }: TodoPlanningSheetProps) {
  const qc = useQueryClient();
  return (
    <CreateTodoWizard
      open={!!todoId}
      onOpenChange={(o) => { if (!o) onClose(); }}
      todoId={todoId}
      planningMode
      onSuccess={() => {
        qc.invalidateQueries({ queryKey: ['unplanned-todos'] });
        qc.invalidateQueries({ queryKey: ['calendar-events'] });
        qc.invalidateQueries({ queryKey: ['todo-detail', todoId] });
        onClose();
      }}
    />
  );
}
