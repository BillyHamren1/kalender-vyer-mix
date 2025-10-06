import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
  const hiddenTeams = allTeams.filter(team => !visibleTeams.includes(team.id));
  const visibleTeamObjects = allTeams.filter(team => visibleTeams.includes(team.id));

  return (
    <div className="flex items-center gap-2">
      {/* Display visible teams with option to hide (except Team 1, 2, and Live) */}
      <div className="flex items-center gap-1">
        {visibleTeamObjects.map(team => (
          <div
            key={team.id}
            className="flex items-center gap-1 px-2 py-1 bg-muted rounded-md text-sm"
          >
            <span>{team.title}</span>
            {!['team-1', 'team-2', 'team-11'].includes(team.id) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 hover:bg-destructive/10"
                onClick={() => onToggleTeam(team.id)}
                title={`Hide ${team.title}`}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {/* Add Team button with dropdown */}
      {hiddenTeams.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="flex items-center gap-1">
              <Plus className="h-4 w-4" />
              Team
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground mb-2">Visa team:</p>
              {hiddenTeams.map(team => (
                <Button
                  key={team.id}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => onToggleTeam(team.id)}
                >
                  {team.title}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};

export default TeamVisibilityControl;
