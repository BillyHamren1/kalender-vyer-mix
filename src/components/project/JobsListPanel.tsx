import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Briefcase, Search, ChevronRight } from 'lucide-react';
import { fetchJobs, deleteJob } from '@/services/jobService';
import JobCard from './JobCard';
import { toast } from 'sonner';

const JobsListPanel = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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

  // Sort by updated_at descending and take 5 most recent
  const recentJobs = [...jobs]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  // Filter for dialog
  const filteredJobs = jobs.filter(job => 
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
          <div className="space-y-2">
            {isLoading ? (
              <>
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
              </>
            ) : recentJobs.length === 0 ? (
              <div className="text-center py-8">
                <Briefcase className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Inga jobb skapade ännu
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Skapa jobb från inkommande bokningar ovan
                </p>
              </div>
            ) : (
              <>
                {recentJobs.map(job => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onClick={() => navigate(`/jobs/${job.id}`)}
                    onDelete={() => handleDelete(job.id)}
                  />
                ))}
              </>
            )}
          </div>

          {jobs.length > 5 && (
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => setShowAllDialog(true)}
            >
              Visa alla jobb ({jobs.length})
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          )}
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
              {filteredJobs.length === 0 ? (
                <div className="text-center py-8">
                  <Briefcase className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Inga jobb hittades
                  </p>
                </div>
              ) : (
                filteredJobs.map(job => (
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
