import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Briefcase, Calendar, MapPin, Users, Trash2 } from 'lucide-react';
import { Job } from '@/types/job';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface JobCardProps {
  job: Job;
  onClick: () => void;
  onDelete: () => void;
}

const statusLabels: Record<string, string> = {
  planned: 'Planerat',
  in_progress: 'Pågående',
  completed: 'Avslutat'
};

const statusColors: Record<string, string> = {
  planned: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800'
};

const JobCard: React.FC<JobCardProps> = ({ job, onClick, onDelete }) => {
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return null;
    try {
      return format(new Date(dateStr), 'd MMM', { locale: sv });
    } catch {
      return dateStr;
    }
  };

  return (
    <Card 
      className="group cursor-pointer hover:shadow-md transition-all border-l-4 border-l-primary/50"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Briefcase className="w-4 h-4 text-primary shrink-0" />
              <h3 className="font-medium truncate">{job.name}</h3>
            </div>
            
            <div className="flex items-center gap-2 mb-2">
              <Badge className={cn("text-xs", statusColors[job.status])}>
                {statusLabels[job.status]}
              </Badge>
              {job.booking?.bookingNumber && (
                <span className="text-xs text-muted-foreground">
                  #{job.booking.bookingNumber}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {job.booking?.eventDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDate(job.booking.eventDate)}
                </span>
              )}
              {job.staffAssignments && job.staffAssignments.length > 0 && (
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {job.staffAssignments.length}
                </span>
              )}
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default JobCard;
