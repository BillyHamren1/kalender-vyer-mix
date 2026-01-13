import { useState } from "react";
import { Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProjectTask } from "@/types/project";
import ProjectTaskItem from "./ProjectTaskItem";
import AddTaskDialog from "./AddTaskDialog";

interface ProjectTaskListProps {
  tasks: ProjectTask[];
  onAddTask: (task: { title: string; description?: string; assigned_to?: string | null; deadline?: string | null }) => void;
  onUpdateTask: (data: { id: string; updates: Partial<ProjectTask> }) => void;
  onDeleteTask: (id: string) => void;
}

const ProjectTaskList = ({ tasks, onAddTask, onUpdateTask, onDeleteTask }: ProjectTaskListProps) => {
  const [isAddOpen, setIsAddOpen] = useState(false);

  const incompleteTasks = tasks.filter(t => !t.completed);
  const completedTasks = tasks.filter(t => t.completed);

  const handleToggleComplete = (task: ProjectTask) => {
    onUpdateTask({ id: task.id, updates: { completed: !task.completed } });
  };

  return (
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
            {incompleteTasks.map(task => (
              <ProjectTaskItem
                key={task.id}
                task={task}
                onToggle={() => handleToggleComplete(task)}
                onDelete={() => onDeleteTask(task.id)}
              />
            ))}
            
            {completedTasks.length > 0 && (
              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-2">
                  Klara ({completedTasks.length})
                </p>
                {completedTasks.map(task => (
                  <ProjectTaskItem
                    key={task.id}
                    task={task}
                    onToggle={() => handleToggleComplete(task)}
                    onDelete={() => onDeleteTask(task.id)}
                  />
                ))}
              </div>
            )}
          </>
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
  );
};

export default ProjectTaskList;
