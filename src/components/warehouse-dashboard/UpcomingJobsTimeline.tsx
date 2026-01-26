import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Package, Plus } from "lucide-react";
import { format, addDays, startOfDay } from "date-fns";
import { sv } from "date-fns/locale";
import { UpcomingJob } from "@/services/warehouseDashboardService";

interface UpcomingJobsTimelineProps {
  jobs: UpcomingJob[];
  isLoading: boolean;
  onJobClick?: (job: UpcomingJob) => void;
  onCreatePacking?: (job: UpcomingJob) => void;
  onViewPacking?: (packingId: string) => void;
}

// Generate array of next 7 days
const getNext7Days = () => {
  const days = [];
  const today = startOfDay(new Date());
  for (let i = 0; i < 7; i++) {
    days.push(addDays(today, i));
  }
  return days;
};

// Get urgency color based on days until rig
const getUrgencyColor = (daysUntilRig: number): string => {
  if (daysUntilRig < 3) return 'bg-red-100 border-red-300 text-red-800';
  if (daysUntilRig < 5) return 'bg-orange-100 border-orange-300 text-orange-800';
  if (daysUntilRig < 7) return 'bg-yellow-100 border-yellow-300 text-yellow-800';
  return 'bg-muted border-border text-foreground';
};

const UpcomingJobsTimeline = ({ 
  jobs, 
  isLoading, 
  onJobClick,
  onCreatePacking,
  onViewPacking 
}: UpcomingJobsTimelineProps) => {
  const days = getNext7Days();

  // Group jobs by rig date
  const jobsByDate = new Map<string, UpcomingJob[]>();
  jobs.forEach(job => {
    if (job.rigDate) {
      const dateKey = job.rigDate;
      const existing = jobsByDate.get(dateKey) || [];
      existing.push(job);
      jobsByDate.set(dateKey, existing);
    }
  });

  const handleJobClick = (job: UpcomingJob, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onJobClick) {
      onJobClick(job);
    }
  };

  const handlePackingAction = (job: UpcomingJob, e: React.MouseEvent) => {
    e.stopPropagation();
    if (job.hasActivePacking && job.packingId && onViewPacking) {
      onViewPacking(job.packingId);
    } else if (!job.hasActivePacking && onCreatePacking) {
      onCreatePacking(job);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5 text-warehouse" />
            Kommande 7 dagar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            {[1, 2, 3, 4, 5, 6, 7].map(i => (
              <Skeleton key={i} className="h-32 w-40 flex-shrink-0" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarDays className="h-5 w-5 text-warehouse" />
          Kommande 7 dagar
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex gap-3 pb-2">
            {days.map((day, index) => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const dayJobs = jobsByDate.get(dateKey) || [];
              const isToday = index === 0;

              return (
                <div
                  key={dateKey}
                  className={`flex-shrink-0 w-44 rounded-lg border p-3 ${
                    isToday ? 'border-warehouse bg-warehouse/5' : 'border-border bg-card'
                  }`}
                >
                  {/* Day header */}
                  <div className="mb-2">
                    <p className={`text-xs font-medium ${isToday ? 'text-warehouse' : 'text-muted-foreground'}`}>
                      {isToday ? 'Idag' : format(day, 'EEEE', { locale: sv })}
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {format(day, 'd MMM', { locale: sv })}
                    </p>
                  </div>

                  {/* Jobs for this day */}
                  <div className="space-y-2 min-h-[60px]">
                    {dayJobs.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Inga jobb</p>
                    ) : (
                      dayJobs.slice(0, 3).map(job => (
                        <div
                          key={job.id}
                          onClick={(e) => handleJobClick(job, e)}
                          className={`p-2 rounded border cursor-pointer hover:shadow-sm transition-shadow ${getUrgencyColor(job.daysUntilRig)}`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{job.client}</p>
                              {job.bookingNumber && (
                                <p className="text-[10px] opacity-70">#{job.bookingNumber}</p>
                              )}
                            </div>
                            {/* Packing action button */}
                            <button
                              onClick={(e) => handlePackingAction(job, e)}
                              className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors ${
                                job.hasActivePacking 
                                  ? 'bg-green-100 hover:bg-green-200 text-green-700' 
                                  : 'bg-warehouse/10 hover:bg-warehouse/20 text-warehouse'
                              }`}
                              title={job.hasActivePacking ? 'Visa packning' : 'Skapa packning'}
                            >
                              {job.hasActivePacking ? (
                                <Package className="h-3 w-3" />
                              ) : (
                                <Plus className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                            {job.hasActivePacking ? (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-green-50 border-green-200 text-green-700">
                                <Package className="h-2.5 w-2.5 mr-0.5" />
                                Packning
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-muted border-border text-muted-foreground">
                                Ej påbörjad
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                    {dayJobs.length > 3 && (
                      <p className="text-[10px] text-muted-foreground text-center">
                        +{dayJobs.length - 3} till
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default UpcomingJobsTimeline;
