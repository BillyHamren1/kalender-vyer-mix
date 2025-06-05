
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

  const handleFieldSave = async (fieldName: string, value: string) => {
    if (!staffMember) return;

    try {
      const updateData: any = {};
      
      // Convert value based on field type
      if (['hourly_rate', 'overtime_rate', 'salary'].includes(fieldName)) {
        updateData[fieldName] = value ? parseFloat(value) : null;
      } else {
        updateData[fieldName] = value || null;
      }

      const { error } = await supabase
        .from('staff_members')
        .update(updateData)
        .eq('id', staffMember.id);

      if (error) throw error;

      await refetchStaff();
      toast.success('Field updated successfully');
    } catch (error) {
      console.error('Error updating field:', error);
      toast.error('Failed to update field');
    }
  };

  const formatCurrency = (amount?: number) => {
    if (amount === undefined || amount === null) return '';
    return amount.toString();
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    return format(new Date(dateString), 'yyyy-MM-dd');
  };

  const displayValue = (value?: string | number) => {
    if (value === undefined || value === null || value === '') return '';
    return value.toString();
  };

  const DirectEditField: React.FC<{
    fieldName: string;
    value: string | number | null | undefined;
    label: string;
    type?: 'text' | 'number' | 'textarea' | 'date';
    isCurrency?: boolean;
    placeholder?: string;
    icon?: React.ReactNode;
  }> = ({ fieldName, value, label, type = 'text', isCurrency = false, placeholder, icon }) => {
    const [currentValue, setCurrentValue] = useState('');
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => {
      if (type === 'date') {
        setCurrentValue(formatDate(value as string));
      } else if (isCurrency) {
        setCurrentValue(formatCurrency(value as number));
      } else {
        setCurrentValue(displayValue(value));
      }
    }, [value, type, isCurrency]);

    const handleBlur = async () => {
      setIsEditing(false);
      if (currentValue !== (isCurrency ? formatCurrency(value as number) : displayValue(value))) {
        await handleFieldSave(fieldName, currentValue);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && type !== 'textarea') {
        handleBlur();
      }
      if (e.key === 'Escape') {
        setIsEditing(false);
        if (type === 'date') {
          setCurrentValue(formatDate(value as string));
        } else if (isCurrency) {
          setCurrentValue(formatCurrency(value as number));
        } else {
          setCurrentValue(displayValue(value));
        }
      }
    };

    return (
      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <div className="flex items-center space-x-3">
          {icon && <div className="text-gray-400">{icon}</div>}
          {type === 'textarea' ? (
            <Textarea
              value={currentValue}
              onChange={(e) => setCurrentValue(e.target.value)}
              onFocus={() => setIsEditing(true)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              placeholder={placeholder || currentValue ? '' : 'Click to add...'}
              className="min-h-[80px] border-gray-200 bg-white hover:border-gray-300 focus:border-blue-500 transition-colors"
            />
          ) : (
            <Input
              type={type}
              value={currentValue}
              onChange={(e) => setCurrentValue(e.target.value)}
              onFocus={() => setIsEditing(true)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              placeholder={placeholder || currentValue ? '' : 'Click to add...'}
              className="border-gray-200 bg-white hover:border-gray-300 focus:border-blue-500 transition-colors"
            />
          )}
        </div>
      </div>
    );
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
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

      {/* Main Content */}
      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Personal Information */}
          <Card className="bg-white shadow-sm border border-gray-200">
            <CardHeader className="pb-4 border-b border-gray-100">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <User className="h-5 w-5 text-blue-600" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <DirectEditField 
                fieldName="name" 
                value={staffMember.name} 
                label="Full Name"
                icon={<User className="h-4 w-4" />}
              />
              <DirectEditField 
                fieldName="email" 
                value={staffMember.email} 
                label="Email"
                icon={<Mail className="h-4 w-4" />}
                placeholder="Email address"
              />
              <DirectEditField 
                fieldName="phone" 
                value={staffMember.phone} 
                label="Phone"
                icon={<Phone className="h-4 w-4" />}
                placeholder="Phone number"
              />
            </CardContent>
          </Card>

          {/* Employment Details */}
          <Card className="bg-white shadow-sm border border-gray-200">
            <CardHeader className="pb-4 border-b border-gray-100">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <Briefcase className="h-5 w-5 text-green-600" />
                Employment Details
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <DirectEditField 
                fieldName="role" 
                value={staffMember.role} 
                label="Role/Position"
                icon={<Briefcase className="h-4 w-4" />}
              />
              <DirectEditField 
                fieldName="department" 
                value={staffMember.department} 
                label="Department"
                icon={<Building className="h-4 w-4" />}
              />
              <DirectEditField 
                fieldName="hire_date" 
                value={staffMember.hire_date} 
                label="Hire Date" 
                type="date"
                icon={<Calendar className="h-4 w-4" />}
              />
            </CardContent>
          </Card>

          {/* Financial Information */}
          <Card className="bg-white shadow-sm border border-gray-200">
            <CardHeader className="pb-4 border-b border-gray-100">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <DollarSign className="h-5 w-5 text-yellow-600" />
                Financial Information
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <DirectEditField 
                fieldName="hourly_rate" 
                value={staffMember.hourly_rate} 
                label="Hourly Rate (SEK)" 
                type="number"
                isCurrency={true}
                icon={<DollarSign className="h-4 w-4" />}
                placeholder="Hourly rate"
              />
              <DirectEditField 
                fieldName="overtime_rate" 
                value={staffMember.overtime_rate} 
                label="Overtime Rate (SEK)" 
                type="number"
                isCurrency={true}
                icon={<DollarSign className="h-4 w-4" />}
                placeholder="Overtime rate"
              />
              <DirectEditField 
                fieldName="salary" 
                value={staffMember.salary} 
                label="Monthly Salary (SEK)" 
                type="number"
                isCurrency={true}
                icon={<DollarSign className="h-4 w-4" />}
                placeholder="Monthly salary"
              />
            </CardContent>
          </Card>
        </div>

        {/* Address Information */}
        <Card className="bg-white shadow-sm border border-gray-200 mb-6">
          <CardHeader className="pb-4 border-b border-gray-100">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <MapPin className="h-5 w-5 text-red-600" />
              Address Information
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-6">
                <DirectEditField 
                  fieldName="address" 
                  value={staffMember.address} 
                  label="Address"
                  icon={<MapPin className="h-4 w-4" />}
                  placeholder="Street address"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <DirectEditField 
                  fieldName="postal_code" 
                  value={staffMember.postal_code} 
                  label="Postal Code"
                  placeholder="5-digit postal code"
                />
                <DirectEditField 
                  fieldName="city" 
                  value={staffMember.city} 
                  label="City"
                  placeholder="City name"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Emergency Contact */}
        <Card className="bg-white shadow-sm border border-gray-200 mb-6">
          <CardHeader className="pb-4 border-b border-gray-100">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Emergency Contact
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <DirectEditField 
                fieldName="emergency_contact_name" 
                value={staffMember.emergency_contact_name} 
                label="Contact Name"
                icon={<User className="h-4 w-4" />}
                placeholder="Emergency contact name"
              />
              <DirectEditField 
                fieldName="emergency_contact_phone" 
                value={staffMember.emergency_contact_phone} 
                label="Contact Phone"
                icon={<Phone className="h-4 w-4" />}
                placeholder="Emergency contact phone"
              />
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card className="bg-white shadow-sm border border-gray-200 mb-6">
          <CardHeader className="pb-4 border-b border-gray-100">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <FileText className="h-5 w-5 text-purple-600" />
              Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <DirectEditField 
              fieldName="notes" 
              value={staffMember.notes} 
              label="Additional Notes" 
              type="textarea"
              placeholder="Add any additional notes about this staff member..."
            />
          </CardContent>
        </Card>

        {/* Monthly Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-white shadow-sm border border-gray-200">
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

          <Card className="bg-white shadow-sm border border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm text-gray-600">Earnings This Month</p>
                  <p className="text-2xl font-bold">{monthlyStats.totalEarnings.toFixed(0)} SEK</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-sm border border-gray-200">
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

          <Card className="bg-white shadow-sm border border-gray-200">
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
    </div>
  );
};

export default StaffDetail;
