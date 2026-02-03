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
  ExternalLink, Building, Phone, Mail, User, Package, FileText,
  Truck, Clock, ChevronDown, ChevronRight
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { JobBookingProduct } from '@/types/job';

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

// Helper to check if a product is an accessory
const isAccessory = (productName: string): boolean => {
  return productName.startsWith('└') || productName.startsWith('L,') || productName.startsWith('└,');
};

// Group products with their accessories
const groupProducts = (products: JobBookingProduct[]): { parent: JobBookingProduct; accessories: JobBookingProduct[] }[] => {
  const groups: { parent: JobBookingProduct; accessories: JobBookingProduct[] }[] = [];
  let currentGroup: { parent: JobBookingProduct; accessories: JobBookingProduct[] } | null = null;

  products.forEach((product) => {
    if (isAccessory(product.name)) {
      if (currentGroup) {
        currentGroup.accessories.push(product);
      }
    } else {
      if (currentGroup) {
        groups.push(currentGroup);
      }
      currentGroup = { parent: product, accessories: [] };
    }
  });

  if (currentGroup) {
    groups.push(currentGroup);
  }

  return groups;
};

const JobDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedStaffId, setSelectedStaffId] = React.useState<string>('');
  const [selectedDate, setSelectedDate] = React.useState<string>('');
  const [openProducts, setOpenProducts] = React.useState<Set<string>>(new Set());

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

  const formatTime = (timeStr: string | null | undefined) => {
    if (!timeStr) return null;
    return timeStr.substring(0, 5);
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

  const toggleProduct = (productId: string) => {
    setOpenProducts(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/projects');
    }
  };

  if (isLoading) {
    return (
      <MainSystemLayout>
        <div className="h-screen flex flex-col bg-muted/30 overflow-hidden">
          <div className="bg-white border-b border-gray-200 px-6 py-4">
            <Skeleton className="h-8 w-48" />
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-6xl mx-auto">
              <Skeleton className="h-40 mb-6" />
              <Skeleton className="h-40" />
            </div>
          </div>
        </div>
      </MainSystemLayout>
    );
  }

  if (!job) {
    return (
      <MainSystemLayout>
        <div className="container mx-auto p-6 max-w-4xl text-center">
          <p className="text-muted-foreground">Jobbet kunde inte hittas</p>
          <Button onClick={() => navigate('/projects')} className="mt-4">
            Tillbaka till projekthantering
          </Button>
        </div>
      </MainSystemLayout>
    );
  }

  const availableDates = getAvailableDates();
  const fullBooking = job.fullBooking;
  const groupedProducts = fullBooking?.products ? groupProducts(fullBooking.products) : [];

  return (
    <MainSystemLayout>
      <div className="h-screen flex flex-col bg-muted/30 overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between max-w-6xl mx-auto">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={handleBack}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
                <h1 className="text-xl font-bold">{job.name}</h1>
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
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Two column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column */}
              <div className="space-y-6">
                {/* Client Info */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <User className="h-4 w-4" />
                      Kundinformation
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {fullBooking ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Kund</span>
                          <span className="font-medium">{fullBooking.client}</span>
                        </div>
                        {fullBooking.booking_number && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Bokningsnr</span>
                            <Badge variant="outline">#{fullBooking.booking_number}</Badge>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Ingen bokning kopplad</p>
                    )}
                  </CardContent>
                </Card>

                {/* Delivery Info */}
                {fullBooking && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Truck className="h-4 w-4" />
                        Leveransinformation
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {fullBooking.deliveryaddress && (
                        <div className="space-y-1">
                          <span className="text-sm text-muted-foreground">Adress</span>
                          <p className="font-medium">{fullBooking.deliveryaddress}</p>
                          {(fullBooking.delivery_postal_code || fullBooking.delivery_city) && (
                            <p className="text-sm text-muted-foreground">
                              {fullBooking.delivery_postal_code} {fullBooking.delivery_city}
                            </p>
                          )}
                        </div>
                      )}
                      
                      {(fullBooking.contact_name || fullBooking.contact_phone || fullBooking.contact_email) && (
                        <div className="pt-3 border-t space-y-2">
                          <span className="text-sm font-medium">Kontaktperson</span>
                          {fullBooking.contact_name && (
                            <div className="flex items-center gap-2">
                              <User className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm">{fullBooking.contact_name}</span>
                            </div>
                          )}
                          {fullBooking.contact_phone && (
                            <div className="flex items-center gap-2">
                              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                              <a href={`tel:${fullBooking.contact_phone}`} className="text-sm text-primary hover:underline">
                                {fullBooking.contact_phone}
                              </a>
                            </div>
                          )}
                          {fullBooking.contact_email && (
                            <div className="flex items-center gap-2">
                              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                              <a href={`mailto:${fullBooking.contact_email}`} className="text-sm text-primary hover:underline">
                                {fullBooking.contact_email}
                              </a>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Logistics info */}
                      {(fullBooking.carry_more_than_10m || fullBooking.ground_nails_allowed !== null || fullBooking.exact_time_needed) && (
                        <div className="pt-3 border-t space-y-2">
                          <span className="text-sm font-medium">Logistik</span>
                          <div className="space-y-1 text-sm">
                            {fullBooking.carry_more_than_10m && (
                              <p className="text-muted-foreground">• Bärning över 10m</p>
                            )}
                            {fullBooking.ground_nails_allowed && (
                              <p className="text-muted-foreground">• Markspik tillåtet</p>
                            )}
                            {fullBooking.exact_time_needed && (
                              <p className="text-muted-foreground">
                                • Exakt tid krävs{fullBooking.exact_time_info && `: ${fullBooking.exact_time_info}`}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Staff Assignments */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Users className="h-4 w-4" />
                      Tilldelad personal
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
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

              {/* Right Column */}
              <div className="space-y-6">
                {/* Schedule/Dates */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Calendar className="h-4 w-4" />
                      Schema
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {fullBooking?.rigdaydate && (
                      <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-green-600 text-white text-xs">RIGG</Badge>
                          <span className="text-sm font-medium text-green-800">Montering</span>
                          {(fullBooking.rig_start_time || fullBooking.rig_end_time) && (
                            <span className="text-xs text-green-600 ml-2">
                              <Clock className="h-3 w-3 inline mr-1" />
                              {formatTime(fullBooking.rig_start_time)}{fullBooking.rig_end_time && ` - ${formatTime(fullBooking.rig_end_time)}`}
                            </span>
                          )}
                        </div>
                        <span className="text-sm font-medium text-green-700">{formatDate(fullBooking.rigdaydate)}</span>
                      </div>
                    )}
                    {fullBooking?.eventdate && (
                      <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-yellow-600 text-white text-xs">EVENT</Badge>
                          <span className="text-sm font-medium text-yellow-800">Eventdag</span>
                          {(fullBooking.event_start_time || fullBooking.event_end_time) && (
                            <span className="text-xs text-yellow-600 ml-2">
                              <Clock className="h-3 w-3 inline mr-1" />
                              {formatTime(fullBooking.event_start_time)}{fullBooking.event_end_time && ` - ${formatTime(fullBooking.event_end_time)}`}
                            </span>
                          )}
                        </div>
                        <span className="text-sm font-medium text-yellow-700">{formatDate(fullBooking.eventdate)}</span>
                      </div>
                    )}
                    {fullBooking?.rigdowndate && (
                      <div className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-red-600 text-white text-xs">NEDMONT</Badge>
                          <span className="text-sm font-medium text-red-800">Demontering</span>
                          {(fullBooking.rigdown_start_time || fullBooking.rigdown_end_time) && (
                            <span className="text-xs text-red-600 ml-2">
                              <Clock className="h-3 w-3 inline mr-1" />
                              {formatTime(fullBooking.rigdown_start_time)}{fullBooking.rigdown_end_time && ` - ${formatTime(fullBooking.rigdown_end_time)}`}
                            </span>
                          )}
                        </div>
                        <span className="text-sm font-medium text-red-700">{formatDate(fullBooking.rigdowndate)}</span>
                      </div>
                    )}
                    {!fullBooking?.rigdaydate && !fullBooking?.eventdate && !fullBooking?.rigdowndate && (
                      <p className="text-sm text-muted-foreground text-center py-4">Inga datum satta</p>
                    )}
                    
                    {job.bookingId && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full mt-3"
                        onClick={() => navigate(`/booking/${job.bookingId}`)}
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                        Visa fullständig bokning
                      </Button>
                    )}
                  </CardContent>
                </Card>

                {/* Products */}
                {fullBooking && fullBooking.products && fullBooking.products.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Package className="h-4 w-4" />
                        Produkter ({fullBooking.products.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1">
                        {groupedProducts.map((group) => (
                          <div key={group.parent.id}>
                            {group.accessories.length > 0 ? (
                              <Collapsible
                                open={openProducts.has(group.parent.id)}
                                onOpenChange={() => toggleProduct(group.parent.id)}
                              >
                                <CollapsibleTrigger asChild>
                                  <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      {openProducts.has(group.parent.id) ? (
                                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                      )}
                                      <span className="text-sm truncate">{group.parent.name}</span>
                                      <Badge variant="secondary" className="text-xs shrink-0">
                                        {group.parent.quantity} st
                                      </Badge>
                                      {!openProducts.has(group.parent.id) && (
                                        <Badge variant="outline" className="text-xs shrink-0">
                                          +{group.accessories.length}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div className="ml-6 space-y-1 border-l-2 border-muted pl-3 py-1">
                                    {group.accessories.map((acc) => (
                                      <div key={acc.id} className="flex items-center justify-between p-1.5 text-sm">
                                        <span className="text-muted-foreground truncate">
                                          {acc.name.replace(/^[└L],?\s*/, '')}
                                        </span>
                                        <Badge variant="outline" className="text-xs shrink-0">
                                          {acc.quantity} st
                                        </Badge>
                                      </div>
                                    ))}
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            ) : (
                              <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <div className="w-4" />
                                  <span className="text-sm truncate">{group.parent.name}</span>
                                </div>
                                <Badge variant="secondary" className="text-xs shrink-0">
                                  {group.parent.quantity} st
                                </Badge>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Attachments */}
                {fullBooking && fullBooking.attachments && fullBooking.attachments.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <FileText className="h-4 w-4" />
                        Bilagor ({fullBooking.attachments.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {fullBooking.attachments.map((attachment) => (
                          <a
                            key={attachment.id}
                            href={attachment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 text-sm"
                          >
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="truncate text-primary hover:underline">
                              {attachment.fileName || 'Bilaga'}
                            </span>
                          </a>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Internal Notes */}
                {fullBooking && fullBooking.internalnotes && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <FileText className="h-4 w-4" />
                        Interna anteckningar
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap">{fullBooking.internalnotes}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainSystemLayout>
  );
};

export default JobDetail;