
import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

interface AddTeamButtonProps {
  onAddTeam: () => void;
  teamCount: number;
}

const AddTeamButton: React.FC<AddTeamButtonProps> = ({ onAddTeam, teamCount }) => {
  return (
    <Button 
      onClick={onAddTeam}
      className="bg-[#9b87f5] hover:bg-[#7E69AB] text-white"
    >
      <Plus className="mr-1" size={18} />
      Add Team {teamCount}
    </Button>
  );
};

export default AddTeamButton;
