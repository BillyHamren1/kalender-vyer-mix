import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ArrowLeft, Calendar, Clock, Banknote, Coins, User, Plus, Mail, Phone, MapPin, Briefcase, AlertTriangle, FileText, Building, CalendarCheck, Key, Copy, Eye, EyeOff, Shirt, Upload, Trash2, Car } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StaffAccountCard from '@/components/staff/StaffAccountCard';
import StaffAvailabilityDialog from '@/components/staff/StaffAvailabilityDialog';
import { supabase } from '@/integrations/supabase/client';
import TimeReportForm from '@/components/time-reports/TimeReportForm';
import StaffTimeReportAllMonths from '@/components/time-reports/StaffTimeReportAllMonths';
import { toast } from 'sonner';
import { getContrastTextColor } from '@/utils/staffColors';

const StaffDetail: React.FC = () => {
  const { staffId } = useParams<{ staffId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showTimeReportForm, setShowTimeReportForm] = useState(false);
  const [showAvailabilityDialog, setShowAvailabilityDialog] = useState(false);
  const [autoCredentials, setAutoCredentials] = useState<{ username: string; password: string } | null>(null);
  const [showAutoCredentials, setShowAutoCredentials] = useState(false);
  const [showAutoPassword, setShowAutoPassword] = useState(false);

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

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers-for-staff', staffMember?.organization_id],
    enabled: !!staffMember?.organization_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name')
        .eq('organization_id', staffMember!.organization_id)
        .order('name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const handleTimeReportSubmit = () => {
    setShowTimeReportForm(false);
    toast.success('Tidrapport skickad');
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
    <>
    <div className="h-screen flex flex-col bg-muted/30 overflow-hidden theme-purple">
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
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-bold">{staffMember.name}</h1>
                <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg border border-border bg-muted/30">
                  <Checkbox
                    id="employment-type-header"
                    checked={staffMember.employment_type === 'contracted'}
                    onCheckedChange={(checked) => handleFieldSave('employment_type', checked ? 'contracted' : 'employed')}
                    className="h-5 w-5 border-2"
                  />
                  <label htmlFor="employment-type-header" className="text-sm font-medium cursor-pointer select-none">
                    Inhyrd personal
                  </label>
                </div>
                {staffMember.employment_type === 'contracted' && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/30">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <Select
                      value={(staffMember as any).hired_from_supplier_id ?? 'none'}
                      onValueChange={(val) => handleFieldSave('hired_from_supplier_id', val === 'none' ? '' : val)}
                    >
                      <SelectTrigger className="h-8 min-w-[200px] border-0 bg-transparent px-1 text-sm font-medium focus:ring-0">
                        <SelectValue placeholder="Välj företag..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Inget företag valt</SelectItem>
                        {suppliers.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {(staffMember as any).tags?.map((tag: string) => (
                  <Badge key={tag} variant="default" className="text-xs">{tag}</Badge>
                ))}
                {staffMember.role && (
                  <Badge variant="secondary">{staffMember.role}</Badge>
                )}
                {staffMember.department && (
                  <Badge variant="outline">{staffMember.department}</Badge>
                )}
                {staffMember.employment_type === 'contracted' && (staffMember as any).hired_from_supplier_id && (
                  <Badge variant="outline" className="gap-1">
                    <Building className="h-3 w-3" />
                    Inhyrd från {suppliers.find((s: any) => s.id === (staffMember as any).hired_from_supplier_id)?.name ?? '...'}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="info" className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 border-b border-border bg-card">
          <TabsList className="h-auto p-0 bg-transparent rounded-none">
            <TabsTrigger value="info" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3">
              Information
            </TabsTrigger>
            <TabsTrigger value="timereports" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3">
              Tidrapporter
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="info" className="flex-1 overflow-y-auto p-6 space-y-6 mt-0">
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
              
              {/* Taggar */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Taggar
                </label>
                <div className="flex gap-2">
                  {['Montage', 'Lager'].map(tag => {
                    const currentTags: string[] = (staffMember as any).tags || [];
                    const isActive = currentTags.includes(tag);
                    return (
                      <Badge
                        key={tag}
                        variant={isActive ? 'default' : 'outline'}
                        className={`cursor-pointer select-none transition-colors ${isActive ? '' : 'opacity-60 hover:opacity-100'}`}
                        onClick={async () => {
                          const newTags = isActive
                            ? currentTags.filter(t => t !== tag)
                            : [...currentTags, tag];
                          try {
                            const { error } = await supabase
                              .from('staff_members')
                              .update({ tags: newTags } as any)
                              .eq('id', staffMember.id);
                            if (error) throw error;
                            await refetchStaff();
                            toast.success(`Tagg "${tag}" ${isActive ? 'borttagen' : 'tillagd'}`);

                            // Auto-create account if adding Montage or Lager tag
                            if (!isActive && (tag === 'Montage' || tag === 'Lager')) {
                              const { data: existingAccount } = await supabase
                                .from('staff_accounts')
                                .select('id')
                                .eq('staff_id', staffMember.id)
                                .maybeSingle();

                              if (!existingAccount) {
                                const username = staffMember.name
                                  .toLowerCase()
                                  .normalize('NFD')
                                  .replace(/[\u0300-\u036f]/g, '')
                                  .replace(/\s+/g, '.')
                                  .replace(/[^a-z.]/g, '');
                                const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
                                const password = Array.from({ length: 8 }, () =>
                                  chars[Math.floor(Math.random() * chars.length)]
                                ).join('');
                                const passwordHash = btoa(password);

                                const { error: accountError } = await supabase
                                  .from('staff_accounts')
                                  .insert({
                                    staff_id: staffMember.id,
                                    username,
                                    password_hash: passwordHash
                                  });

                                if (!accountError) {
                                  setAutoCredentials({ username, password });
                                  setShowAutoCredentials(true);
                                  queryClient.invalidateQueries({ queryKey: ['staffAccount', staffMember.id] });
                                  toast.success('Inloggningskonto skapades automatiskt');
                                }
                              }
                            }
                          } catch (err) {
                            console.error('Error updating tags:', err);
                            toast.error('Kunde inte uppdatera taggar');
                          }
                        }}
                      >
                        {tag}
                      </Badge>
                    );
                  })}
                </div>
              </div>

              {/* Tillgänglighet */}
              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => setShowAvailabilityDialog(true)}
                >
                  <CalendarCheck className="h-4 w-4" />
                  Hantera tillgänglighet
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Lön & ersättning */}
          <Card className="bg-card shadow-sm border border-border">
            <CardHeader className="pb-4 border-b border-border/50">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <Coins className="h-5 w-5 text-primary/60" />
                Lön & ersättning
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <DirectEditField fieldName="hourly_rate" value={staffMember.hourly_rate} label="Timlön (kr)" type="number" isCurrency placeholder="Timlön" />
              <DirectEditField fieldName="overtime_rate" value={staffMember.overtime_rate} label="OB-tillägg (kr)" type="number" isCurrency placeholder="OB-tillägg" />
              <DirectEditField fieldName="salary" value={staffMember.salary} label="Månadslön (kr)" type="number" isCurrency placeholder="Månadslön" />
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

        {/* Klädstorlekar */}
        <Card className="bg-card shadow-sm border border-border">
          <CardHeader className="pb-4 border-b border-border/50">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Shirt className="h-5 w-5 text-primary/60" />
              Klädstorlekar
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <DirectEditField fieldName="shoe_size" value={(staffMember as any).shoe_size} label="Skor" placeholder="t.ex. 43" />
              <DirectEditField fieldName="pants_size" value={(staffMember as any).pants_size} label="Byxor" placeholder="t.ex. M" />
              <DirectEditField fieldName="tshirt_size" value={(staffMember as any).tshirt_size} label="T-shirt" placeholder="t.ex. L" />
              <DirectEditField fieldName="sweater_size" value={(staffMember as any).sweater_size} label="Tröja" placeholder="t.ex. L" />
              <DirectEditField fieldName="jacket_size" value={(staffMember as any).jacket_size} label="Jacka" placeholder="t.ex. XL" />
            </div>
          </CardContent>
        </Card>

        {/* Körkort */}
        <Card className="bg-card shadow-sm border border-border">
          <CardHeader className="pb-4 border-b border-border/50">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Car className="h-5 w-5 text-primary/60" />
              Körkort
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {(staffMember as any).driver_license_url ? (
              <div className="space-y-3">
                <div className="relative group">
                  <img
                    src={(staffMember as any).driver_license_url}
                    alt="Körkort"
                    className="max-w-md rounded-lg border border-border shadow-sm cursor-pointer"
                    onClick={() => window.open((staffMember as any).driver_license_url, '_blank')}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open((staffMember as any).driver_license_url, '_blank')}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Visa i fullstorlek
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      try {
                        const url = (staffMember as any).driver_license_url as string;
                        const pathMatch = url.match(/project-files\/(.+)$/);
                        if (pathMatch) {
                          await supabase.storage.from('project-files').remove([pathMatch[1]]);
                        }
                        await supabase.from('staff_members').update({ driver_license_url: null } as any).eq('id', staffMember.id);
                        await refetchStaff();
                        toast.success('Körkort borttaget');
                      } catch (err) {
                        toast.error('Kunde inte ta bort körkortet');
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Ta bort
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-border rounded-lg">
                <Car className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-3">Inget körkort uppladdat</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*,.pdf';
                    input.onchange = async (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (!file) return;
                      try {
                        const ext = file.name.split('.').pop();
                        const filePath = `driver-licenses/${staffMember.id}/${Date.now()}.${ext}`;
                        const { error: uploadError } = await supabase.storage
                          .from('project-files')
                          .upload(filePath, file, { upsert: true });
                        if (uploadError) throw uploadError;
                        const { data: urlData } = supabase.storage.from('project-files').getPublicUrl(filePath);
                        await supabase.from('staff_members').update({ driver_license_url: urlData.publicUrl } as any).eq('id', staffMember.id);
                        await refetchStaff();
                        toast.success('Körkort uppladdat');
                      } catch (err) {
                        console.error('Upload error:', err);
                        toast.error('Kunde inte ladda upp körkortet');
                      }
                    };
                    input.click();
                  }}
                >
                  <Upload className="h-4 w-4 mr-1" />
                  Ladda upp körkort
                </Button>
              </div>
            )}
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
        <StaffAccountCard staffId={staffMember.id} staffName={staffMember.name} staffEmail={staffMember.email} tags={(staffMember as any).tags || []} />
        </TabsContent>

        <TabsContent value="timereports" className="flex-1 overflow-y-auto p-6 space-y-6 mt-0">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Clock className="h-5 w-5 text-primary/60" />
              Tidrapporter
            </h2>
            <Button size="sm" onClick={() => setShowTimeReportForm(!showTimeReportForm)}>
              <Plus className="h-4 w-4 mr-2" />
              Lägg till
            </Button>
          </div>

          {/* Tidrapportformulär */}
          {showTimeReportForm && (
            <TimeReportForm
              staffId={staffId}
              onSuccess={handleTimeReportSubmit}
              onCancel={() => setShowTimeReportForm(false)}
            />
          )}

          {/* Alla tidrapporter grupperade per månad */}
          {staffId && <StaffTimeReportAllMonths staffId={staffId} />}
        </TabsContent>
      </Tabs>
    </div>

    {staffId && staffMember && (
      <StaffAvailabilityDialog
        isOpen={showAvailabilityDialog}
        onClose={() => setShowAvailabilityDialog(false)}
        staffId={staffId}
        staffName={staffMember.name}
      />
    )}

    {/* Auto-created credentials dialog */}
    <Dialog open={showAutoCredentials} onOpenChange={setShowAutoCredentials}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Inloggningskonto skapat
          </DialogTitle>
          <DialogDescription className="text-destructive font-medium">
            ⚠️ Spara dessa uppgifter nu — lösenordet kan inte visas igen!
          </DialogDescription>
        </DialogHeader>

        {autoCredentials && (
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div>
                <span className="text-sm text-muted-foreground">Användarnamn:</span>
                <p className="font-mono font-medium">{autoCredentials.username}</p>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Lösenord:</span>
                  <Button variant="ghost" size="sm" onClick={() => setShowAutoPassword(!showAutoPassword)}>
                    {showAutoPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </Button>
                </div>
                <p className="font-mono font-medium">
                  {showAutoPassword ? autoCredentials.password : '••••••••'}
                </p>
              </div>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                navigator.clipboard.writeText(`Användarnamn: ${autoCredentials.username}\nLösenord: ${autoCredentials.password}`);
                toast.success('Kopierat till urklipp');
              }}
            >
              <Copy className="h-4 w-4 mr-2" />
              Kopiera uppgifter
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
};

export default StaffDetail;
