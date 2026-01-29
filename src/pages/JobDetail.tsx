import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Briefcase, Calendar, MapPin, ArrowLeft, Users, Plus, X, 
  ExternalLink, Building
} from 'lucide-react';
import { 
  fetchJobById, 
  updateJobStatus, 
  addStaffToJob, 
  removeStaffFromJob 
} from '@/services/jobService';
import { fetchStaffMembers } from '@/services/staffService';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import MainSystemLayout from '@/components/layouts/MainSystemLayout';

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

const JobDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedStaffId, setSelectedStaffId] = React.useState<string>('');
  const [selectedDate, setSelectedDate] = React.useState<string>('');

  const { data: job, isLoading } = useQuery({
    queryKey: ['job', id],
    queryFn: () => fetchJobById(id!),
    enabled: !!id
  });

  const { data: allStaff = [] } = useQuery({
    queryKey: ['staff-members'],
    queryFn: fetchStaffMembers
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => updateJobStatus(id!, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', id] });
      toast.success('Status uppdaterad');
    }
  });

  const addStaffMutation = useMutation({
    mutationFn: () => addStaffToJob(id!, selectedStaffId, selectedDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', id] });
      setSelectedStaffId('');
      setSelectedDate('');
      toast.success('Personal tillagd');
    }
  });

  const removeStaffMutation = useMutation({
    mutationFn: (assignmentId: string) => removeStaffFromJob(assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', id] });
      toast.success('Personal borttagen');
    }
  });

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), 'd MMMM yyyy', { locale: sv });
    } catch {
      return dateStr;
    }
  };

  // Get available dates from booking
  const getAvailableDates = () => {
    if (!job?.booking) return [];
    const dates: { date: string; label: string }[] = [];
    if (job.booking.rigDayDate) {
      dates.push({ date: job.booking.rigDayDate, label: `Rigg - ${formatDate(job.booking.rigDayDate)}` });
    }
    if (job.booking.eventDate) {
      dates.push({ date: job.booking.eventDate, label: `Event - ${formatDate(job.booking.eventDate)}` });
    }
    if (job.booking.rigDownDate) {
      dates.push({ date: job.booking.rigDownDate, label: `Nedmontering - ${formatDate(job.booking.rigDownDate)}` });
    }
    return dates;
  };

  if (isLoading) {
    return (
      <MainSystemLayout>
        <div className="container mx-auto p-6 max-w-4xl">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="h-40" />
        </div>
      </MainSystemLayout>
    );
  }

  if (!job) {
    return (
      <MainSystemLayout>
        <div className="container mx-auto p-6 max-w-4xl text-center">
          <p className="text-muted-foreground">Jobbet kunde inte hittas</p>
          <Button onClick={() => navigate('/jobs')} className="mt-4">
            Tillbaka till jobb
          </Button>
        </div>
      </MainSystemLayout>
    );
  }

  const availableDates = getAvailableDates();

  return (
    <MainSystemLayout>
      <div className="container mx-auto p-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
                <h1 className="text-xl font-bold">{job.name}</h1>
              </div>
            </div>
          </div>
          <Select 
            value={job.status} 
            onValueChange={(value) => statusMutation.mutate(value)}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="planned">Planerat</SelectItem>
              <SelectItem value="in_progress">Pågående</SelectItem>
              <SelectItem value="completed">Avslutat</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Booking Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building className="h-4 w-4" />
                Bokningsinformation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {job.booking ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Kund</span>
                    <span className="font-medium">{job.booking.client}</span>
                  </div>
                  {job.booking.bookingNumber && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Bokningsnr</span>
                      <Badge variant="outline">#{job.booking.bookingNumber}</Badge>
                    </div>
                  )}
                  {job.booking.deliveryAddress && (
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm text-muted-foreground shrink-0">Adress</span>
                      <span className="text-right text-sm">{job.booking.deliveryAddress}</span>
                    </div>
                  )}
                  <div className="pt-2 border-t">
                    <h4 className="text-sm font-medium mb-2">Datum</h4>
                    <div className="space-y-1 text-sm">
                      {job.booking.rigDayDate && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Rigg</span>
                          <span>{formatDate(job.booking.rigDayDate)}</span>
                        </div>
                      )}
                      {job.booking.eventDate && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Event</span>
                          <span>{formatDate(job.booking.eventDate)}</span>
                        </div>
                      )}
                      {job.booking.rigDownDate && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Nedmontering</span>
                          <span>{formatDate(job.booking.rigDownDate)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full mt-2"
                    onClick={() => navigate(`/booking/${job.bookingId}`)}
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                    Visa bokning
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Ingen bokning kopplad</p>
              )}
            </CardContent>
          </Card>

          {/* Staff Assignments */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" />
                Tilldelad personal
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Current assignments */}
              <div className="space-y-2 mb-4">
                {job.staffAssignments && job.staffAssignments.length > 0 ? (
                  job.staffAssignments.map(assignment => (
                    <div 
                      key={assignment.id}
                      className="flex items-center justify-between p-2 rounded-lg border"
                    >
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: assignment.staffColor || '#E3F2FD' }}
                        />
                        <span className="font-medium text-sm">{assignment.staffName}</span>
                        <Badge variant="outline" className="text-xs">
                          {formatDate(assignment.assignmentDate)}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removeStaffMutation.mutate(assignment.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Ingen personal tilldelad ännu
                  </p>
                )}
              </div>

              {/* Add staff form */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-3">Lägg till personal</h4>
                <div className="space-y-2">
                  <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Välj personal..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allStaff.filter((s: any) => s.is_active !== false).map((staff: any) => (
                        <SelectItem key={staff.id} value={staff.id}>
                          {staff.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedDate} onValueChange={setSelectedDate}>
                    <SelectTrigger>
                      <SelectValue placeholder="Välj datum..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableDates.map(d => (
                        <SelectItem key={d.date} value={d.date}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button 
                    className="w-full" 
                    size="sm"
                    disabled={!selectedStaffId || !selectedDate}
                    onClick={() => addStaffMutation.mutate()}
                  >
                    <Plus className="w-4 h-4 mr-1.5" />
                    Lägg till
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainSystemLayout>
  );
};

export default JobDetail;
