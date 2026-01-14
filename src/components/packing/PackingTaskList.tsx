import { useState } from "react";
import { Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PackingTask } from "@/types/packing";
import PackingTaskItem from "./PackingTaskItem";
import AddPackingTaskDialog from "./AddPackingTaskDialog";
import PackingTaskDetailSheet from "./PackingTaskDetailSheet";

interface PackingTaskListProps {
  tasks: PackingTask[];
  onAddTask: (task: { title: string; description?: string; assigned_to?: string | null; deadline?: string | null }) => void;
  onUpdateTask: (data: { id: string; updates: Partial<PackingTask> }) => void;
  onDeleteTask: (id: string) => void;
}

const PackingTaskList = ({ tasks, onAddTask, onUpdateTask, onDeleteTask }: PackingTaskListProps) => {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<PackingTask | null>(null);

  // Separate regular tasks from info-only tasks
  const regularTasks = tasks.filter(t => !t.is_info_only);
  const infoTasks = tasks.filter(t => t.is_info_only);
  
  const incompleteTasks = regularTasks.filter(t => !t.completed);
  const completedTasks = regularTasks.filter(t => t.completed);

  const handleToggleComplete = (task: PackingTask) => {
    onUpdateTask({ id: task.id, updates: { completed: !task.completed } });
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle>Uppgifter</CardTitle>
          <Button size="sm" onClick={() => setIsAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Lägg till
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {tasks.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Inga uppgifter ännu. Klicka på "Lägg till" för att skapa en.
            </p>
          ) : (
            <>
              {/* Incomplete tasks */}
              {incompleteTasks.map(task => (
                <PackingTaskItem
                  key={task.id}
                  task={task}
                  onToggle={() => handleToggleComplete(task)}
                  onClick={() => setSelectedTask(task)}
                />
              ))}
              
              {/* Info tasks (milestones) */}
              {infoTasks.length > 0 && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground mb-2">
                    Milstolpar
                  </p>
                  {infoTasks.map(task => (
                    <PackingTaskItem
                      key={task.id}
                      task={task}
                      onToggle={() => handleToggleComplete(task)}
                      onClick={() => setSelectedTask(task)}
                    />
                  ))}
                </div>
              )}
              
              {/* Completed tasks */}
              {completedTasks.length > 0 && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground mb-2">
                    Klara ({completedTasks.length})
                  </p>
                  {completedTasks.map(task => (
                    <PackingTaskItem
                      key={task.id}
                      task={task}
                      onToggle={() => handleToggleComplete(task)}
                      onClick={() => setSelectedTask(task)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>

        <AddPackingTaskDialog
          open={isAddOpen}
          onOpenChange={setIsAddOpen}
          onSubmit={(task) => {
            onAddTask(task);
            setIsAddOpen(false);
          }}
        />
      </Card>

      <PackingTaskDetailSheet
        task={selectedTask}
        open={!!selectedTask}
        onOpenChange={(open) => !open && setSelectedTask(null)}
        onUpdateTask={onUpdateTask}
        onDeleteTask={onDeleteTask}
      />
    </>
  );
};

export default PackingTaskList;
