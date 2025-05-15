
import React, { useEffect, useState } from 'react';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Resource } from '../Calendar/ResourceData';
import { fetchTeamResources } from '@/services/calendarService';

interface TeamSelectorProps {
  selectedTeamId: string;
  onTeamChange: (teamId: string) => void;
  label?: string;
  disabled?: boolean;
}

const TeamSelector = ({ 
  selectedTeamId, 
  onTeamChange, 
  label = "Select Team", 
  disabled = false 
}: TeamSelectorProps) => {
  const [teams, setTeams] = useState<Resource[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadTeams = async () => {
      try {
        setIsLoading(true);
        const teamResources = await fetchTeamResources();
        setTeams(teamResources);
      } catch (error) {
        console.error('Error loading teams:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadTeams();
  }, []);

  return (
    <div className="space-y-1">
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      <Select 
        value={selectedTeamId} 
        onValueChange={onTeamChange}
        disabled={disabled || isLoading}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a team" />
        </SelectTrigger>
        <SelectContent>
          {teams.map((team) => (
            <SelectItem key={team.id} value={team.id}>
              {team.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isLoading && <p className="text-xs text-gray-500">Loading teams...</p>}
    </div>
  );
};

export default TeamSelector;
