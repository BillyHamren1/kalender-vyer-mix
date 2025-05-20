
import React from 'react';
import { Link } from 'react-router-dom';
import TeamManagementDialog from './TeamManagementDialog';
import AddTeamButton from './AddTeamButton';
import { Resource } from '../Calendar/ResourceData';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { List } from 'lucide-react';

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
    <div className={`flex ${isMobile ? 'flex-col gap-3' : 'justify-between'} items-center mb-6`}>
      <h1 className="text-2xl font-bold text-gray-800"></h1>
      <div className={`flex ${isMobile ? 'w-full justify-center' : ''} space-x-3`}>
        <Link to="/booking-list">
          <Button variant="outline" className="flex items-center gap-2">
            <List className="h-4 w-4" />
            List view
          </Button>
        </Link>
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
