import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  Building2, ArrowLeft, Plus, MapPin, Calendar, Users, 
  FileText, MessageSquare, Wallet, Trash2, Search, Package
} from 'lucide-react';
import { 
  fetchLargeProject, 
  updateLargeProject,
  addBookingToLargeProject,
  removeBookingFromLargeProject,
  fetchAvailableBookingsForLargeProject
} from '@/services/largeProjectService';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import MainSystemLayout from '@/components/layouts/MainSystemLayout';
import { LargeProjectStatus, LARGE_PROJECT_STATUS_LABELS, LARGE_PROJECT_STATUS_COLORS } from '@/types/largeProject';
import { cn } from '@/lib/utils';

const LargeProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');
  const [isAddBookingOpen, setIsAddBookingOpen] = useState(false);
  const [bookingSearch, setBookingSearch] = useState('');

  const { data: project, isLoading } = useQuery({
    queryKey: ['large-project', id],
    queryFn: () => fetchLargeProject(id!),
    enabled: !!id
  });

  const { data: availableBookings = [] } = useQuery({
    queryKey: ['available-bookings-for-large-project'],
    queryFn: fetchAvailableBookingsForLargeProject,
    enabled: isAddBookingOpen
  });

  const statusMutation = useMutation({
    mutationFn: (status: LargeProjectStatus) => updateLargeProject(id!, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['large-project', id] });
      toast.success('Status uppdaterad');
    }
  });

  const addBookingMutation = useMutation({
    mutationFn: (bookingId: string) => addBookingToLargeProject(id!, bookingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['large-project', id] });
      queryClient.invalidateQueries({ queryKey: ['available-bookings-for-large-project'] });
      toast.success('Bokning tillagd');
    }
  });

  const removeBookingMutation = useMutation({
    mutationFn: (bookingId: string) => removeBookingFromLargeProject(id!, bookingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['large-project', id] });
      queryClient.invalidateQueries({ queryKey: ['available-bookings-for-large-project'] });
      toast.success('Bokning borttagen');
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

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/projects');
    }
  };

  const filteredAvailableBookings = availableBookings.filter(b => 
    b.client.toLowerCase().includes(bookingSearch.toLowerCase()) ||
    b.booking_number?.toLowerCase().includes(bookingSearch.toLowerCase()) ||
    b.deliveryaddress?.toLowerCase().includes(bookingSearch.toLowerCase())
  );

  if (isLoading) {
    return (
      <MainSystemLayout>
        <div className="h-screen flex flex-col bg-muted/30 overflow-hidden">
          <div className="bg-background border-b px-6 py-4">
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

  if (!project) {
    return (
      <MainSystemLayout>
        <div className="container mx-auto p-6 max-w-4xl text-center">
          <p className="text-muted-foreground">Projektet kunde inte hittas</p>
          <Button onClick={() => navigate('/projects')} className="mt-4">
            Tillbaka till projekthantering
          </Button>
        </div>
      </MainSystemLayout>
    );
  }

  return (
    <MainSystemLayout>
      <div className="h-screen flex flex-col bg-muted/30 overflow-hidden">
        {/* Header */}
        <div className="bg-background border-b px-6 py-4">
          <div className="flex items-center justify-between max-w-6xl mx-auto">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={handleBack}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <h1 className="text-xl font-bold">{project.name}</h1>
                <Badge className={cn("ml-2", LARGE_PROJECT_STATUS_COLORS[project.status])}>
                  {LARGE_PROJECT_STATUS_LABELS[project.status]}
                </Badge>
              </div>
            </div>
            <Select 
              value={project.status} 
              onValueChange={(value) => statusMutation.mutate(value as LargeProjectStatus)}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LARGE_PROJECT_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tabs Navigation */}
        <div className="bg-background border-b px-6">
          <div className="max-w-6xl mx-auto">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="h-12 bg-transparent p-0 gap-6">
                <TabsTrigger 
                  value="overview" 
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-12 px-0"
                >
                  <Package className="w-4 h-4 mr-2" />
                  Översikt
                </TabsTrigger>
                <TabsTrigger 
                  value="bookings"
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-12 px-0"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Bokningar ({project.bookingCount})
                </TabsTrigger>
                <TabsTrigger 
                  value="economy"
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-12 px-0"
                >
                  <Wallet className="w-4 h-4 mr-2" />
                  Ekonomi
                </TabsTrigger>
                <TabsTrigger 
                  value="files"
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-12 px-0"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Filer
                </TabsTrigger>
                <TabsTrigger 
                  value="comments"
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-12 px-0"
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Kommentarer
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto">
            <Tabs value={activeTab}>
              {/* Overview Tab */}
              <TabsContent value="overview" className="mt-0 space-y-6">
                {/* Project Info */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Users className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{project.bookingCount}</p>
                          <p className="text-sm text-muted-foreground">Bokningar</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  {project.location && (
                    <Card>
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-primary/10 rounded-lg">
                            <MapPin className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{project.location}</p>
                            <p className="text-sm text-muted-foreground">Plats</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {project.start_date && (
                    <Card>
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-primary/10 rounded-lg">
                            <Calendar className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{formatDate(project.start_date)}</p>
                            <p className="text-sm text-muted-foreground">Startdatum</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Bookings Overview */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Kopplade bokningar</CardTitle>
                      <Button size="sm" onClick={() => setIsAddBookingOpen(true)}>
                        <Plus className="w-4 h-4 mr-1" />
                        Lägg till
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {project.bookings.length === 0 ? (
                      <div className="text-center py-8">
                        <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">
                          Inga bokningar kopplade ännu
                        </p>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mt-3"
                          onClick={() => setIsAddBookingOpen(true)}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Lägg till första bokningen
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {project.bookings.map(lpb => (
                          <div 
                            key={lpb.id}
                            className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                          >
                            <div 
                              className="flex-1 cursor-pointer"
                              onClick={() => navigate(`/booking/${lpb.booking_id}`)}
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  {lpb.display_name || lpb.booking?.client || 'Bokning'}
                                </span>
                                {lpb.booking?.booking_number && (
                                  <Badge variant="outline" className="text-xs">
                                    #{lpb.booking.booking_number}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                {lpb.booking?.eventdate && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {formatDate(lpb.booking.eventdate)}
                                  </span>
                                )}
                                {lpb.booking?.deliveryaddress && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {lpb.booking.deliveryaddress}
                                  </span>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                if (confirm('Ta bort bokningen från projektet?')) {
                                  removeBookingMutation.mutate(lpb.booking_id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Bookings Tab */}
              <TabsContent value="bookings" className="mt-0">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Alla bokningar</CardTitle>
                      <Button onClick={() => setIsAddBookingOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Lägg till bokning
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {project.bookings.length === 0 ? (
                      <div className="text-center py-12">
                        <p className="text-muted-foreground">Inga bokningar kopplade</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {project.bookings.map(lpb => (
                          <Card key={lpb.id} className="hover:shadow-md transition-shadow">
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h3 className="font-medium">{lpb.booking?.client || 'Okänd kund'}</h3>
                                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                                    {lpb.booking?.booking_number && (
                                      <span>#{lpb.booking.booking_number}</span>
                                    )}
                                    {lpb.booking?.eventdate && (
                                      <span className="flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        {formatDate(lpb.booking.eventdate)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigate(`/booking/${lpb.booking_id}`)}
                                  >
                                    Visa bokning
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      if (confirm('Ta bort bokningen från projektet?')) {
                                        removeBookingMutation.mutate(lpb.booking_id);
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Economy Tab */}
              <TabsContent value="economy" className="mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle>Samordnad ekonomi</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-12 text-muted-foreground">
                      <Wallet className="h-12 w-12 mx-auto mb-4 opacity-30" />
                      <p>Ekonomiöversikten kommer visa aggregerad data från alla kopplade bokningar.</p>
                      <p className="text-sm mt-2">Funktionaliteten byggs ut i nästa fas.</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Files Tab */}
              <TabsContent value="files" className="mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle>Projektfiler</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-12 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
                      <p>Ladda upp filer som gäller hela projektet.</p>
                      <p className="text-sm mt-2">Funktionaliteten byggs ut i nästa fas.</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Comments Tab */}
              <TabsContent value="comments" className="mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle>Projektkommentarer</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-12 text-muted-foreground">
                      <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-30" />
                      <p>Kommunicera med teamet om projektet.</p>
                      <p className="text-sm mt-2">Funktionaliteten byggs ut i nästa fas.</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Add Booking Dialog */}
      <Dialog open={isAddBookingOpen} onOpenChange={setIsAddBookingOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Lägg till bokning</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Sök bokningar..."
                value={bookingSearch}
                onChange={(e) => setBookingSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {filteredAvailableBookings.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Inga tillgängliga bokningar hittades</p>
                  <p className="text-sm mt-1">Endast bekräftade bokningar som inte redan tillhör ett stort projekt visas.</p>
                </div>
              ) : (
                filteredAvailableBookings.map(booking => (
                  <div 
                    key={booking.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{booking.client}</span>
                        {booking.booking_number && (
                          <Badge variant="outline" className="text-xs">
                            #{booking.booking_number}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        {booking.eventdate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(booking.eventdate)}
                          </span>
                        )}
                        {booking.deliveryaddress && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {booking.deliveryaddress}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => addBookingMutation.mutate(booking.id)}
                      disabled={addBookingMutation.isPending}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Lägg till
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddBookingOpen(false)}>
              Stäng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainSystemLayout>
  );
};

export default LargeProjectDetail;
