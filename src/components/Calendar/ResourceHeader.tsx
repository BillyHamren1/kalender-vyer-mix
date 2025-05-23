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
    <div className="mb-2">
      {/* Header is now empty - team management moved below */}
    </div>
  );
};

export default ResourceHeader;
