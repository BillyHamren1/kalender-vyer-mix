import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Briefcase, Search, ChevronRight } from 'lucide-react';
import { fetchJobs, deleteJob } from '@/services/jobService';
import JobCard from './JobCard';
import { toast } from 'sonner';
import { JobStatus } from '@/types/job';

const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  planned: 'Planerad',
  in_progress: 'Pågående',
  completed: 'Avslutad'
};

const JobsListPanel = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all');
  const [showAllDialog, setShowAllDialog] = useState(false);
  const [dialogSearch, setDialogSearch] = useState('');

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['jobs'],
    queryFn: fetchJobs
  });

  const deleteMutation = useMutation({
    mutationFn: deleteJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['bookings-without-project'] });
      toast.success('Jobb borttaget');
    },
    onError: () => toast.error('Kunde inte ta bort jobb')
  });

  // Filter jobs
  const filteredJobs = jobs.filter(job => {
    const matchesSearch = job.name.toLowerCase().includes(search.toLowerCase()) ||
      job.booking?.client?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Filter for dialog
  const dialogFilteredJobs = jobs.filter(job => 
    job.name.toLowerCase().includes(dialogSearch.toLowerCase()) ||
    job.booking?.client?.toLowerCase().includes(dialogSearch.toLowerCase())
  );

  const handleDelete = (jobId: string) => {
    if (confirm('Är du säker på att du vill ta bort detta jobb?')) {
      deleteMutation.mutate(jobId);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Jobb</CardTitle>
            </div>
            <Badge variant="outline">{filteredJobs.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters - same as Projects */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Sök jobb..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as JobStatus | 'all')}>
              <SelectTrigger className="w-[160px]">
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

          {/* Job Grid - same as Projects */}
          <div className="max-h-[600px] overflow-y-auto pr-1">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="text-center py-12">
                <Briefcase className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {search || statusFilter !== 'all' 
                    ? 'Inga jobb hittades' 
                    : 'Inga jobb skapade ännu'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Skapa jobb från inkommande bokningar ovan
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredJobs.map(job => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onClick={() => navigate(`/jobs/${job.id}`)}
                    onDelete={() => handleDelete(job.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showAllDialog} onOpenChange={setShowAllDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              Alla jobb ({jobs.length})
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Sök jobb..."
                value={dialogSearch}
                onChange={(e) => setDialogSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {dialogFilteredJobs.length === 0 ? (
                <div className="text-center py-8">
                  <Briefcase className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Inga jobb hittades
                  </p>
                </div>
              ) : (
                dialogFilteredJobs.map(job => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onClick={() => {
                      setShowAllDialog(false);
                      navigate(`/jobs/${job.id}`);
                    }}
                    onDelete={() => handleDelete(job.id)}
                  />
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default JobsListPanel;
