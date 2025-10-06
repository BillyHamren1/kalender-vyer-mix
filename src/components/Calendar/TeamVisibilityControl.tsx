import React from 'react';
import { Button } from '@/components/ui/button';
import { Users } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Resource } from './ResourceData';

interface TeamVisibilityControlProps {
  allTeams: Resource[];
  visibleTeams: string[];
  onToggleTeam: (teamId: string) => void;
}

const TeamVisibilityControl: React.FC<TeamVisibilityControlProps> = ({
  allTeams,
  visibleTeams,
  onToggleTeam,
}) => {
  const visibleCount = visibleTeams.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          Teams ({visibleCount})
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3">
        <div className="space-y-3">
          <p className="text-sm font-medium mb-2">Välj teams att visa:</p>
          {allTeams.map(team => {
            const isVisible = visibleTeams.includes(team.id);
            const isRequired = ['team-1', 'team-2', 'team-11'].includes(team.id);
            
            return (
              <div key={team.id} className="flex items-center space-x-2">
                <Checkbox
                  id={team.id}
                  checked={isVisible}
                  onCheckedChange={() => onToggleTeam(team.id)}
                  disabled={isRequired}
                />
                <Label
                  htmlFor={team.id}
                  className={`text-sm cursor-pointer ${isRequired ? 'text-muted-foreground' : ''}`}
                >
                  {team.title}
                  {isRequired && ' (obligatorisk)'}
                </Label>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default TeamVisibilityControl;
