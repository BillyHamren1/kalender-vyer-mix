import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, Plus, Calendar, MapPin } from 'lucide-react';
import { 
  fetchLargeProjects, 
  createLargeProject, 
  addBookingToLargeProject 
} from '@/services/largeProjectService';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

interface AddToLargeProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  bookingClient?: string;
}

export const AddToLargeProjectDialog: React.FC<AddToLargeProjectDialogProps> = ({
  open,
  onOpenChange,
  bookingId,
  bookingClient,
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState('');

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['large-projects'],
    queryFn: fetchLargeProjects,
    enabled: open,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      let projectId = selectedProjectId;
      
      if (mode === 'new') {
        const newProject = await createLargeProject({ name: newProjectName });
        projectId = newProject.id;
      }
      
      if (!projectId) throw new Error('Inget projekt valt');
      
      await addBookingToLargeProject(projectId, bookingId);
      return projectId;
    },
    onSuccess: (projectId) => {
      queryClient.invalidateQueries({ queryKey: ['large-projects'] });
      queryClient.invalidateQueries({ queryKey: ['bookings-without-project'] });
      toast.success('Bokning tillagd i stort projekt');
      onOpenChange(false);
      navigate(`/large-project/${projectId}`);
    },
    onError: () => {
      toast.error('Kunde inte lägga till bokning i projekt');
    },
  });

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return null;
    try {
      return format(new Date(dateStr), 'd MMM', { locale: sv });
    } catch {
      return dateStr;
    }
  };

  const handleSubmit = () => {
    if (mode === 'existing' && !selectedProjectId) {
      toast.error('Välj ett projekt');
      return;
    }
    if (mode === 'new' && !newProjectName.trim()) {
      toast.error('Ange ett projektnamn');
      return;
    }
    addMutation.mutate();
  };

  const resetState = () => {
    setMode('existing');
    setSelectedProjectId(null);
    setNewProjectName('');
  };

  return (
    <Dialog 
      open={open} 
      onOpenChange={(o) => {
        if (!o) resetState();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Lägg till i stort projekt
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {bookingClient && (
            <p className="text-sm text-muted-foreground">
              Bokning: <span className="font-medium text-foreground">{bookingClient}</span>
            </p>
          )}

          {/* Mode selector */}
          <div className="flex gap-2">
            <Button
              variant={mode === 'existing' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('existing')}
              className="flex-1"
            >
              Välj befintligt
            </Button>
            <Button
              variant={mode === 'new' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('new')}
              className="flex-1"
            >
              <Plus className="h-4 w-4 mr-1" />
              Skapa nytt
            </Button>
          </div>

          {mode === 'existing' ? (
            <div className="space-y-2">
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-14" />
                  ))}
                </div>
              ) : projects.length === 0 ? (
                <div className="text-center py-6">
                  <Building2 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Inga stora projekt finns ännu
                  </p>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setMode('new')}
                    className="mt-1"
                  >
                    Skapa ett nytt projekt
                  </Button>
                </div>
              ) : (
                <RadioGroup
                  value={selectedProjectId || ''}
                  onValueChange={setSelectedProjectId}
                  className="space-y-2 max-h-60 overflow-y-auto"
                >
                  {projects.map((project) => (
                    <label
                      key={project.id}
                      className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <RadioGroupItem value={project.id} className="mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{project.name}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          {project.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {project.location}
                            </span>
                          )}
                          {project.start_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(project.start_date)}
                            </span>
                          )}
                          <span>{project.bookingCount || 0} bokningar</span>
                        </div>
                      </div>
                    </label>
                  ))}
                </RadioGroup>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="new-project-name">Projektnamn *</Label>
              <Input
                id="new-project-name"
                placeholder="T.ex. Stockholmsmässan 2026"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                autoFocus
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              addMutation.isPending ||
              (mode === 'existing' && !selectedProjectId) ||
              (mode === 'new' && !newProjectName.trim())
            }
          >
            {addMutation.isPending ? 'Lägger till...' : 'Lägg till'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
