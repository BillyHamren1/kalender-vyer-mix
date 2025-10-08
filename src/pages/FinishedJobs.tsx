
import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CheckCircle, DollarSign, Clock, Users, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { toast } from 'sonner';
import { timeReportService } from '@/services/timeReportService';
import { BookingSummary } from '@/types/timeReport';

const FinishedJobs: React.FC = () => {
  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<BookingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedBookings, setExpandedBookings] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadFinishedJobs();
  }, []);

  useEffect(() => {
    // Filter bookings based on search term
    if (searchTerm.trim() === '') {
      setFilteredBookings(bookings);
    } else {
      const filtered = bookings.filter(booking =>
        booking.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
        booking.booking_number?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredBookings(filtered);
    }
  }, [bookings, searchTerm]);

  const loadFinishedJobs = async () => {
    try {
      setLoading(true);
      const data = await timeReportService.getFinishedJobsSummary();
      setBookings(data);
    } catch (error) {
      console.error('Error loading finished jobs:', error);
      toast.error('Failed to load finished jobs');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const toggleExpanded = (bookingId: string) => {
    const newExpanded = new Set(expandedBookings);
    if (newExpanded.has(bookingId)) {
      newExpanded.delete(bookingId);
    } else {
      newExpanded.add(bookingId);
    }
    setExpandedBookings(newExpanded);
  };

  const totalStats = filteredBookings.reduce(
    (acc, booking) => ({
      totalJobs: acc.totalJobs + 1,
      totalHours: acc.totalHours + booking.total_hours,
      totalCost: acc.totalCost + booking.total_cost
    }),
    { totalJobs: 0, totalHours: 0, totalCost: 0 }
  );

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading finished jobs...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Finished Jobs</h1>
        <p className="text-gray-600">
          Completed bookings with labor cost analysis
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600">Total Jobs</p>
                <p className="text-2xl font-bold">{totalStats.totalJobs}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600">Total Hours</p>
                <p className="text-2xl font-bold">{totalStats.totalHours.toFixed(1)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600">Total Labor Cost</p>
                <p className="text-2xl font-bold">{formatCurrency(totalStats.totalCost)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600">Avg Cost/Job</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(totalStats.totalJobs > 0 ? totalStats.totalCost / totalStats.totalJobs : 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by client or booking number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Jobs List */}
      <div className="space-y-4">
        {filteredBookings.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8">
              <CheckCircle className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-600 mb-2">No finished jobs found</h3>
              <p className="text-gray-500 text-center">
                Completed jobs with time reports will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredBookings.map((booking) => (
            <Card key={booking.id}>
              <Collapsible
                open={expandedBookings.has(booking.id)}
                onOpenChange={() => toggleExpanded(booking.id)}
              >
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <CardTitle className="flex items-center gap-2">
                          {booking.client}
                          {booking.booking_number && (
                            <Badge variant="outline">{booking.booking_number}</Badge>
                          )}
                          <Badge className="bg-green-100 text-green-800">
                            {booking.status}
                          </Badge>
                        </CardTitle>
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                          {booking.eventdate && (
                            <span>Event: {format(new Date(booking.eventdate), 'MMM d, yyyy')}</span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {booking.total_hours.toFixed(1)}h
                          </span>
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-4 w-4" />
                            {formatCurrency(booking.total_cost)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            {booking.staff_breakdown.length} staff
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {expandedBookings.has(booking.id) ? (
                          <ChevronUp className="h-5 w-5" />
                        ) : (
                          <ChevronDown className="h-5 w-5" />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-3">Staff Breakdown:</h4>
                      <div className="space-y-3">
                        {booking.staff_breakdown.map((staff, index) => (
                          <div key={index} className="bg-gray-50 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <h5 className="font-medium">{staff.staff_name}</h5>
                              <div className="text-right">
                                <div className="font-medium text-green-600">
                                  {formatCurrency(staff.total_cost)}
                                </div>
                                <div className="text-sm text-gray-600">
                                  {staff.total_hours.toFixed(1)}h total
                                </div>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="text-gray-600">Regular: </span>
                                <span>{(staff.total_hours - staff.overtime_hours).toFixed(1)}h - {formatCurrency(staff.regular_cost)}</span>
                              </div>
                              {staff.overtime_hours > 0 && (
                                <div>
                                  <span className="text-gray-600">Overtime: </span>
                                  <span>{staff.overtime_hours.toFixed(1)}h - {formatCurrency(staff.overtime_cost)}</span>
                                </div>
                              )}
                            </div>

                            <div className="mt-2">
                              <h6 className="text-sm font-medium text-gray-700 mb-1">Daily Reports:</h6>
                              <div className="space-y-1">
                                {staff.reports.map((report, reportIndex) => (
                                  <div key={reportIndex} className="text-xs text-gray-600 flex justify-between">
                                    <span>{format(new Date(report.report_date), 'MMM d')}</span>
                                    <span>{report.hours_worked}h</span>
                                    {report.description && (
                                      <span className="truncate ml-2">{report.description}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default FinishedJobs;
