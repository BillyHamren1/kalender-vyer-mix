import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserPlus, X, Crown, Users } from 'lucide-react';
import { toast } from 'sonner';

// Hardcoded default assistants for Frans August
const DEFAULT_TEAM = ['Billy', 'Joel', 'Ranjan'];

interface ProjectAssistantsProps {
  projectId: string;
  projectType: 'small' | 'medium' | 'large';
  projectLeader: string | null;
  onChangeLeader?: (newLeader: string) => void;
}

export const useProjectAssistants = (projectId: string, projectType: string) => {
  return useQuery({
    queryKey: ['project-assistants', projectId, projectType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_assistants')
        .select('*')
        .eq('project_id', projectId)
        .eq('project_type', projectType)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!projectId,
  });
};

export const autoAssignAssistants = async (
  projectId: string,
  projectType: string,
  leaderName: string | null
) => {
  if (!leaderName) return;
  
  const leaderFirstName = leaderName.split(' ')[0];
  const assistants = DEFAULT_TEAM.filter(
    name => name.toLowerCase() !== leaderFirstName.toLowerCase()
  );

  if (assistants.length === 0) return;

  const rows = assistants.map(name => ({
    project_id: projectId,
    project_type: projectType,
    assistant_name: name,
  }));

  const { error } = await supabase
    .from('project_assistants')
    .upsert(rows as any, { onConflict: 'project_id,project_type,assistant_name' });

  if (error) {
    console.error('Failed to auto-assign assistants:', error);
  }
};

const ProjectAssistants = ({ projectId, projectType, projectLeader, onChangeLeader }: ProjectAssistantsProps) => {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [selectedName, setSelectedName] = useState('');
  const [editingLeader, setEditingLeader] = useState(false);

  const { data: assistants = [] } = useProjectAssistants(projectId, projectType);

  // Available names for dropdowns – always loaded so leader dropdown works
  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles-list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .order('full_name');
      return (data || []).filter(p => p.full_name || p.email);
    },
  });

  const leaderDisplayName = projectLeader || 'Ej tilldelad';

  const addMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from('project_assistants')
        .insert({ project_id: projectId, project_type: projectType, assistant_name: name } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-assistants', projectId, projectType] });
      setAdding(false);
      setSelectedName('');
      toast.success('Assistent tillagd');
    },
    onError: () => toast.error('Kunde inte lägga till assistent'),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('project_assistants')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-assistants', projectId, projectType] });
      toast.success('Assistent borttagen');
    },
    onError: () => toast.error('Kunde inte ta bort assistent'),
  });

  const existingNames = new Set(assistants.map(a => a.assistant_name.toLowerCase()));

  // Build combined options: profiles + DEFAULT_TEAM names not in profiles
  const profileNames = profiles.map(p => p.full_name || p.email || '');
  const allOptions = [
    ...profileNames,
    ...DEFAULT_TEAM.filter(name => !profileNames.some(pn => pn.toLowerCase() === name.toLowerCase())),
  ];

  const handleLeaderChange = (name: string) => {
    if (onChangeLeader) {
      onChangeLeader(name);
      toast.success(`Projektledare ändrad till ${name}`);
    }
    setEditingLeader(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Projektteam</h3>
      </div>

      {/* Main project leader */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
        <Crown className="h-4 w-4 text-primary flex-shrink-0" />
        {editingLeader ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Select onValueChange={handleLeaderChange}>
              <SelectTrigger className="h-8 text-sm flex-1">
                <SelectValue placeholder={leaderDisplayName} />
              </SelectTrigger>
              <SelectContent>
                {allOptions.map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
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

      {/* Assistants */}
      {assistants.map(a => (
        <div key={a.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border/40 group">
          <Users className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-sm text-foreground flex-1">{a.assistant_name}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground font-medium">
            ASSISTENT
          </Badge>
          <button
            onClick={() => removeMutation.mutate(a.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10"
          >
            <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
          </button>
        </div>
      ))}

      {/* Add assistant */}
      {adding ? (
        <div className="flex items-center gap-2">
          <Select value={selectedName} onValueChange={setSelectedName}>
            <SelectTrigger className="h-8 text-sm flex-1">
              <SelectValue placeholder="Välj person..." />
            </SelectTrigger>
            <SelectContent>
              {allOptions
                .filter(name => !existingNames.has(name.toLowerCase()))
                .filter(name => name.toLowerCase() !== (projectLeader || '').toLowerCase())
                .map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => selectedName && addMutation.mutate(selectedName)}
            disabled={!selectedName || addMutation.isPending}
          >
            Lägg till
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => { setAdding(false); setSelectedName(''); }}>
            Avbryt
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setAdding(true)}
        >
          <UserPlus className="h-3.5 w-3.5 mr-1" />
          Lägg till assistent
        </Button>
      )}
    </div>
  );
};

export default ProjectAssistants;
