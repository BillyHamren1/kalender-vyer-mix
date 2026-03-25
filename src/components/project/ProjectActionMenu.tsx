import React from 'react';
import { MoreHorizontal, ArrowRightLeft, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import type { ProjectType } from '@/services/projectConversionService';

interface ProjectActionMenuProps {
  currentType: ProjectType;
  onConvert: (targetType: ProjectType) => void;
  onDelete: () => void;
  triggerClassName?: string;
  disabled?: boolean;
}

const TYPE_LABELS: Record<ProjectType, string> = {
  small: 'Litet projekt',
  medium: 'Medelprojekt',
  large: 'Stort projekt',
};

const ProjectActionMenu = ({ currentType, onConvert, onDelete, triggerClassName, disabled }: ProjectActionMenuProps) => {
  const otherTypes = (['medium', 'large'] as ProjectType[]).filter(t => t !== currentType);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={triggerClassName} disabled={disabled}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {otherTypes.map(type => (
          <DropdownMenuItem key={type} onSelect={() => onConvert(type)}>
            <ArrowRightLeft className="h-4 w-4 mr-2" />
            Ändra till {TYPE_LABELS[type]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="h-4 w-4 mr-2" />
          Ta bort projekt
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ProjectActionMenu;
