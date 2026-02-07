import { Package, Calendar, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

interface NewPackingJob {
  id: string;
  bookingNumber: string | null;
  client: string;
  rigDate: string | null;
  eventDate: string | null;
  createdAt: string;
  hasPacking: boolean;
}

interface NewPackingJobsCardProps {
  jobs: NewPackingJob[];
  isLoading: boolean;
  onCreatePacking: (bookingId: string, client: string) => void;
}

const NewPackingJobsCard = ({ jobs, isLoading, onCreatePacking }: NewPackingJobsCardProps) => {
  const navigate = useNavigate();

  const jobsWithoutPacking = jobs.filter(j => !j.hasPacking);

  return (
    <div className="h-full rounded-2xl border border-border/40 shadow-2xl bg-card overflow-hidden">
      <div className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shadow-md shadow-warehouse/15"
              style={{ background: 'linear-gradient(135deg, hsl(38 92% 55%) 0%, hsl(32 95% 40%) 100%)' }}
            >
              <Eye className="w-4.5 h-4.5 text-white" />
            </div>
            <h3 className="font-semibold text-lg text-[hsl(var(--heading))]">Nya packningsjobb</h3>
          </div>
          {jobsWithoutPacking.length > 0 && (
            <Badge variant="secondary" className="bg-warehouse/10 text-warehouse">
              {jobsWithoutPacking.length} nya
            </Badge>
          )}
        </div>
      </div>
      <div className="px-0">
        {isLoading ? (
          <div className="px-5 pb-5 space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : jobsWithoutPacking.length === 0 ? (
          <p className="text-[0.925rem] text-muted-foreground text-center py-6 px-4">
            Inga nya jobb att packa
          </p>
        ) : (
          <ScrollArea className="h-[280px]">
            <div className="px-5 pb-5 space-y-2">
              {jobsWithoutPacking.slice(0, 10).map((job) => (
                <div
                  key={job.id}
                  className="p-4 rounded-xl border border-border/30 bg-background/60 backdrop-blur-sm"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className="text-xs font-mono bg-warehouse/10 text-warehouse border-warehouse/30">
                          #{job.bookingNumber || '—'}
                        </Badge>
                      </div>
                      <h4 className="font-medium text-sm truncate">{job.client}</h4>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {job.rigDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Rigg: {format(parseISO(job.rigDate), 'd/M', { locale: sv })}
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 border-warehouse/30 text-warehouse hover:bg-warehouse/10"
                      onClick={() => onCreatePacking(job.id, job.client)}
                    >
                      <Package className="w-3 h-3 mr-1" />
                      Skapa packning
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
};

export default NewPackingJobsCard;
