import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Building2, Search, Plus, Trash2, MapPin, Calendar, Users } from 'lucide-react';
import { fetchLargeProjects, createLargeProject, deleteLargeProject } from '@/services/largeProjectService';
import { toast } from 'sonner';
import { LargeProjectStatus, LARGE_PROJECT_STATUS_LABELS, LARGE_PROJECT_STATUS_COLORS } from '@/types/largeProject';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

const LargeProjectsListPanel = () => {
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
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
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
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Projekt stort</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{filteredProjects.length}</Badge>
              <Button size="sm" variant="outline" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Sök stora projekt..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as LargeProjectStatus | 'all')}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Filtrera status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla statusar</SelectItem>
                {Object.entries(LARGE_PROJECT_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Projects List */}
          <div className="max-h-[400px] overflow-y-auto pr-1">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {search || statusFilter !== 'all' 
                    ? 'Inga stora projekt hittades' 
                    : 'Inga stora projekt skapade ännu'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Stora projekt samlar flera bokningar under ett paraply
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredProjects.map(project => (
                  <Card 
                    key={project.id}
                    className="group cursor-pointer hover:shadow-md transition-all border-l-4 border-l-primary"
                    onClick={() => navigate(`/large-project/${project.id}`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Building2 className="w-4 h-4 text-primary shrink-0" />
                            <h3 className="font-medium truncate">{project.name}</h3>
                          </div>
                          
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className={cn("text-xs", LARGE_PROJECT_STATUS_COLORS[project.status])}>
                              {LARGE_PROJECT_STATUS_LABELS[project.status]}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              <Users className="w-3 h-3 mr-1" />
                              {project.bookingCount || 0} bokningar
                            </Badge>
                          </div>

                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {project.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {project.location}
                              </span>
                            )}
                            {project.start_date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {formatDate(project.start_date)}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => handleDelete(e, project.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
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
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-location">Plats (valfritt)</Label>
              <Input
                id="project-location"
                placeholder="T.ex. Älvsjömässan"
                value={newProjectLocation}
                onChange={(e) => setNewProjectLocation(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Avbryt
            </Button>
            <Button 
              onClick={() => createMutation.mutate()}
              disabled={!newProjectName.trim() || createMutation.isPending}
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
