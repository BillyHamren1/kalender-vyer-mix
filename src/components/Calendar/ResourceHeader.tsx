
import React from 'react';
import TeamManagementDialog from './TeamManagementDialog';
import AddTeamButton from './AddTeamButton';
import { Resource } from '../Calendar/ResourceData';

interface ResourceHeaderProps {
  teamResources: Resource[];
  teamCount: number;
  onAddTeam: () => void;
  onRemoveTeam: (teamId: string) => void;
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
}

const ResourceHeader: React.FC<ResourceHeaderProps> = ({
  teamResources,
  teamCount,
  onAddTeam,
  onRemoveTeam,
  dialogOpen,
  setDialogOpen
}) => {
  return (
    <div className="flex justify-between items-center mb-6">
      <h1 className="text-2xl font-bold text-gray-800">Resursvy</h1>
      <div className="flex space-x-3">
        <AddTeamButton 
          onAddTeam={onAddTeam} 
          onRemoveTeam={onRemoveTeam} 
          teamCount={teamCount} 
          teamResources={teamResources} 
        />
        <TeamManagementDialog
          teamResources={teamResources}
          teamCount={teamCount}
          onAddTeam={onAddTeam}
          onRemoveTeam={onRemoveTeam}
          dialogOpen={dialogOpen}
          setDialogOpen={setDialogOpen}
        />
      </div>
    </div>
  );
};

export default ResourceHeader;
