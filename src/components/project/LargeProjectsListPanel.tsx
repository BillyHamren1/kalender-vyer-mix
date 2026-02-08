import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Building2, Search, Plus, Trash2, MapPin, Calendar, Users, ChevronRight } from 'lucide-react';
import { fetchLargeProjects, createLargeProject, deleteLargeProject } from '@/services/largeProjectService';
import { toast } from 'sonner';
import { LargeProjectStatus, LARGE_PROJECT_STATUS_LABELS, LARGE_PROJECT_STATUS_COLORS } from '@/types/largeProject';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

interface LargeProjectsListPanelProps {
  completedOnly?: boolean;
}

const LargeProjectsListPanel = ({ completedOnly = false }: LargeProjectsListPanelProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LargeProjectStatus | 'all'>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectLocation, setNewProjectLocation] = useState('');

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['large-projects'],
    queryFn: fetchLargeProjects
  });

  const createMutation = useMutation({
    mutationFn: () => createLargeProject({ 
      name: newProjectName,
      location: newProjectLocation || undefined
    }),
    onSuccess: (newProject) => {
      queryClient.invalidateQueries({ queryKey: ['large-projects'] });
      toast.success('Stort projekt skapat');
      setIsCreateOpen(false);
      setNewProjectName('');
      setNewProjectLocation('');
      navigate(`/large-project/${newProject.id}`);
    },
    onError: () => toast.error('Kunde inte skapa projekt')
  });

  const deleteMutation = useMutation({
    mutationFn: deleteLargeProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['large-projects'] });
      toast.success('Projekt borttaget');
    },
    onError: () => toast.error('Kunde inte ta bort projekt')
  });

  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(search.toLowerCase()) ||
      project.location?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all'
      ? (completedOnly ? project.status === 'completed' : project.status !== 'completed')
      : project.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleDelete = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (confirm('Är du säker på att du vill ta bort detta stora projekt?')) {
      deleteMutation.mutate(projectId);
    }
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return null;
    try {
      return format(new Date(dateStr), 'd MMM', { locale: sv });
    } catch {
      return dateStr;
    }
  };

  return (
    <>
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
        {/* Compact header */}
        <div className="px-4 py-3 border-b border-border/40 bg-muted/20">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-foreground">Projekt stort</h3>
                <p className="text-[11px] text-muted-foreground leading-none mt-0.5">Flera bokningar</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="h-5 px-2 text-xs font-medium bg-muted/80">
                {filteredProjects.length}
              </Badge>
              <Button 
                size="sm" 
                onClick={() => setIsCreateOpen(true)}
                className="h-6 w-6 p-0 rounded-md"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Compact inline filters */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              <Input
                placeholder="Sök..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs bg-card border-border/50 rounded-lg"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as LargeProjectStatus | 'all')}>
              <SelectTrigger className="h-8 w-[110px] text-xs bg-card border-border/50 rounded-lg">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla</SelectItem>
                {Object.entries(LARGE_PROJECT_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Projects List - compact */}
        <div className="max-h-[400px] overflow-y-auto">
          {isLoading ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-muted/40 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-10 px-4">
              <Building2 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs font-medium text-muted-foreground">
                {search || statusFilter !== 'all' ? 'Inga projekt hittades' : 'Inga stora projekt ännu'}
              </p>
            </div>
          ) : (
          <div className="p-2 space-y-1.5">
              {filteredProjects.map(project => (
                <div
                  key={project.id}
                  onClick={() => navigate(`/large-project/${project.id}`)}
                  className="group/card flex items-center gap-3 px-3 py-2.5 cursor-pointer rounded-lg border border-border/40 bg-muted/15 hover:bg-muted/40 hover:border-primary/30 transition-all border-l-[3px] border-l-primary/40"
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-foreground truncate group-hover/card:text-primary transition-colors">
                      {project.name}
                    </h4>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                        <Users className="w-3 h-3" />
                        {project.bookingCount || 0} bokningar
                      </span>
                      {project.location && (
                        <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground truncate max-w-[100px]">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {project.location}
                        </span>
                      )}
                      {project.start_date && (
                        <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          {formatDate(project.start_date)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => handleDelete(e, project.id)}
                      className="p-1 rounded opacity-0 group-hover/card:opacity-100 transition-opacity hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                    </button>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover/card:text-primary/50 transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              Nytt stort projekt
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Projektnamn *</Label>
              <Input
                id="project-name"
                placeholder="T.ex. Stockholmsmässan 2026"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-location">Plats (valfritt)</Label>
              <Input
                id="project-location"
                placeholder="T.ex. Älvsjömässan"
                value={newProjectLocation}
                onChange={(e) => setNewProjectLocation(e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)} className="rounded-xl">
              Avbryt
            </Button>
            <Button 
              onClick={() => createMutation.mutate()}
              disabled={!newProjectName.trim() || createMutation.isPending}
              className="rounded-xl"
            >
              Skapa projekt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default LargeProjectsListPanel;
