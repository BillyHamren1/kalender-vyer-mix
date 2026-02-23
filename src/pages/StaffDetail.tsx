import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Calendar, Clock, DollarSign, User, Plus, Mail, Phone, MapPin, Briefcase, AlertTriangle, FileText, Building } from 'lucide-react';
import StaffAccountCard from '@/components/staff/StaffAccountCard';
import { supabase } from '@/integrations/supabase/client';
import TimeReportForm from '@/components/time-reports/TimeReportForm';
import TimeReportListView from '@/components/time-reports/TimeReportListView';
import TimeReportsMonthNavigation from '@/components/time-reports/TimeReportsMonthNavigation';
import { useTrackedTimeData } from '@/hooks/useTrackedTimeData';
import { TimeReport } from '@/types/timeReport';
import { toast } from 'sonner';
import { getContrastTextColor } from '@/utils/staffColors';

const StaffDetail: React.FC = () => {
  const { staffId } = useParams<{ staffId: string }>();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showTimeReportForm, setShowTimeReportForm] = useState(false);

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

  const {
    timeReports,
    isLoading: timeReportsLoading,
    lastUpdated,
    error: timeReportsError,
    loadTrackedTimeData,
    calculateMonthlyStats
  } = useTrackedTimeData({
    staffId: staffId || '',
    selectedDate
  });

  const handleTimeReportSubmit = (report: TimeReport) => {
    loadTrackedTimeData();
    setShowTimeReportForm(false);
    toast.success('Tidrapport skickad – uppdaterar data');
  };

  const handleFieldSave = async (fieldName: string, value: string) => {
    if (!staffMember) return;
    try {
      const updateData: any = {};
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
      toast.success('Fältet uppdaterat');
    } catch (error) {
      console.error('Error updating field:', error);
      toast.error('Kunde inte uppdatera fältet');
    }
  };

  const formatCurrency = (amount?: number) => {
    if (amount === undefined || amount === null) return '';
    return amount.toString();
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    return dateString.split('T')[0];
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
        <label className="text-sm font-medium text-muted-foreground">{label}</label>
        <div className="flex items-center space-x-3">
          {icon && <div className="text-primary/60">{icon}</div>}
          {type === 'textarea' ? (
            <Textarea
              value={currentValue}
              onChange={(e) => setCurrentValue(e.target.value)}
              onFocus={() => setIsEditing(true)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              placeholder={placeholder || 'Klicka för att lägga till...'}
              className="min-h-[80px] border-border bg-background hover:border-muted-foreground/30 focus:border-primary transition-colors"
            />
          ) : (
            <Input
              type={type}
              value={currentValue}
              onChange={(e) => setCurrentValue(e.target.value)}
              onFocus={() => setIsEditing(true)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              placeholder={placeholder || 'Klicka för att lägga till...'}
              className="border-border bg-background hover:border-muted-foreground/30 focus:border-primary transition-colors"
            />
          )}
        </div>
      </div>
    );
  };

  const monthlyStats = calculateMonthlyStats(
    timeReports,
    staffMember?.hourly_rate || 0,
    staffMember?.overtime_rate
  );

  if (staffLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-muted-foreground">Laddar personaluppgifter...</div>
      </div>
    );
  }

  if (!staffMember) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-muted-foreground">Personal hittades inte</div>
      </div>
    );
  }

  const staffColor = staffMember.color || '#E3F2FD';
  const textColor = getContrastTextColor(staffColor);

  return (
    <div className="h-screen flex flex-col bg-muted/30 overflow-hidden">
      {/* Header */}
      <div className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center gap-4 mb-4">
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Tillbaka
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className="h-16 w-16 rounded-full flex items-center justify-center text-xl font-bold border-2 border-border"
              style={{
                backgroundColor: staffColor,
                color: textColor,
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
        </div>
      </div>

      {/* Main Content - Single scrollable page */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Personuppgifter + Anställning + Lön - 3 columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Personuppgifter */}
          <Card className="bg-card shadow-sm border border-border">
            <CardHeader className="pb-4 border-b border-border/50">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <User className="h-5 w-5 text-primary/60" />
                Personuppgifter
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <DirectEditField fieldName="name" value={staffMember.name} label="Namn" icon={<User className="h-4 w-4" />} />
              <DirectEditField fieldName="email" value={staffMember.email} label="E-post" icon={<Mail className="h-4 w-4" />} placeholder="E-postadress" />
              <DirectEditField fieldName="phone" value={staffMember.phone} label="Telefon" icon={<Phone className="h-4 w-4" />} placeholder="Telefonnummer" />
            </CardContent>
          </Card>

          {/* Anställning */}
          <Card className="bg-card shadow-sm border border-border">
            <CardHeader className="pb-4 border-b border-border/50">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <Briefcase className="h-5 w-5 text-primary/60" />
                Anställning
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <DirectEditField fieldName="role" value={staffMember.role} label="Roll" icon={<Briefcase className="h-4 w-4" />} />
              <DirectEditField fieldName="department" value={staffMember.department} label="Avdelning" icon={<Building className="h-4 w-4" />} />
              <DirectEditField fieldName="hire_date" value={staffMember.hire_date} label="Anställningsdatum" type="date" icon={<Calendar className="h-4 w-4" />} />
            </CardContent>
          </Card>

          {/* Lön & ersättning */}
          <Card className="bg-card shadow-sm border border-border">
            <CardHeader className="pb-4 border-b border-border/50">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <DollarSign className="h-5 w-5 text-primary/60" />
                Lön & ersättning
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <DirectEditField fieldName="hourly_rate" value={staffMember.hourly_rate} label="Timlön (kr)" type="number" isCurrency placeholder="Timlön" icon={<DollarSign className="h-4 w-4" />} />
              <DirectEditField fieldName="overtime_rate" value={staffMember.overtime_rate} label="OB-tillägg (kr)" type="number" isCurrency placeholder="OB-tillägg" icon={<DollarSign className="h-4 w-4" />} />
              <DirectEditField fieldName="salary" value={staffMember.salary} label="Månadslön (kr)" type="number" isCurrency placeholder="Månadslön" icon={<DollarSign className="h-4 w-4" />} />
            </CardContent>
          </Card>
        </div>

        {/* Adress */}
        <Card className="bg-card shadow-sm border border-border">
          <CardHeader className="pb-4 border-b border-border/50">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <MapPin className="h-5 w-5 text-primary/60" />
              Adress
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <DirectEditField fieldName="address" value={staffMember.address} label="Gatuadress" icon={<MapPin className="h-4 w-4" />} placeholder="Gatuadress" />
              <div className="grid grid-cols-2 gap-4">
                <DirectEditField fieldName="postal_code" value={staffMember.postal_code} label="Postnummer" placeholder="Postnummer" />
                <DirectEditField fieldName="city" value={staffMember.city} label="Stad" placeholder="Stad" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Kontaktperson vid nödfall */}
        <Card className="bg-card shadow-sm border border-border">
          <CardHeader className="pb-4 border-b border-border/50">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <AlertTriangle className="h-5 w-5 text-primary/60" />
              Kontaktperson vid nödfall
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <DirectEditField fieldName="emergency_contact_name" value={staffMember.emergency_contact_name} label="Namn" icon={<User className="h-4 w-4" />} placeholder="Kontaktpersonens namn" />
              <DirectEditField fieldName="emergency_contact_phone" value={staffMember.emergency_contact_phone} label="Telefon" icon={<Phone className="h-4 w-4" />} placeholder="Kontaktpersonens telefon" />
            </div>
          </CardContent>
        </Card>

        {/* Anteckningar */}
        <Card className="bg-card shadow-sm border border-border">
          <CardHeader className="pb-4 border-b border-border/50">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <FileText className="h-5 w-5 text-primary/60" />
              Anteckningar
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <DirectEditField fieldName="notes" value={staffMember.notes} label="Övriga anteckningar" type="textarea" placeholder="Lägg till anteckningar om denna person..." />
          </CardContent>
        </Card>

        {/* Konto */}
        <StaffAccountCard staffId={staffMember.id} staffName={staffMember.name} />

        {/* Tidrapporter */}
        <Card className="bg-card shadow-sm border border-border">
          <CardHeader className="pb-4 border-b border-border/50">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <Clock className="h-5 w-5 text-primary/60" />
                Tidrapporter
              </CardTitle>
              <Button size="sm" onClick={() => setShowTimeReportForm(!showTimeReportForm)}>
                <Plus className="h-4 w-4 mr-2" />
                Lägg till
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            {/* Månadsnavigation */}
            <TimeReportsMonthNavigation
              currentDate={selectedDate}
              onDateChange={setSelectedDate}
              onRefresh={loadTrackedTimeData}
              isLoading={timeReportsLoading}
              lastUpdated={lastUpdated}
            />

            {/* Felmeddelande */}
            {timeReportsError && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
                <div className="text-destructive">{timeReportsError}</div>
              </div>
            )}

            {/* Månadsstatistik */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Timmar denna månad</p>
                    <p className="text-xl font-bold">{monthlyStats.totalHours.toFixed(1)}</p>
                  </div>
                </div>
              </div>
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Intjäning denna månad</p>
                    <p className="text-xl font-bold">{monthlyStats.totalEarnings.toFixed(0)} kr</p>
                  </div>
                </div>
              </div>
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Inlämnade rapporter</p>
                    <p className="text-xl font-bold">{monthlyStats.totalReports}</p>
                  </div>
                </div>
              </div>
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">OB-timmar</p>
                    <p className="text-xl font-bold">{monthlyStats.overtimeHours.toFixed(1)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Tidrapportformulär */}
            {showTimeReportForm && (
              <TimeReportForm
                staffId={staffId}
                onSuccess={handleTimeReportSubmit}
                onCancel={() => setShowTimeReportForm(false)}
              />
            )}

            {/* Laddning */}
            {timeReportsLoading && (
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-3 text-muted-foreground">Laddar tidrapporter...</span>
              </div>
            )}

            {/* Tidrapportlista */}
            {!timeReportsLoading && (
              <TimeReportListView reports={timeReports} selectedDate={selectedDate} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StaffDetail;
