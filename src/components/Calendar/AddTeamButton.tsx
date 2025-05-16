
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, ChevronDown, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Resource } from '@/components/Calendar/ResourceData';

interface AddTeamButtonProps {
  onAddTeam: () => void;
  onRemoveTeam: (teamId: string) => void;
  teamCount: number;
  teamResources: Resource[];
}

const AddTeamButton: React.FC<AddTeamButtonProps> = ({ 
  onAddTeam, 
  onRemoveTeam, 
  teamCount,
  teamResources 
}) => {
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <div className="flex">
      <Button 
        onClick={onAddTeam}
        className="bg-[#9b87f5] hover:bg-[#7E69AB] text-white rounded-r-none border-r border-r-[#8a78d9]"
      >
        <Plus className="mr-1" size={18} />
        Add Team {teamCount}
      </Button>
      {teamResources.length > 0 && (
        <DropdownMenu open={showDropdown} onOpenChange={setShowDropdown}>
          <DropdownMenuTrigger asChild>
            <Button 
              className="bg-[#9b87f5] hover:bg-[#7E69AB] text-white rounded-l-none px-2"
            >
              <ChevronDown size={18} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {teamResources.map((team) => (
              <DropdownMenuItem 
                key={team.id}
                onClick={() => {
                  onRemoveTeam(team.id);
                  setShowDropdown(false);
                }}
                className="cursor-pointer"
              >
                <div className="flex items-center justify-between w-full">
                  <span>{team.title}</span>
                  <Trash2 size={14} className="text-red-500 ml-2" />
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};

export default AddTeamButton;
