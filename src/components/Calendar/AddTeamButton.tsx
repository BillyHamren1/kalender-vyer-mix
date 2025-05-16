
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
import { useIsMobile } from '@/hooks/use-mobile';

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
  const isMobile = useIsMobile();

  return (
    <div className="flex">
      <Button 
        onClick={onAddTeam}
        className={`bg-[#7BAEBF] hover:bg-[#6E9DAC] text-white text-sm ${
          teamResources.length > 0 ? 'rounded-r-none' : ''
        } border-r border-r-[#6ca2b4] ${
          isMobile ? 'px-2 py-1 h-8' : 'px-3 py-1 h-9'
        }`}
        size="sm"
      >
        <Plus className={`${isMobile ? 'mr-0.5' : 'mr-1'}`} size={isMobile ? 14 : 16} />
        Add team
      </Button>
      {teamResources.length > 0 && (
        <DropdownMenu open={showDropdown} onOpenChange={setShowDropdown}>
          <DropdownMenuTrigger asChild>
            <Button 
              className={`bg-[#7BAEBF] hover:bg-[#6E9DAC] text-white rounded-l-none ${
                isMobile ? 'px-1 h-8' : 'px-1.5 h-9'
              }`}
              size="sm"
            >
              <ChevronDown size={isMobile ? 14 : 16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={`${isMobile ? 'w-40' : 'w-48'}`}>
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
                  <span className={isMobile ? 'text-xs' : ''}>{team.title}</span>
                  <Trash2 size={isMobile ? 12 : 14} className="text-red-500 ml-2" />
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
