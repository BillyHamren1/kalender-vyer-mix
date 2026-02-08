import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Briefcase, Search, Calendar, Users, Trash2, ChevronRight } from 'lucide-react';
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

interface JobsListPanelProps {
  completedOnly?: boolean;
}

const JobsListPanel = ({ completedOnly = false }: JobsListPanelProps) => {
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
    const matchesStatus = statusFilter === 'all'
      ? (completedOnly ? job.status === 'completed' : job.status !== 'completed')
      : job.status === statusFilter;
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
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
      {/* Compact header */}
      <div className="px-4 py-3 border-b border-border/40 bg-muted/20">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Briefcase className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-foreground">Projekt litet</h3>
              <p className="text-[11px] text-muted-foreground leading-none mt-0.5">Enkel struktur</p>
            </div>
          </div>
          <Badge variant="secondary" className="h-5 px-2 text-xs font-medium bg-muted/80">
            {filteredJobs.length}
          </Badge>
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
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as JobStatus | 'all')}>
            <SelectTrigger className="h-8 w-[110px] text-xs bg-card border-border/50 rounded-lg">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla</SelectItem>
              {Object.entries(JOB_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Jobs List - compact */}
      <div className="max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <div className="p-3 space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-muted/40 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="text-center py-10 px-4">
            <Briefcase className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs font-medium text-muted-foreground">
              {search || statusFilter !== 'all' ? 'Inga projekt hittades' : 'Inga små projekt ännu'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {filteredJobs.map(job => (
              <div
                key={job.id}
                onClick={() => navigate(`/jobs/${job.id}`)}
                className="group/card flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-foreground truncate group-hover/card:text-primary transition-colors">
                    {job.name}
                  </h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    {job.booking?.eventDate && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {formatDate(job.booking.eventDate)}
                      </span>
                    )}
                    {job.staffAssignments && job.staffAssignments.length > 0 && (
                      <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                        <Users className="w-3 h-3" />
                        {job.staffAssignments.length}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => handleDelete(e, job.id)}
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
  );
};

export default JobsListPanel;
