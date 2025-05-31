
import { useState, useEffect } from 'react';
import { Resource } from '@/components/Calendar/ResourceData';

export const useTeamResources = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // FIXED: Create a proper resources array with team-1, team-2, etc.
  const [resources, setResources] = useState<Resource[]>([
    { id: 'team-1', title: 'Team 1', eventColor: '#3b82f6' },
    { id: 'team-2', title: 'Team 2', eventColor: '#10b981' },
    { id: 'team-3', title: 'Team 3', eventColor: '#f59e0b' },
    { id: 'team-4', title: 'Team 4', eventColor: '#ef4444' },
    { id: 'team-5', title: 'Team 5', eventColor: '#8b5cf6' },
    { id: 'team-6', title: 'Team 6', eventColor: '#06b6d4' }
  ]);

  // Debug logging to verify resources
  useEffect(() => {
    console.log('🔧 useTeamResources: Current resources:', resources.map(r => ({ id: r.id, title: r.title })));
  }, [resources]);

  const teamResources = resources;
  const teamCount = resources.length;

  const addTeam = () => {
    const nextTeamNumber = teamCount + 1;
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16'];
    const newTeam: Resource = {
      id: `team-${nextTeamNumber}`,
      title: `Team ${nextTeamNumber}`,
      eventColor: colors[(nextTeamNumber - 1) % colors.length]
    };
    
    console.log('🔧 useTeamResources: Adding new team:', newTeam);
    setResources(prev => [...prev, newTeam]);
  };

  const removeTeam = () => {
    if (teamCount > 1) {
      const updatedResources = resources.slice(0, -1);
      console.log('🔧 useTeamResources: Removing team. New resources:', updatedResources.map(r => ({ id: r.id, title: r.title })));
      setResources(updatedResources);
    }
  };

  return {
    resources,
    teamResources,
    teamCount,
    dialogOpen,
    setDialogOpen,
    addTeam,
    removeTeam
  };
};
