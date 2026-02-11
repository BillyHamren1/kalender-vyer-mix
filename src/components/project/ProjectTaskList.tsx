import { useState } from "react";
import { Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

  // Separate regular tasks from info-only tasks
  const regularTasks = tasks.filter(t => !t.is_info_only);
  const infoTasks = tasks.filter(t => t.is_info_only);
  
  const incompleteTasks = regularTasks.filter(t => !t.completed);
  const completedTasks = regularTasks.filter(t => t.completed);

  const handleToggleComplete = (task: ProjectTask) => {
    onUpdateTask({ id: task.id, updates: { completed: !task.completed } });
  };

  const handleClick = (task: ProjectTask) => {
    if (onTaskAction?.(task)) return;
    setSelectedTask(task);
  };

  const handleMove = (taskList: ProjectTask[], index: number, direction: 'up' | 'down') => {
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= taskList.length) return;

    const currentTask = taskList[index];
    const swapTask = taskList[swapIndex];

    // Swap sort_order values
    onUpdateTask({ id: currentTask.id, updates: { sort_order: swapTask.sort_order } });
    onUpdateTask({ id: swapTask.id, updates: { sort_order: currentTask.sort_order } });
  };

  const handleConfirmDelete = () => {
    if (deleteTarget) {
      onDeleteTask(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  const renderTaskItem = (task: ProjectTask, index: number, list: ProjectTask[]) => (
    <ProjectTaskItem
      key={task.id}
      task={task}
      onToggle={() => handleToggleComplete(task)}
      onClick={() => handleClick(task)}
      onDelete={() => setDeleteTarget(task)}
      onMoveUp={() => handleMove(list, index, 'up')}
      onMoveDown={() => handleMove(list, index, 'down')}
      isFirst={index === 0}
      isLast={index === list.length - 1}
    />
  );

  return (
    <>
      <Card className="border-border/40 shadow-2xl rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="tracking-tight">Uppgifter</CardTitle>
          <Button size="sm" onClick={() => setIsAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Lägg till
          </Button>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {tasks.length === 0 ? (
            <p className="text-muted-foreground text-center py-8 px-6">
              Inga uppgifter ännu. Klicka på "Lägg till" för att skapa en.
            </p>
          ) : (
            <div className="divide-y divide-border/30">
              {/* Incomplete tasks */}
              {incompleteTasks.map((task, i) => renderTaskItem(task, i, incompleteTasks))}
              
              {/* Info tasks (milestones) */}
              {infoTasks.length > 0 && (
                <>
                  <div className="px-4 pt-3 pb-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Milstolpar</span>
                  </div>
                  {infoTasks.map((task, i) => renderTaskItem(task, i, infoTasks))}
                </>
              )}
              
              {/* Completed tasks */}
              {completedTasks.length > 0 && (
                <>
                  <div className="px-4 pt-3 pb-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Klara ({completedTasks.length})</span>
                  </div>
                  {completedTasks.map((task, i) => renderTaskItem(task, i, completedTasks))}
                </>
              )}
            </div>
          )}
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

      {/* Delete confirmation */}
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
