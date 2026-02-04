import { Package, Calendar, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Eye className="w-4 h-4 text-warehouse" />
            Nya packningsjobb
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const jobsWithoutPacking = jobs.filter(j => !j.hasPacking);

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Eye className="w-4 h-4 text-warehouse" />
            Nya packningsjobb
          </CardTitle>
          {jobsWithoutPacking.length > 0 && (
            <Badge variant="secondary" className="bg-warehouse/10 text-warehouse">
              {jobsWithoutPacking.length} nya
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {jobsWithoutPacking.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6 px-4">
            Inga nya jobb att packa
          </p>
        ) : (
          <ScrollArea className="h-[280px]">
            <div className="px-4 pb-4 space-y-2">
              {jobsWithoutPacking.slice(0, 10).map((job) => (
                <div
                  key={job.id}
                  className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
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
      </CardContent>
    </Card>
  );
};

export default NewPackingJobsCard;
