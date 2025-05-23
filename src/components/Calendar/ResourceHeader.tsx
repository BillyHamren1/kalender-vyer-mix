
import React from 'react';
import TeamManagementDialog from './TeamManagementDialog';
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
    <div className={`flex justify-end items-center mb-2`}>
      <TeamManagementDialog
        teamResources={teamResources}
        teamCount={teamCount}
        onAddTeam={onAddTeam}
        onRemoveTeam={onRemoveTeam}
        dialogOpen={dialogOpen}
        setDialogOpen={setDialogOpen}
      />
    </div>
  );
};

export default ResourceHeader;
