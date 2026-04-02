import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserPlus, X, Crown, Users, Briefcase, HardHat, Shield } from 'lucide-react';
import { useProjectTeam } from '@/hooks/useProjectTeam';
import { format, eachDayOfInterval, parseISO } from 'date-fns';

interface ProjectTeamPanelProps {
  bookingId: string | null;
  projectLeader: string | null;
  onChangeLeader?: (newLeader: string) => void;
  /** Date range for adding project managers (defaults to a wide range) */
  projectStartDate?: string | null;
  projectEndDate?: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  field: 'FÄLT',
  project_manager: 'PROJEKTLEDARE',
  coordinator: 'KOORDINATOR',
  team_leader: 'TEAMLEDARE',
};

const ROLE_ICONS: Record<string, React.ElementType> = {
  field: HardHat,
  project_manager: Briefcase,
  coordinator: Users,
  team_leader: Shield,
};

const ProjectTeamPanel = ({
  bookingId,
  projectLeader,
  onChangeLeader,
  projectStartDate,
  projectEndDate,
}: ProjectTeamPanelProps) => {
  const [adding, setAdding] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState('');
  const [selectedRole, setSelectedRole] = useState('project_manager');
  const [editingLeader, setEditingLeader] = useState(false);

  const { teamMembers, fieldStaff, projectStaff, isLoading, addTeamMember, removeTeamMember, isAdding } = useProjectTeam(bookingId);

  // Fetch all available staff and profiles for adding
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
    enabled: adding,
  });

  const existingIds = new Set(teamMembers.map(m => m.staff_id));

  const handleAddMember = async () => {
    if (!selectedStaff || !bookingId) return;

    // Generate dates for the team member
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

    await addTeamMember({ staffId: selectedStaff, role: selectedRole, dates });
    setAdding(false);
    setSelectedStaff('');
  };

  const handleLeaderChange = (name: string) => {
    onChangeLeader?.(name);
    setEditingLeader(false);
  };

  const leaderDisplayName = projectLeader || 'Ej tilldelad';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Projektteam</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">
          {teamMembers.length} {teamMembers.length === 1 ? 'person' : 'personer'}
        </span>
      </div>

      {/* Project leader */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
        <Crown className="h-4 w-4 text-primary flex-shrink-0" />
        {editingLeader ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Select onValueChange={handleLeaderChange}>
              <SelectTrigger className="h-8 text-sm flex-1">
                <SelectValue placeholder={leaderDisplayName} />
              </SelectTrigger>
              <SelectContent>
                {allStaff.map(s => (
                  <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                ))}
                {teamMembers.map(m => (
                  !allStaff.find(s => s.name === m.staff_name) && (
                    <SelectItem key={m.staff_id} value={m.staff_name}>{m.staff_name}</SelectItem>
                  )
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditingLeader(false)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <>
            <button
              onClick={() => setEditingLeader(true)}
              className="text-sm font-medium text-foreground hover:underline cursor-pointer text-left"
            >
              {leaderDisplayName}
            </button>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary font-semibold ml-auto flex-shrink-0">
              HUVUDANSVARIG
            </Badge>
          </>
        )}
      </div>

      {/* Project staff (non-field) */}
      {projectStaff.map(m => {
        const RoleIcon = ROLE_ICONS[m.role] || Briefcase;
        return (
          <div key={m.staff_id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/30 border border-accent/40 group">
            <RoleIcon className="h-3.5 w-3.5 text-accent-foreground/70 flex-shrink-0" />
            <span className="text-sm text-foreground flex-1">{m.staff_name}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-accent-foreground/70 font-medium">
              {ROLE_LABELS[m.role] || m.role.toUpperCase()}
            </Badge>
            <button
              onClick={() => removeTeamMember(m.staff_id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10"
            >
              <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        );
      })}

      {/* Field staff */}
      {fieldStaff.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 pt-1">
            <HardHat className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Fältpersonal ({fieldStaff.length})
            </span>
          </div>
          {fieldStaff.map(m => (
            <div key={m.staff_id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border/40">
              <HardHat className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-sm text-foreground flex-1">{m.staff_name}</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground font-medium">
                FÄLT
              </Badge>
            </div>
          ))}
        </>
      )}

      {/* No team members */}
      {!isLoading && teamMembers.length === 0 && (
        <p className="text-xs text-muted-foreground px-3 py-2 italic">
          Bemanna via kalendern för att lägga till fältpersonal
        </p>
      )}

      {/* Add team member */}
      {adding ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger className="h-8 text-sm w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="team_leader">Teamledare</SelectItem>
                <SelectItem value="project_manager">Projektledare</SelectItem>
                <SelectItem value="coordinator">Koordinator</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedStaff} onValueChange={setSelectedStaff}>
              <SelectTrigger className="h-8 text-sm flex-1">
                <SelectValue placeholder="Välj person..." />
              </SelectTrigger>
              <SelectContent>
                {allStaff
                  .filter(s => !existingIds.has(s.id))
                  .map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={handleAddMember}
              disabled={!selectedStaff || isAdding}
            >
              Lägg till
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => { setAdding(false); setSelectedStaff(''); }}>
              Avbryt
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setAdding(true)}
        >
          <UserPlus className="h-3.5 w-3.5 mr-1" />
          Lägg till i projektteam
        </Button>
      )}
    </div>
  );
};

export default ProjectTeamPanel;
