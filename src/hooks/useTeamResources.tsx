import { useState, useEffect } from 'react';
import { Resource } from '@/components/Calendar/ResourceData';
import { saveResourcesToStorage, loadResourcesFromStorage } from '@/components/Calendar/ResourceData';
import { saveResources, renameTeam } from '@/services/teamService';
import { toast } from 'sonner';

export const useTeamResources = () => {
  const [resources, setResources] = useState<Resource[]>([]);
  const [teamCount, setTeamCount] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [initialSetupComplete, setInitialSetupComplete] = useState(false);
  const [cleanupDone, setCleanupDone] = useState(false);
  
  // Load resources on initial mount only
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
    
    setInitialSetupComplete(true);
  }, []);
  
  // Clean up teams - remove duplicates and keep only the basic teams
  useEffect(() => {
    if (!initialSetupComplete || cleanupDone) return;
    
    // Get all team resources
    const teamResources = resources.filter(res => res.id.startsWith('team-'));
    
    // If we have more than 6 teams, clean up
    if (teamResources.length > 6) {
      // Keep only teams 1-5 and team-6 (Todays events)
      const teamsToKeep = ['team-1', 'team-2', 'team-3', 'team-4', 'team-5', 'team-6'];
      
      const cleanedResources = resources.filter(resource => {
        // Keep non-team resources
        if (!resource.id.startsWith('team-')) return true;
        
        // Keep only the specified teams
        return teamsToKeep.includes(resource.id);
      });
      
      // Save cleaned resources
      setResources(cleanedResources);
      saveResourcesToStorage(cleanedResources);
      saveResources(cleanedResources);
      
      // Show notification
      const removedCount = teamResources.length - (cleanedResources.filter(res => res.id.startsWith('team-')).length);
      toast.success(`Cleaned up ${removedCount} extra teams`, {
        description: "Removed duplicate and unnecessary teams"
      });
      
      setCleanupDone(true);
    } else {
      setCleanupDone(true);
    }
  }, [resources, initialSetupComplete, cleanupDone]);
  
  // Setup "Todays events" team (Team 6) only once after initial loading
  useEffect(() => {
    if (!initialSetupComplete || resources.length === 0 || !cleanupDone) return;
    
    // Check if Team 6 exists
    const team6Index = resources.findIndex(res => res.id === 'team-6');
    
    if (team6Index !== -1) {
      // Team 6 exists - check if it has the correct name
      if (resources[team6Index].title !== "Todays events") {
        const updatedResources = [...resources];
        updatedResources[team6Index].title = "Todays events";
        updatedResources[team6Index].eventColor = '#FEF7CD'; // Match yellow event color
        setResources(updatedResources);
        saveResourcesToStorage(updatedResources);
        saveResources(updatedResources);
      }
    } else {
      // Team 6 doesn't exist, create it
      const newTeam6: Resource = {
        id: 'team-6',
        title: 'Todays events',
        eventColor: '#FEF7CD' // Match yellow event color
      };
      
      const updatedResources = [...resources, newTeam6];
      setResources(updatedResources);
      saveResourcesToStorage(updatedResources);
      saveResources(updatedResources);
      
      toast.success('Created "Todays events" team', {
        description: 'All yellow events will be moved to this team.'
      });
    }
  }, [initialSetupComplete, resources.length, cleanupDone]);
  
  // Save resources whenever they change
  useEffect(() => {
    if (resources.length > 0 && initialSetupComplete) {
      saveResourcesToStorage(resources);
      saveResources(resources);
    }
  }, [resources, initialSetupComplete]);

  const addTeam = () => {
    // First check if we already have too many teams (e.g., more than 10)
    const teamResources = resources.filter(resource => resource.id.startsWith('team-'));
    if (teamResources.length >= 10) {
      toast.error("Maximum teams reached", {
        description: "You cannot add more than 10 teams.",
        duration: 3000,
      });
      return;
    }
    
    const newTeamId = `team-${teamCount}`;
    
    // Check if a team with this ID already exists
    if (resources.some(resource => resource.id === newTeamId)) {
      // Find the next available team number
      let nextTeamCount = teamCount + 1;
      while (resources.some(resource => resource.id === `team-${nextTeamCount}`)) {
        nextTeamCount++;
      }
      
      setTeamCount(nextTeamCount);
      
      toast.error("Team already exists", {
        description: `Team ${teamCount} already exists. Try again to add Team ${nextTeamCount}.`,
        duration: 3000,
      });
      return;
    }
    
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
