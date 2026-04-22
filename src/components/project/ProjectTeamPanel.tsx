import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X, Crown, Users, Loader2 } from 'lucide-react';
import { useProjectTeam } from '@/hooks/useProjectTeam';
import { format, eachDayOfInterval, parseISO } from 'date-fns';

interface ProjectTeamPanelProps {
  bookingId: string | null;
  projectLeader: string | null;
  onChangeLeader?: (newLeader: string) => void;
  projectStartDate?: string | null;
  projectEndDate?: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  field: 'Fält',
  team_leader: 'Teamledare',
  coordinator: 'Koordinator',
  project_manager: 'Projektledare',
};

const ProjectTeamPanel = ({
  bookingId,
  projectLeader,
  onChangeLeader,
  projectStartDate,
  projectEndDate,
}: ProjectTeamPanelProps) => {
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedRole, setSelectedRole] = useState('field');
  const [editingLeader, setEditingLeader] = useState(false);

  const { teamMembers, isLoading, addTeamMember, removeTeamMember, isAdding } = useProjectTeam(bookingId);

  const { data: allStaff = [] } = useQuery({
    queryKey: ['all-staff-for-team'],
    queryFn: async () => {
      const { data: staff } = await supabase
        .from('staff_members')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .order('full_name');

      const combined = new Map<string, string>();
      (staff || []).forEach(s => combined.set(s.id, s.name));
      (profiles || []).forEach(p => {
        if (p.full_name && !combined.has(p.user_id)) {
          combined.set(p.user_id, p.full_name);
        }
      });

      return Array.from(combined.entries()).map(([id, name]) => ({ id, name }));
    },
  });

  const existingIds = new Set(teamMembers.map(m => m.staff_id));
  const availableStaff = allStaff.filter(s => !existingIds.has(s.id));

  const handleAdd = async () => {
    if (!selectedStaffId || !bookingId) return;

    const start = projectStartDate || format(new Date(), 'yyyy-MM-dd');
    const end = projectEndDate || start;

    let dates: string[];
    try {
      dates = eachDayOfInterval({
        start: parseISO(start),
        end: parseISO(end),
      }).map(d => format(d, 'yyyy-MM-dd'));
    } catch {
      dates = [start];
    }

    await addTeamMember({ staffId: selectedStaffId, role: selectedRole, dates });
    setSelectedStaffId('');
  };

  const handleLeaderChange = (name: string) => {
    onChangeLeader?.(name);
    setEditingLeader(false);
  };

  const leaderDisplayName = projectLeader || 'Ej tilldelad';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4" />
          Projektteam
          {teamMembers.length > 0 && (
            <Badge variant="secondary" className="ml-1">{teamMembers.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add member */}
        <div className="flex gap-2">
          <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Välj..." />
            </SelectTrigger>
            <SelectContent>
              {availableStaff.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            onClick={handleAdd}
            disabled={!selectedStaffId || isAdding}
          >
            {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>

        {/* Project leader row */}
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Crown className="w-4 h-4 text-primary flex-shrink-0" />
            {editingLeader ? (
              <Select onValueChange={handleLeaderChange}>
                <SelectTrigger className="h-7 text-sm flex-1">
                  <SelectValue placeholder={leaderDisplayName} />
                </SelectTrigger>
                <SelectContent>
                  {allStaff.map(s => (
                    <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <button
                onClick={() => setEditingLeader(true)}
                className="text-sm font-medium hover:underline text-left truncate"
              >
                {leaderDisplayName}
              </button>
            )}
          </div>
          <Badge variant="outline" className="text-[10px] border-primary/30 text-primary font-semibold flex-shrink-0">
            HUVUDANSVARIG
          </Badge>
        </div>

        {/* Team list */}
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : teamMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Ingen personal tillagd i projektteamet ännu.
          </p>
        ) : (
          <div className="space-y-1.5">
            {teamMembers.map(member => (
              <div
                key={member.staff_id}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50 border border-border/50"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium truncate">{member.staff_name}</span>
                  <Badge variant="outline" className="text-[10px] flex-shrink-0">
                    {ROLE_LABELS[member.role] || member.role}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => removeTeamMember(member.staff_id)}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProjectTeamPanel;
