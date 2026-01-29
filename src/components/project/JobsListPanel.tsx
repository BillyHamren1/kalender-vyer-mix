import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Briefcase, Search } from 'lucide-react';
import { fetchJobs, deleteJob } from '@/services/jobService';
import JobCard from './JobCard';
import { toast } from 'sonner';
import { useState } from 'react';

const JobsListPanel = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

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

  const filteredJobs = jobs.filter(job => 
    job.name.toLowerCase().includes(search.toLowerCase()) ||
    job.booking?.client?.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = (jobId: string) => {
    if (confirm('Är du säker på att du vill ta bort detta jobb?')) {
      deleteMutation.mutate(jobId);
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Jobb</CardTitle>
          </div>
          <Badge variant="outline">{jobs.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Sök jobb..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
          {isLoading ? (
            <>
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </>
          ) : filteredJobs.length === 0 ? (
            <div className="text-center py-8">
              <Briefcase className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {search ? 'Inga jobb hittades' : 'Inga jobb skapade ännu'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Skapa jobb från inkommande bokningar ovan
              </p>
            </div>
          ) : (
            filteredJobs.map(job => (
              <JobCard
                key={job.id}
                job={job}
                onClick={() => navigate(`/jobs/${job.id}`)}
                onDelete={() => handleDelete(job.id)}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default JobsListPanel;
