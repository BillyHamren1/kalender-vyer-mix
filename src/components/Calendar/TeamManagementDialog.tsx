
import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Edit } from 'lucide-react';
import TeamManager from '@/components/Calendar/TeamManager';
import { Resource } from '../Calendar/ResourceData';

interface TeamManagementDialogProps {
  teamResources: Resource[];
  teamCount: number;
  onAddTeam: () => void;
  onRemoveTeam: (teamId: string) => void;
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
}

const TeamManagementDialog: React.FC<TeamManagementDialogProps> = ({
  teamResources,
  teamCount,
  onAddTeam,
  onRemoveTeam,
  dialogOpen,
  setDialogOpen
}) => {
  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button 
          className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white"
        >
          <Edit className="mr-1" size={18} />
          Edit team
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            Hantera Teams
          </DialogTitle>
          <DialogDescription>
            Lägg till eller ta bort team i kalendern.
          </DialogDescription>
        </DialogHeader>
        <TeamManager 
          teams={teamResources} 
          onAddTeam={onAddTeam} 
          onRemoveTeam={onRemoveTeam} 
          teamCount={teamCount}
        />
      </DialogContent>
    </Dialog>
  );
};

export default TeamManagementDialog;
