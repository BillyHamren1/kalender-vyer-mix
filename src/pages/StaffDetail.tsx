
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Calendar, Clock, DollarSign, User, Plus, Mail, Phone, MapPin, Briefcase, Edit2, AlertTriangle, FileText, Building } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { timeReportService } from '@/services/timeReportService';
import TimeReportForm from '@/components/time-reports/TimeReportForm';
import TimeReportList from '@/components/time-reports/TimeReportList';
import DailyTimeView from '@/components/time-reports/DailyTimeView';
import EditStaffDialog from '@/components/staff/EditStaffDialog';
import { TimeReport } from '@/types/timeReport';
import { toast } from 'sonner';
import { getContrastTextColor } from '@/utils/staffColors';

const StaffDetail: React.FC = () => {
  const { staffId } = useParams<{ staffId: string }>();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showTimeReportForm, setShowTimeReportForm] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [timeReports, setTimeReports] = useState<TimeReport[]>([]);

  // Fetch staff member details
  const { data: staffMember, isLoading: staffLoading, refetch: refetchStaff } = useQuery({
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

  const handleStaffUpdated = () => {
    refetchStaff();
    setShowEditDialog(false);
    toast.success('Staff member updated successfully');
  };

  const formatCurrency = (amount?: number) => {
    if (amount === undefined || amount === null) return 'Not set';
    return `${amount} SEK`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Not set';
    return format(new Date(dateString), 'PPP');
  };

  const displayValue = (value?: string | number) => {
    if (value === undefined || value === null || value === '') return 'Not set';
    return value;
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
          <div className="flex items-center gap-2">
            <Button 
              onClick={() => setShowEditDialog(true)}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Edit2 className="h-4 w-4" />
              Edit Staff
            </Button>
            <Button onClick={() => setShowTimeReportForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Time Report
            </Button>
          </div>
        </div>
      </div>

      {/* Staff Information Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-gray-600">Email</p>
              <p className="font-medium">{displayValue(staffMember.email)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Phone</p>
              <p className="font-medium">{displayValue(staffMember.phone)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Address</p>
              <p className="font-medium">{displayValue(staffMember.address)}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">City</p>
                <p className="font-medium">{displayValue(staffMember.city)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Postal Code</p>
                <p className="font-medium">{displayValue(staffMember.postal_code)}</p>
              </div>
            </div>
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
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-gray-600">Role/Position</p>
              <p className="font-medium">{displayValue(staffMember.role)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Department</p>
              <p className="font-medium">{displayValue(staffMember.department)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Hire Date</p>
              <p className="font-medium">{formatDate(staffMember.hire_date)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Financial Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Financial Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-gray-600">Hourly Rate</p>
              <p className="text-xl font-bold text-green-600">
                {formatCurrency(staffMember.hourly_rate)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Overtime Rate</p>
              <p className="text-lg font-medium text-green-600">
                {formatCurrency(staffMember.overtime_rate)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Monthly Salary</p>
              <p className="text-lg font-medium text-green-600">
                {formatCurrency(staffMember.salary)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Emergency Contact */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Emergency Contact
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-gray-600">Contact Name</p>
              <p className="font-medium">{displayValue(staffMember.emergency_contact_name)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Contact Phone</p>
              <p className="font-medium">{displayValue(staffMember.emergency_contact_phone)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notes Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-50 p-4 rounded-md min-h-[100px]">
            <p className="text-gray-900">
              {staffMember.notes || 'No notes available'}
            </p>
          </div>
        </CardContent>
      </Card>

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

      {/* Edit Staff Dialog */}
      {showEditDialog && staffMember && (
        <EditStaffDialog
          staff={staffMember}
          isOpen={showEditDialog}
          onClose={() => setShowEditDialog(false)}
          onStaffUpdated={handleStaffUpdated}
        />
      )}
    </div>
  );
};

export default StaffDetail;
