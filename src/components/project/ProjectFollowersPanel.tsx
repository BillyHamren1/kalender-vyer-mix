import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserPlus, X, Users } from 'lucide-react';
import {
  useProjectFollowers,
  type ProjectFollowerType,
} from '@/hooks/useProjectFollowers';

interface Props {
  projectId: string | null;
  projectType: ProjectFollowerType;
  className?: string;
}

const ProjectFollowersPanel = ({ projectId, projectType, className }: Props) => {
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const { followers, isLoading, addFollower, removeFollower, isAdding } =
    useProjectFollowers({ projectId, projectType });

  const { data: allStaff = [] } = useQuery({
    queryKey: ['all-staff-followers-picker'],
    queryFn: async () => {
      const { data } = await supabase
        .from('staff_members')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      return data || [];
    },
  });

  const followedIds = useMemo(
    () => new Set(followers.map((f) => f.staff_id)),
    [followers],
  );
  const pickable = useMemo(
    () => allStaff.filter((s: any) => !followedIds.has(s.id)),
    [allStaff, followedIds],
  );

  const handleAdd = () => {
    if (!selectedStaffId) return;
    addFollower(selectedStaffId);
    setSelectedStaffId('');
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4" />
          Mina projekt – tilldelade
          {followers.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {followers.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Tilldelade personer ser detta projekt under "Mina projekt".
        </p>

        <div className="flex gap-2">
          <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
            <SelectTrigger className="h-9 flex-1">
              <SelectValue placeholder="Välj person…" />
            </SelectTrigger>
            <SelectContent>
              {pickable.length === 0 && (
                <div className="px-2 py-2 text-xs text-muted-foreground">
                  Alla aktiva är redan tilldelade
                </div>
              )}
              {pickable.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={!selectedStaffId || isAdding}
          >
            <UserPlus className="h-4 w-4 mr-1" />
            Tilldela
          </Button>
        </div>

        {isLoading ? (
          <div className="text-xs text-muted-foreground">Laddar…</div>
        ) : followers.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">
            Ingen tilldelad ännu
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {followers.map((f) => (
              <Badge
                key={f.id}
                variant="outline"
                className="flex items-center gap-1 pl-2 pr-1 py-1"
              >
                {f.staff_name}
                <button
                  type="button"
                  onClick={() => removeFollower(f.id)}
                  className="ml-1 rounded-full hover:bg-muted p-0.5"
                  aria-label={`Ta bort ${f.staff_name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProjectFollowersPanel;
