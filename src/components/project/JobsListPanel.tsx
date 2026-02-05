import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Briefcase, Search, Calendar, Users, Trash2, ArrowUpRight } from 'lucide-react';
import { fetchJobs, deleteJob } from '@/services/jobService';
import { toast } from 'sonner';
import { JobStatus } from '@/types/job';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  planned: 'Planerad',
  in_progress: 'Pågående',
  completed: 'Avslutad'
};

const statusColors: Record<JobStatus, string> = {
  planned: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  in_progress: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
};

const JobsListPanel = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all');

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['jobs'],
    queryFn: fetchJobs
  });

  const deleteMutation = useMutation({
    mutationFn: deleteJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['bookings-without-project'] });
      toast.success('Projekt borttaget');
    },
    onError: () => toast.error('Kunde inte ta bort projekt')
  });

  const filteredJobs = jobs.filter(job => {
    const matchesSearch = job.name.toLowerCase().includes(search.toLowerCase()) ||
      job.booking?.client?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleDelete = (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    if (confirm('Är du säker på att du vill ta bort detta projekt?')) {
      deleteMutation.mutate(jobId);
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
        <div className="h-1.5 bg-gradient-to-r from-primary/40 via-primary/80 to-primary/40" />
        
        {/* Header */}
        <div className="p-5 pb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20">
                <Briefcase className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-foreground">Projekt litet</h3>
                <p className="text-xs text-muted-foreground">Enkel struktur</p>
              </div>
            </div>
            <Badge 
              variant="secondary" 
              className="h-7 px-3 text-sm font-medium bg-muted/80 hover:bg-muted"
            >
              {filteredJobs.length}
            </Badge>
          </div>

          {/* Filters */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <Input
                placeholder="Sök projekt litet..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-10 bg-muted/30 border-muted-foreground/10 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as JobStatus | 'all')}>
              <SelectTrigger className="h-10 bg-muted/30 border-muted-foreground/10 rounded-xl">
                <SelectValue placeholder="Filtrera status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla statusar</SelectItem>
                {Object.entries(JOB_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Jobs List */}
        <div className="px-5 pb-5">
          <div className="max-h-[420px] overflow-y-auto pr-1 space-y-2.5 scrollbar-thin">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-20 bg-muted/50 animate-pulse rounded-xl" />
                ))}
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="text-center py-12 px-4">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-muted/50 flex items-center justify-center">
                  <Briefcase className="h-7 w-7 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">
                  {search || statusFilter !== 'all' 
                    ? 'Inga projekt hittades' 
                    : 'Inga små projekt ännu'}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Skapa från inkommande bokningar
                </p>
              </div>
            ) : (
              filteredJobs.map(job => (
                <div
                  key={job.id}
                  onClick={() => navigate(`/jobs/${job.id}`)}
                  className="group/card relative p-4 rounded-xl cursor-pointer transition-all duration-200 hover:-translate-y-0.5 border border-border bg-card shadow-sm hover:border-primary/50 hover:shadow-md"
                >
                  {/* Hover arrow indicator */}
                  <div className="absolute right-3 top-3 opacity-0 group-hover/card:opacity-100 transition-opacity">
                    <ArrowUpRight className="h-4 w-4 text-primary/60" />
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                      <Briefcase className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0 pr-6">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-foreground truncate group-hover/card:text-primary transition-colors">
                          {job.name}
                        </h4>
                        {job.booking?.bookingNumber && (
                          <span className="text-xs text-muted-foreground/70 shrink-0">
                            #{job.booking.bookingNumber}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={cn("text-xs font-medium", statusColors[job.status])}>
                          {JOB_STATUS_LABELS[job.status]}
                        </Badge>
                        {job.booking?.eventDate && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            {formatDate(job.booking.eventDate)}
                          </span>
                        )}
                        {job.staffAssignments && job.staffAssignments.length > 0 && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="w-3 h-3" />
                            {job.staffAssignments.length}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Delete button */}
                  <button
                    onClick={(e) => handleDelete(e, job.id)}
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
  );
};

export default JobsListPanel;
