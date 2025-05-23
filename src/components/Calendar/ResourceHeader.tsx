
import React from 'react';
import TeamManagementDialog from './TeamManagementDialog';
import AddTeamButton from './AddTeamButton';
import { Resource } from '../Calendar/ResourceData';
import { useIsMobile } from '@/hooks/use-mobile';

interface ResourceHeaderProps {
  teamResources: Resource[];
  teamCount: number;
  onAddTeam: (teamName: string) => void;
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
  const isMobile = useIsMobile();

  return (
    <div className={`flex ${isMobile ? 'flex-col gap-3' : 'justify-end'} items-center mb-6`}>
      <div className={`flex ${isMobile ? 'w-full justify-center' : ''} space-x-3`}>
        <TeamManagementDialog
          teamResources={teamResources}
          teamCount={teamCount}
          onAddTeam={onAddTeam}
          onRemoveTeam={onRemoveTeam}
          dialogOpen={dialogOpen}
          setDialogOpen={setDialogOpen}
        />
        <AddTeamButton 
          onAddTeam={onAddTeam} 
          onRemoveTeam={onRemoveTeam} 
          teamCount={teamCount} 
          teamResources={teamResources} 
        />
      </div>
    </div>
  );
};

export default ResourceHeader;
