import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Building2, Search, Plus, Trash2, MapPin, Calendar, Users, ArrowUpRight } from 'lucide-react';
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
      <div className="relative group">
        {/* Premium card container */}
        <div 
          className="relative rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--card) / 0.95) 100%)',
            boxShadow: '0 4px 24px -4px rgba(0, 0, 0, 0.08), 0 0 0 1px hsl(var(--border) / 0.5)',
          }}
        >
          {/* Gradient accent bar */}
          <div className="h-1.5 bg-gradient-to-r from-primary/80 via-primary to-primary/80" />
          
          {/* Header */}
          <div className="p-5 pb-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-foreground">Projekt stort</h3>
                  <p className="text-xs text-muted-foreground">Flera bokningar</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge 
                  variant="secondary" 
                  className="h-7 px-3 text-sm font-medium bg-muted/80 hover:bg-muted"
                >
                  {filteredProjects.length}
                </Badge>
                <Button 
                  size="sm" 
                  onClick={() => setIsCreateOpen(true)}
                  className="h-8 w-8 p-0 rounded-lg shadow-sm"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Filters */}
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                <Input
                  placeholder="Sök stora projekt..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 h-10 bg-muted/30 border-muted-foreground/10 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as LargeProjectStatus | 'all')}>
                <SelectTrigger className="h-10 bg-muted/30 border-muted-foreground/10 rounded-xl">
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
          </div>

          {/* Projects List */}
          <div className="px-5 pb-5">
            <div className="max-h-[420px] overflow-y-auto pr-1 space-y-2.5 scrollbar-thin">
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-24 bg-muted/50 animate-pulse rounded-xl" />
                  ))}
                </div>
              ) : filteredProjects.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-muted/50 flex items-center justify-center">
                    <Building2 className="h-7 w-7 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {search || statusFilter !== 'all' 
                      ? 'Inga projekt hittades' 
                      : 'Inga stora projekt ännu'}
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Samla flera bokningar under ett paraply
                  </p>
                </div>
              ) : (
                filteredProjects.map(project => (
                  <div
                    key={project.id}
                    onClick={() => navigate(`/large-project/${project.id}`)}
                    className="group/card relative p-4 rounded-xl cursor-pointer transition-all duration-200 hover:-translate-y-0.5 border border-border/50 bg-gradient-to-br from-background to-muted/20 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
                  >
                    {/* Hover arrow indicator */}
                    <div className="absolute right-3 top-3 opacity-0 group-hover/card:opacity-100 transition-opacity">
                      <ArrowUpRight className="h-4 w-4 text-primary/60" />
                    </div>
                    
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                        <Building2 className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0 pr-6">
                        <h4 className="font-medium text-foreground truncate mb-1 group-hover/card:text-primary transition-colors">
                          {project.name}
                        </h4>
                        
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <Badge className={cn("text-xs font-medium", LARGE_PROJECT_STATUS_COLORS[project.status])}>
                            {LARGE_PROJECT_STATUS_LABELS[project.status]}
                          </Badge>
                          <Badge variant="secondary" className="text-xs bg-muted/60">
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
                    </div>
                    
                    {/* Delete button */}
                    <button
                      onClick={(e) => handleDelete(e, project.id)}
                      className="absolute right-3 bottom-3 p-1.5 rounded-lg opacity-0 group-hover/card:opacity-100 transition-all hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive transition-colors" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
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
