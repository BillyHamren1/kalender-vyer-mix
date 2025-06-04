
import React from 'react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, DollarSign } from 'lucide-react';
import { TimeReport } from '@/types/timeReport';

interface DailyTimeViewProps {
  reports: TimeReport[];
  selectedDate: Date;
}

const DailyTimeView: React.FC<DailyTimeViewProps> = ({ reports, selectedDate }) => {
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const calculateDayCost = (dayReports: TimeReport[]) => {
    return dayReports.reduce((total, report) => {
      const hourlyRate = report.staff_members?.hourly_rate || 0;
      const overtimeRate = report.staff_members?.overtime_rate || hourlyRate;
      const regularHours = report.hours_worked - (report.overtime_hours || 0);
      const overtimeHours = report.overtime_hours || 0;
      
      return total + (regularHours * hourlyRate) + (overtimeHours * overtimeRate);
    }, 0);
  };

  const getReportsForDay = (day: Date) => {
    return reports.filter(report => 
      isSameDay(new Date(report.report_date), day)
    );
  };

  const totalWeekHours = reports.reduce((total, report) => total + report.hours_worked, 0);
  const totalWeekCost = reports.reduce((total, report) => {
    const hourlyRate = report.staff_members?.hourly_rate || 0;
    const overtimeRate = report.staff_members?.overtime_rate || hourlyRate;
    const regularHours = report.hours_worked - (report.overtime_hours || 0);
    const overtimeHours = report.overtime_hours || 0;
    
    return total + (regularHours * hourlyRate) + (overtimeHours * overtimeRate);
  }, 0);

  return (
    <div className="space-y-6">
      {/* Week Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Week of {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600">Total Hours</p>
                <p className="text-xl font-bold">{totalWeekHours.toFixed(1)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              <div>
                <p className="text-sm text-gray-600">Total Earnings</p>
                <p className="text-xl font-bold">{formatCurrency(totalWeekCost)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600">Avg Rate</p>
                <p className="text-xl font-bold">
                  {formatCurrency(totalWeekHours > 0 ? totalWeekCost / totalWeekHours : 0)}/h
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Daily Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
        {weekDays.map((day) => {
          const dayReports = getReportsForDay(day);
          const dayHours = dayReports.reduce((total, report) => total + report.hours_worked, 0);
          const dayCost = calculateDayCost(dayReports);
          const isToday = isSameDay(day, new Date());
          const isSelected = isSameDay(day, selectedDate);

          return (
            <Card key={day.toISOString()} className={`${isSelected ? 'ring-2 ring-blue-500' : ''} ${isToday ? 'bg-blue-50' : ''}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  <div className="text-center">
                    <div className="text-xs text-gray-500">
                      {format(day, 'EEE')}
                    </div>
                    <div className="text-lg font-bold">
                      {format(day, 'd')}
                    </div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {dayReports.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-center">
                      <Badge variant="secondary" className="mb-2">
                        {dayHours.toFixed(1)}h
                      </Badge>
                      <div className="text-sm font-medium text-green-600">
                        {formatCurrency(dayCost)}
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      {dayReports.map((report) => (
                        <div key={report.id} className="text-xs bg-gray-100 rounded p-2">
                          <div className="font-medium truncate">
                            {report.bookings?.client || 'Unknown Client'}
                          </div>
                          {report.start_time && report.end_time && (
                            <div className="text-gray-600">
                              {report.start_time} - {report.end_time}
                            </div>
                          )}
                          {report.overtime_hours && report.overtime_hours > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {report.overtime_hours}h OT
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-400 text-xs">
                    No reports
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default DailyTimeView;
