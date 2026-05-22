import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Plus,
  Search,
  RotateCcw,
  Download,
  UserPlus,
  MoreHorizontal,
  Clock,
  Sparkles,
  KeyRound,
  UserX,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageContainer } from '@/components/ui/PageContainer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { fetchStaffMembers, updateStaffColor } from '@/services/staffService';
import { importStaffData } from '@/services/staffImportService';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import StaffList from '@/components/staff/StaffList';
import AddStaffDialog from '@/components/staff/AddStaffDialog';
import EditStaffDialog from '@/components/staff/EditStaffDialog';
import StaffAccountsPanel from '@/components/staff/StaffAccountsPanel';
import StaffExportDialog from '@/components/staff/StaffExportDialog';
import type { LucideIcon } from 'lucide-react';

/* ── Premium KPI Card ── */
function KpiCard({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  tone?: 'default' | 'success' | 'warning';
}) {
  const palette = {
    default: {
      iconBg: 'hsl(var(--primary) / 0.10)',
      iconColor: 'hsl(var(--primary))',
    },
    success: {
      iconBg: 'hsl(150 50% 88%)',
      iconColor: 'hsl(150 55% 28%)',
    },
    warning: {
      iconBg: 'hsl(35 90% 88%)',
      iconColor: 'hsl(28 75% 38%)',
    },
  }[tone];

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-2xl"
      style={{
        background:
          'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(270 30% 98.5%) 100%)',
        border: '1px solid hsl(270 25% 88% / 0.8)',
        boxShadow:
          '0 1px 2px hsl(270 30% 25% / 0.04), inset 0 1px 0 hsl(0 0% 100% / 0.6)',
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: palette.iconBg }}
      >
        <Icon className="w-[18px] h-[18px]" strokeWidth={2.1} style={{ color: palette.iconColor }} />
      </div>
      <div className="flex flex-col leading-tight min-w-0">
        <span
          className="text-[20px] font-bold tabular-nums tracking-tight"
          style={{ color: 'hsl(280 40% 18%)' }}
        >
          {value}
        </span>
        <span
          className="text-[10.5px] font-medium uppercase tracking-[0.07em] truncate"
          style={{ color: 'hsl(270 14% 50%)' }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

const StaffManagement: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedStaffForEdit, setSelectedStaffForEdit] = useState<any>(null);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isImportingStaff, setIsImportingStaff] = useState(false);

  const {
    data: staffMembers = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['staffMembers'],
    queryFn: () => fetchStaffMembers({ includeInactive: true }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Reuse the same key as StaffAccountsPanel so we share cache.
  const { data: staffAccounts = [] } = useQuery({
    queryKey: ['staffAccounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_accounts')
        .select('id, staff_id, username, created_at');
      if (error) throw error;
      return data as { id: string; staff_id: string; username: string; created_at: string }[];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const handleRefresh = () => {
    refetch();
    toast.success('Personallistan uppdaterad');
  };

  const handleStaffImport = async () => {
    setIsImportingStaff(true);
    try {
      const result = await importStaffData();
      if (result.success) refetch();
    } catch (error) {
      console.error('Staff import failed:', error);
    } finally {
      setIsImportingStaff(false);
    }
  };

  const handleStaffAdded = () => {
    setIsAddDialogOpen(false);
    refetch();
    toast.success('Personal tillagd');
  };

  const handleStaffUpdated = () => {
    setSelectedStaffForEdit(null);
    refetch();
    toast.success('Personal uppdaterad');
  };

  const handleColorUpdate = async (staffId: string, color: string) => {
    await updateStaffColor(staffId, color);
    refetch();
  };

  const filteredStaff = staffMembers.filter(
    (staff) =>
      staff.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      staff.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      staff.phone?.includes(searchTerm) ||
      staff.role?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const kpis = useMemo(() => {
    const total = staffMembers.length;
    const active = staffMembers.filter((s: any) => s.is_active !== false).length;
    const accountIds = new Set(staffAccounts.map((a) => a.staff_id));
    const withAccount = staffMembers.filter((s) => accountIds.has(s.id)).length;
    const withoutAccount = total - withAccount;
    return { total, active, withAccount, withoutAccount };
  }, [staffMembers, staffAccounts]);

  if (error) {
    return (
      <PageContainer theme="purple">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-destructive mb-4">
              Kunde inte ladda personal: {(error as any).message}
            </p>
            <Button onClick={handleRefresh}>Försök igen</Button>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer theme="purple">
      {/* ── PREMIUM HEADER ── */}
      <header
        className="relative rounded-2xl overflow-hidden mb-6"
        style={{
          background:
            'linear-gradient(135deg, hsl(270 50% 96%) 0%, hsl(280 45% 94%) 50%, hsl(265 40% 96%) 100%)',
          border: '1px solid hsl(270 25% 86% / 0.6)',
          boxShadow:
            '0 1px 3px hsl(270 30% 25% / 0.04), inset 0 1px 0 hsl(0 0% 100% / 0.6)',
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 60% 60% at 15% -20%, hsl(270 60% 60% / 0.10), transparent 70%)',
          }}
        />

        <div className="relative px-5 py-5">
          {/* Title row */}
          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                style={{
                  background:
                    'linear-gradient(135deg, hsl(270 55% 60%) 0%, hsl(285 55% 45%) 100%)',
                  boxShadow:
                    '0 2px 6px hsl(270 50% 35% / 0.25), inset 0 1px 0 hsl(0 0% 100% / 0.25)',
                }}
              >
                <Sparkles className="w-5 h-5 text-white" strokeWidth={2} />
              </div>
              <div className="flex flex-col leading-tight min-w-0">
                <h1
                  className="text-[20px] font-bold tracking-tight truncate"
                  style={{ color: 'hsl(280 45% 18%)' }}
                >
                  Personal
                </h1>
                <span
                  className="text-[12px] font-medium"
                  style={{ color: 'hsl(270 18% 42%)' }}
                >
                  Hantera personal och konton
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-[hsl(270_25%_82%)] bg-white/70 backdrop-blur hover:bg-white"
                onClick={() => navigate('/staff-management/time-reports')}
              >
                <Clock className="h-4 w-4 mr-1.5" />
                Tidrapporter
              </Button>

              <button
                onClick={() => setIsAddDialogOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-150 hover:brightness-110"
                style={{
                  background:
                    'linear-gradient(180deg, hsl(270 55% 58%) 0%, hsl(282 55% 48%) 100%)',
                  boxShadow:
                    '0 1px 0 hsl(0 0% 100% / 0.2) inset, 0 2px 6px hsl(280 50% 35% / 0.28)',
                }}
              >
                <Plus className="h-4 w-4" strokeWidth={2.2} />
                Lägg till
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-xl border-[hsl(270_25%_82%)] bg-white/70 backdrop-blur hover:bg-white"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-card">
                  <DropdownMenuItem onClick={handleStaffImport} disabled={isImportingStaff}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Importera
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsExportDialogOpen(true)}>
                    <Download className="h-4 w-4 mr-2" />
                    Exportera
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleRefresh} disabled={isLoading}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Uppdatera
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* KPI grid */}
          <div className="relative mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard icon={Users} label="Antal personer" value={kpis.total} />
            <KpiCard
              icon={CheckCircle2}
              label="Aktiva"
              value={kpis.active}
              tone="success"
            />
            <KpiCard
              icon={KeyRound}
              label="Med konto"
              value={kpis.withAccount}
            />
            <KpiCard
              icon={UserX}
              label="Utan konto"
              value={kpis.withoutAccount}
              tone={kpis.withoutAccount > 0 ? 'warning' : 'default'}
            />
          </div>
        </div>
      </header>

      {/* ── MAIN GRID ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Staff list card */}
        <section
          className="lg:col-span-2 planning-card overflow-hidden"
          style={{ padding: 0 }}
        >
          <div
            className="flex items-center justify-between px-5 py-3.5"
            style={{ borderBottom: '1px solid hsl(270 20% 90%)' }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'hsl(var(--primary) / 0.10)' }}
              >
                <Users className="w-4 h-4" style={{ color: 'hsl(var(--primary))' }} strokeWidth={2.1} />
              </div>
              <div className="flex flex-col leading-tight">
                <h2
                  className="text-[14px] font-semibold tracking-tight"
                  style={{ color: 'hsl(280 40% 18%)' }}
                >
                  Personalkatalog
                </h2>
                <span
                  className="text-[11px] font-medium"
                  style={{ color: 'hsl(270 14% 50%)' }}
                >
                  {filteredStaff.length} av {staffMembers.length} personer
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-4">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <Input
                placeholder="Sök namn, e-post, telefon eller roll..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="planning-input pl-10 h-10 rounded-xl bg-white"
              />
            </div>

            <StaffList
              staffMembers={filteredStaff}
              isLoading={isLoading}
              onRefresh={refetch}
              onEdit={setSelectedStaffForEdit}
            />
          </div>
        </section>

        {/* Accounts side panel */}
        <aside className="space-y-5">
          <StaffAccountsPanel />
        </aside>
      </div>

      {/* Dialogs */}
      <AddStaffDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onStaffAdded={handleStaffAdded}
      />

      {selectedStaffForEdit && (
        <EditStaffDialog
          staff={selectedStaffForEdit}
          isOpen={!!selectedStaffForEdit}
          onClose={() => setSelectedStaffForEdit(null)}
          onStaffUpdated={handleStaffUpdated}
          onColorUpdate={handleColorUpdate}
        />
      )}

      <StaffExportDialog
        isOpen={isExportDialogOpen}
        onClose={() => setIsExportDialogOpen(false)}
        staffMembers={staffMembers}
      />
    </PageContainer>
  );
};

export default StaffManagement;
