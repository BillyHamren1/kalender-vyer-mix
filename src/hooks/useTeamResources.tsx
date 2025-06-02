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
  
  // Default required teams (Team 1-5 + Live)
  const defaultTeams: Resource[] = [
    { id: 'team-1', title: 'Team 1', eventColor: '#3788d8' },
    { id: 'team-2', title: 'Team 2', eventColor: '#1e90ff' },
    { id: 'team-3', title: 'Team 3', eventColor: '#4169e1' },
    { id: 'team-4', title: 'Team 4', eventColor: '#0073cf' },
    { id: 'team-5', title: 'Team 5', eventColor: '#4682b4' },
    { id: 'team-6', title: 'Live', eventColor: '#FEF7CD' },
  ];
  
  // Load resources on initial mount only
  useEffect(() => {
    const loadedResources = loadResourcesFromStorage();
    
    // Check if the default teams exist, add any missing ones
    let updatedResources = [...loadedResources];
    let resourcesChanged = false;
    
    defaultTeams.forEach(defaultTeam => {
      const existingTeam = updatedResources.find(resource => resource.id === defaultTeam.id);
      
      if (!existingTeam) {
        // Team doesn't exist, add it
        updatedResources.push(defaultTeam);
        resourcesChanged = true;
        console.log(`Added missing default team: ${defaultTeam.title}`);
      } else if (defaultTeam.id === 'team-6' && (existingTeam.title !== 'Live' && existingTeam.title !== 'Todays events')) {
        // Ensure Team 6 has the correct name
        existingTeam.title = 'Live';
        existingTeam.eventColor = '#FEF7CD';
        resourcesChanged = true;
      } else if (defaultTeam.id === 'team-6' && existingTeam.title === 'Todays events') {
        // Rename "Todays events" to "Live"
        existingTeam.title = 'Live';
        existingTeam.eventColor = '#FEF7CD';
        resourcesChanged = true;
        console.log('Renamed "Todays events" to "Live"');
      }
    });
    
    // If we made changes, save them
    if (resourcesChanged) {
      saveResourcesToStorage(updatedResources);
      saveResources(updatedResources);
      
      toast.success('Default teams restored', {
        description: 'Missing teams have been added to your calendar'
      });
    }
    
    setResources(updatedResources);
    
    // Set teamCount based on the highest team number
    const teamIds = updatedResources
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
      // Keep only teams 1-5 and team-6 (Live)
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
  
  // Save resources whenever they change
  useEffect(() => {
    if (resources.length > 0 && initialSetupComplete) {
      saveResourcesToStorage(resources);
      saveResources(resources);
    }
  }, [resources, initialSetupComplete]);

  const addTeam = (teamName: string = '') => {
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
    
    // Use the provided team name or default to "Team X"
    const displayName = teamName.trim() !== '' ? teamName : `Team ${teamCount}`;
    
    const newResource: Resource = {
      id: newTeamId,
      title: displayName,
      eventColor: '#9b87f5'
    };
    
    setResources([...resources, newResource]);
    setTeamCount(prevCount => prevCount + 1);
    
    toast("Team tillagt", {
      description: `${displayName} har lagts till i kalendern`,
      duration: 3000,
    });
  };

  const removeTeam = (teamId: string) => {
    // Don't allow removing default teams (team-1 through team-6)
    if (['team-1', 'team-2', 'team-3', 'team-4', 'team-5', 'team-6'].includes(teamId)) {
      toast.error("Cannot remove default team", {
        description: "This is a default team and cannot be removed.",
        duration: 3000,
      });
      return;
    }
    
    const teamToRemove = resources.find(resource => resource.id === teamId);
    if (!teamToRemove) return;
    
    setResources(resources.filter(resource => resource.id !== teamId));
    
    toast("Team borttaget", {
      description: `${teamToRemove.title} har tagits bort från kalendern`,
      duration: 3000,
    });
  };

  // Get only the team resources (not room resources) and sort them correctly
  const teamResources = resources
    .filter(resource => resource.id.startsWith('team-'))
    .sort((a, b) => {
      // Special case for "Live" (team-6) - it should be last
      if (a.id === 'team-6') return 1;
      if (b.id === 'team-6') return -1;
      
      // Extract team numbers for comparison
      const aMatch = a.id.match(/team-(\d+)/);
      const bMatch = b.id.match(/team-(\d+)/);
      
      const aNum = aMatch ? parseInt(aMatch[1]) : 0;
      const bNum = bMatch ? parseInt(bMatch[1]) : 0;
      
      // Sort by team number
      return aNum - bNum;
    });
  
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
