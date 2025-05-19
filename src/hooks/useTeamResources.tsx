
import { useState, useEffect } from 'react';
import { Resource } from '@/components/Calendar/ResourceData';
import { saveResourcesToStorage, loadResourcesFromStorage } from '@/components/Calendar/ResourceData';
import { saveResources, renameTeam } from '@/services/teamService';
import { toast } from 'sonner';

export const useTeamResources = () => {
  const [resources, setResources] = useState<Resource[]>([]);
  const [teamCount, setTeamCount] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  useEffect(() => {
    const loadedResources = loadResourcesFromStorage();
    setResources(loadedResources);
    
    // Set teamCount based on the highest team number
    const teamIds = loadedResources
      .filter(res => res.id.startsWith('team-'))
      .map(res => {
        const match = res.id.match(/team-(\d+)/);
        return match ? parseInt(match[1]) : 0;
      });
    
    const maxTeamNumber = teamIds.length > 0 ? Math.max(...teamIds) : 0;
    setTeamCount(maxTeamNumber + 1);
    
    // Ensure "Todays events" team exists and has the right name
    const team6Index = loadedResources.findIndex(res => res.id === 'team-6');
    if (team6Index !== -1 && loadedResources[team6Index].title !== "Todays events") {
      // Rename Team 6 to "Todays events"
      const updatedResources = [...loadedResources];
      updatedResources[team6Index].title = "Todays events";
      updatedResources[team6Index].eventColor = '#FEF7CD'; // Match yellow event color
      setResources(updatedResources);
      saveResourcesToStorage(updatedResources);
      saveResources(updatedResources);
    }
  }, []);
  
  useEffect(() => {
    if (resources.length > 0) {
      saveResourcesToStorage(resources);
      saveResources(resources);
    }
  }, [resources]);

  const addTeam = () => {
    const newTeamId = `team-${teamCount}`;
    const newResource: Resource = {
      id: newTeamId,
      title: `Team ${teamCount}`,
      eventColor: '#9b87f5'
    };
    
    setResources([...resources, newResource]);
    setTeamCount(prevCount => prevCount + 1);
    
    toast("Team tillagt", {
      description: `Team ${teamCount} har lagts till i kalendern`,
      duration: 3000,
    });
  };

  const removeTeam = (teamId: string) => {
    const teamToRemove = resources.find(resource => resource.id === teamId);
    if (!teamToRemove) return;
    
    setResources(resources.filter(resource => resource.id !== teamId));
    
    toast("Team borttaget", {
      description: `${teamToRemove.title} har tagits bort från kalendern`,
      duration: 3000,
    });
  };

  // Get only the team resources (not room resources)
  const teamResources = resources.filter(resource => resource.id.startsWith('team-'));
  
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
