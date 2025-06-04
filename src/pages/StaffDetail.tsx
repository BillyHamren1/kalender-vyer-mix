
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Calendar, Clock, DollarSign, User, Plus, Mail, Phone, MapPin, Briefcase } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { timeReportService } from '@/services/timeReportService';
import TimeReportForm from '@/components/time-reports/TimeReportForm';
import TimeReportList from '@/components/time-reports/TimeReportList';
import DailyTimeView from '@/components/time-reports/DailyTimeView';
import { TimeReport } from '@/types/timeReport';
import { toast } from 'sonner';
import { getContrastTextColor } from '@/utils/staffColors';

const StaffDetail: React.FC = () => {
  const { staffId } = useParams<{ staffId: string }>();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showTimeReportForm, setShowTimeReportForm] = useState(false);
  const [timeReports, setTimeReports] = useState<TimeReport[]>([]);

  // Fetch staff member details
  const { data: staffMember, isLoading: staffLoading } = useQuery({
    queryKey: ['staff-member', staffId],
    queryFn: async () => {
      if (!staffId) throw new Error('Staff ID is required');
      
      const { data, error } = await supabase
        .from('staff_members')
        .select('*')
        .eq('id', staffId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!staffId
  });

  // Load time reports for current month
  useEffect(() => {
    if (staffId) {
      loadTimeReports();
    }
  }, [staffId, selectedDate]);

  const loadTimeReports = async () => {
    if (!staffId) return;
    
    try {
      const monthStart = format(startOfMonth(selectedDate), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(selectedDate), 'yyyy-MM-dd');
      
      const reports = await timeReportService.getTimeReports({
        staff_id: staffId,
        start_date: monthStart,
        end_date: monthEnd
      });
      
      setTimeReports(reports);
    } catch (error) {
      console.error('Error loading time reports:', error);
      toast.error('Failed to load time reports');
    }
  };

  const handleTimeReportSubmit = (report: TimeReport) => {
    setTimeReports(prev => [report, ...prev]);
    setShowTimeReportForm(false);
    toast.success('Time report submitted successfully');
  };

  const handleDeleteTimeReport = async (reportId: string) => {
    try {
      await timeReportService.deleteTimeReport(reportId);
      setTimeReports(prev => prev.filter(report => report.id !== reportId));
      toast.success('Time report deleted');
    } catch (error) {
      console.error('Error deleting time report:', error);
      toast.error('Failed to delete time report');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  // Calculate monthly stats
  const monthlyStats = timeReports.reduce(
    (acc, report) => {
      const hourlyRate = report.staff_members?.hourly_rate || staffMember?.hourly_rate || 0;
      const overtimeRate = report.staff_members?.overtime_rate || staffMember?.overtime_rate || hourlyRate;
      const regularHours = report.hours_worked - (report.overtime_hours || 0);
      const overtimeHours = report.overtime_hours || 0;
      const earnings = (regularHours * hourlyRate) + (overtimeHours * overtimeRate);
      
      return {
        totalHours: acc.totalHours + report.hours_worked,
        totalEarnings: acc.totalEarnings + earnings,
        totalReports: acc.totalReports + 1,
        overtimeHours: acc.overtimeHours + overtimeHours
      };
    },
    { totalHours: 0, totalEarnings: 0, totalReports: 0, overtimeHours: 0 }
  );

  if (staffLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading staff details...</div>
      </div>
    );
  }

  if (!staffMember) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Staff member not found</div>
      </div>
    );
  }

  const staffColor = staffMember.color || '#E3F2FD';
  const textColor = getContrastTextColor(staffColor);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <Button 
            variant="outline" 
            onClick={() => navigate('/staff-management')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Staff
          </Button>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div 
              className="h-16 w-16 rounded-full flex items-center justify-center text-xl font-bold border-2"
              style={{ 
                backgroundColor: staffColor,
                color: textColor,
                borderColor: '#e5e7eb'
              }}
            >
              {staffMember.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div>
              <h1 className="text-3xl font-bold">{staffMember.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                {staffMember.role && (
                  <Badge variant="secondary">{staffMember.role}</Badge>
                )}
                {staffMember.department && (
                  <Badge variant="outline">{staffMember.department}</Badge>
                )}
              </div>
            </div>
          </div>
          <Button onClick={() => setShowTimeReportForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Time Report
          </Button>
        </div>
      </div>

      {/* Staff Information Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {staffMember.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-gray-500" />
                <span className="text-sm">{staffMember.email}</span>
              </div>
            )}
            {staffMember.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-gray-500" />
                <span className="text-sm">{staffMember.phone}</span>
              </div>
            )}
            {staffMember.address && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gray-500" />
                <span className="text-sm">{staffMember.address}</span>
              </div>
            )}
            {(!staffMember.email && !staffMember.phone && !staffMember.address) && (
              <p className="text-sm text-gray-500">No contact information available</p>
            )}
          </CardContent>
        </Card>

        {/* Employment Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Employment Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {staffMember.hire_date && (
              <div>
                <p className="text-sm text-gray-600">Hire Date</p>
                <p className="font-medium">{format(new Date(staffMember.hire_date), 'PPP')}</p>
              </div>
            )}
            {staffMember.employee_id && (
              <div>
                <p className="text-sm text-gray-600">Employee ID</p>
                <p className="font-medium">{staffMember.employee_id}</p>
              </div>
            )}
            {staffMember.status && (
              <div>
                <p className="text-sm text-gray-600">Status</p>
                <Badge variant={staffMember.status === 'active' ? 'default' : 'secondary'}>
                  {staffMember.status}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rate Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Rate Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {staffMember.hourly_rate && (
              <div>
                <p className="text-sm text-gray-600">Hourly Rate</p>
                <p className="text-xl font-bold text-green-600">
                  {formatCurrency(staffMember.hourly_rate)}/hour
                </p>
              </div>
            )}
            {staffMember.overtime_rate && (
              <div>
                <p className="text-sm text-gray-600">Overtime Rate</p>
                <p className="text-lg font-medium text-green-600">
                  {formatCurrency(staffMember.overtime_rate)}/hour
                </p>
              </div>
            )}
            {(!staffMember.hourly_rate && !staffMember.overtime_rate) && (
              <p className="text-sm text-gray-500">No rate information available</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600">Hours This Month</p>
                <p className="text-2xl font-bold">{monthlyStats.totalHours.toFixed(1)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600">Earnings This Month</p>
                <p className="text-2xl font-bold">{formatCurrency(monthlyStats.totalEarnings)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600">Reports Submitted</p>
                <p className="text-2xl font-bold">{monthlyStats.totalReports}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-sm text-gray-600">Overtime Hours</p>
                <p className="text-2xl font-bold">{monthlyStats.overtimeHours.toFixed(1)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Time Report Form */}
      {showTimeReportForm && (
        <div className="mb-6">
          <TimeReportForm
            staffId={staffId}
            onSuccess={handleTimeReportSubmit}
            onCancel={() => setShowTimeReportForm(false)}
          />
        </div>
      )}

      {/* Time Reports Tabs */}
      <Tabs defaultValue="daily" className="space-y-4">
        <TabsList>
          <TabsTrigger value="daily">Daily View</TabsTrigger>
          <TabsTrigger value="list">List View</TabsTrigger>
        </TabsList>

        <TabsContent value="daily">
          <DailyTimeView reports={timeReports} selectedDate={selectedDate} />
        </TabsContent>

        <TabsContent value="list">
          <TimeReportList
            reports={timeReports}
            onDelete={handleDeleteTimeReport}
            showStaffName={false}
            showBookingInfo={true}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StaffDetail;
