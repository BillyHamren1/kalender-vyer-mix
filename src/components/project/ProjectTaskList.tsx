import { useState, useRef } from "react";
import { Plus } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ProjectTask } from "@/types/project";
import ProjectTaskItem from "./ProjectTaskItem";
import AddTaskDialog from "./AddTaskDialog";
import TaskDetailSheet from "./TaskDetailSheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ProjectTaskListProps {
  tasks: ProjectTask[];
  onAddTask: (task: { title: string; description?: string; assigned_to?: string | null; deadline?: string | null }) => void;
  onUpdateTask: (data: { id: string; updates: Partial<ProjectTask> }) => void;
  onDeleteTask: (id: string) => void;
  onTaskAction?: (task: ProjectTask) => boolean;
}

const ProjectTaskList = ({ tasks, onAddTask, onUpdateTask, onDeleteTask, onTaskAction }: ProjectTaskListProps) => {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectTask | null>(null);
  const [quickAddValue, setQuickAddValue] = useState("");
  const quickAddRef = useRef<HTMLInputElement>(null);

  const regularTasks = tasks.filter(t => !t.is_info_only);
  const infoTasks = tasks.filter(t => t.is_info_only);
  const incompleteTasks = regularTasks.filter(t => !t.completed);
  const completedTasks = regularTasks.filter(t => t.completed);

  const totalRegular = regularTasks.length;
  const doneCount = completedTasks.length;
  const progress = totalRegular > 0 ? Math.round((doneCount / totalRegular) * 100) : 0;

  const handleToggleComplete = (task: ProjectTask) => {
    onUpdateTask({ id: task.id, updates: { completed: !task.completed } });
  };

  const handleClick = (task: ProjectTask) => {
    if (onTaskAction?.(task)) return;
    setSelectedTask(task);
  };

  const handleRenameTask = (id: string, title: string) => {
    onUpdateTask({ id, updates: { title } });
  };

  const handleConfirmDelete = () => {
    if (deleteTarget) {
      onDeleteTask(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  const handleQuickAdd = () => {
    const trimmed = quickAddValue.trim();
    if (!trimmed) return;
    onAddTask({ title: trimmed });
    setQuickAddValue("");
    quickAddRef.current?.focus();
  };

  const renderTaskItem = (task: ProjectTask, index: number, list: ProjectTask[]) => (
    <ProjectTaskItem
      key={task.id}
      task={task}
      onToggle={() => handleToggleComplete(task)}
      onClick={() => handleClick(task)}
      onDelete={() => setDeleteTarget(task)}
      onRenameTask={handleRenameTask}
      isFirst={index === 0}
      isLast={index === list.length - 1}
    />
  );

  return (
    <>
      <Card className="border-border/40 shadow-2xl rounded-2xl overflow-hidden flex flex-col flex-1">
        {/* Compact header */}
        <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 pt-2 pb-1.5">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-sm font-semibold text-foreground tracking-tight">Uppgifter</span>
            {totalRegular > 0 && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {doneCount}/{totalRegular}
              </span>
            )}
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setIsAddOpen(true)}>
            <Plus className="h-4 w-4" />
          </Button>
        </CardHeader>

        {/* Progress bar */}
        {totalRegular > 0 && (
          <div className="px-4 pb-1">
            <Progress
              value={progress}
              className="h-1.5 bg-muted/60"
              indicatorClassName="bg-primary"
            />
          </div>
        )}

        <CardContent className="p-0 pb-1 flex-1 overflow-y-auto flex flex-col">
          {tasks.length === 0 ? (
            <p className="text-muted-foreground text-center text-xs py-4 px-4">
              Inga uppgifter ännu.
            </p>
          ) : (
            <div className="divide-y divide-border/30 flex-1">
              {incompleteTasks.map((task, i) => renderTaskItem(task, i, incompleteTasks))}

              {infoTasks.length > 0 && (
                <>
                  <div className="px-2 pt-1.5 pb-0">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Milstolpar</span>
                  </div>
                  {infoTasks.map((task, i) => renderTaskItem(task, i, infoTasks))}
                </>
              )}

              {completedTasks.length > 0 && (
                <>
                  <div className="px-2 pt-1.5 pb-0">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Klara ({completedTasks.length})</span>
                  </div>
                  {completedTasks.map((task, i) => renderTaskItem(task, i, completedTasks))}
                </>
              )}
            </div>
          )}

          {/* Quick add row */}
          <div className="flex items-center gap-2 px-3 py-2 border-t border-border/20 mt-auto">
            <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              ref={quickAddRef}
              value={quickAddValue}
              onChange={(e) => setQuickAddValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleQuickAdd();
              }}
              placeholder="Lägg till uppgift..."
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground text-foreground"
            />
            {quickAddValue.trim() && (
              <button
                onClick={handleQuickAdd}
                className="text-xs text-primary font-medium hover:opacity-80 transition-opacity"
              >
                Lägg till
              </button>
            )}
          </div>
        </CardContent>

        <AddTaskDialog
          open={isAddOpen}
          onOpenChange={setIsAddOpen}
          onSubmit={(task) => {
            onAddTask(task);
            setIsAddOpen(false);
          }}
        />
      </Card>

      <TaskDetailSheet
        task={selectedTask}
        open={!!selectedTask}
        onOpenChange={(open) => !open && setSelectedTask(null)}
        onUpdateTask={onUpdateTask}
        onDeleteTask={onDeleteTask}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort uppgift</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker på att du vill ta bort "{deleteTarget?.title}"? Detta kan inte ångras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ProjectTaskList;
