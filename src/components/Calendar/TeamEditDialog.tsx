import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Edit, Plus, Trash, Copy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Resource } from './ResourceData';
import { addDays, subDays, format } from 'date-fns';
import { toast } from 'sonner';

interface TeamEditDialogProps {
  teamResources: Resource[];
  teamCount: number;
  onAddTeam: (teamName: string) => void;
  onRemoveTeam: (teamId: string) => void;
  currentWeekStart: Date;
  onCopyFromPreviousWeek?: () => Promise<void>;
  dialogOpen?: boolean;
  setDialogOpen?: (open: boolean) => void;
}

const TeamEditDialog: React.FC<TeamEditDialogProps> = ({
  teamResources,
  teamCount,
  onAddTeam,
  onRemoveTeam,
  currentWeekStart,
  onCopyFromPreviousWeek,
  dialogOpen: externalDialogOpen,
  setDialogOpen: externalSetDialogOpen
}) => {
  const [internalDialogOpen, setInternalDialogOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState(`Team ${teamCount}`);
  const [isLoading, setIsLoading] = useState(false);

  // Use external state if provided, otherwise use internal state
  const dialogOpen = externalDialogOpen !== undefined ? externalDialogOpen : internalDialogOpen;
  const setDialogOpen = externalSetDialogOpen || setInternalDialogOpen;

  const handleAddTeam = () => {
    if (newTeamName.trim()) {
      onAddTeam(newTeamName.trim());
      setNewTeamName(`Team ${teamCount + 1}`);
      toast.success('Team added', {
        description: `${newTeamName} has been added to the calendar`
      });
    }
  };

  const handleRemoveTeam = (teamId: string, teamName: string) => {
    onRemoveTeam(teamId);
    toast.success('Team removed', {
      description: `${teamName} has been removed from the calendar`
    });
  };

  const handleCopyFromPreviousWeek = async () => {
    if (!onCopyFromPreviousWeek) return;
    
    setIsLoading(true);
    try {
      await onCopyFromPreviousWeek();
      toast.success('Staff assignments copied', {
        description: 'Previous week\'s assignments have been copied to this week'
      });
    } catch (error) {
      console.error('Error copying assignments:', error);
      toast.error('Failed to copy assignments', {
        description: 'There was an error copying the previous week\'s assignments'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const previousWeekStart = subDays(currentWeekStart, 7);
  const previousWeekEnd = addDays(previousWeekStart, 6);
  const currentWeekEnd = addDays(currentWeekStart, 6);

  const DialogWrapper = externalDialogOpen !== undefined ? React.Fragment : Dialog;
  const DialogTriggerWrapper = externalDialogOpen !== undefined ? React.Fragment : DialogTrigger;

  return (
    <DialogWrapper>
      {externalDialogOpen === undefined && (
        <DialogTriggerWrapper>
          <Button 
            variant="outline"
            size="sm"
            className="bg-white hover:bg-gray-50 border-gray-300"
          >
            <Edit className="mr-1" size={16} />
            Edit Teams
          </Button>
        </DialogTriggerWrapper>
      )}
      
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Manage Teams</DialogTitle>
            <DialogDescription>
              Add or remove teams, and copy staff assignments from previous week.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Copy from previous week section */}
            <div className="border rounded-lg p-4 bg-blue-50">
              <h3 className="font-medium text-sm mb-2">Copy Staff Assignments</h3>
              <p className="text-xs text-gray-600 mb-3">
                Copy all staff assignments from {format(previousWeekStart, 'MMM d')} - {format(previousWeekEnd, 'MMM d')} 
                to {format(currentWeekStart, 'MMM d')} - {format(currentWeekEnd, 'MMM d')}
              </p>
              <Button 
                onClick={handleCopyFromPreviousWeek}
                disabled={isLoading}
                size="sm"
                className="w-full"
              >
                <Copy className="mr-1" size={14} />
                {isLoading ? 'Copying...' : 'Copy from Previous Week'}
              </Button>
            </div>

            {/* Add new team section */}
            <div className="border rounded-lg p-4">
              <h3 className="font-medium text-sm mb-3">Add New Team</h3>
              <div className="flex gap-2">
                <Input
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="Team name"
                  className="flex-1"
                  onKeyPress={(e) => e.key === 'Enter' && handleAddTeam()}
                />
                <Button onClick={handleAddTeam} size="sm">
                  <Plus size={16} className="mr-1" />
                  Add
                </Button>
              </div>
            </div>

            {/* Existing teams section */}
            <div>
              <h3 className="font-medium text-sm mb-3">Existing Teams</h3>
              {teamResources.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  <p className="text-sm">No teams added yet.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {teamResources.map((team) => (
                    <Card key={team.id} className="border-gray-200">
                      <CardContent className="p-3 flex justify-between items-center">
                        <div className="flex items-center">
                          <div 
                            className="w-3 h-3 rounded-full mr-2"
                            style={{ backgroundColor: team.eventColor }}
                          />
                          <span className="font-medium text-sm">{team.title}</span>
                        </div>
                        
                        {/* Only allow deletion of non-default teams */}
                        {!['team-1', 'team-2', 'team-3', 'team-4', 'team-5', 'team-6'].includes(team.id) && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 h-auto"
                              >
                                <Trash size={14} />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove Team</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to remove "{team.title}"? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleRemoveTeam(team.id, team.title)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button 
              variant="outline" 
              onClick={() => setDialogOpen(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DialogWrapper>
  );
};

export default TeamEditDialog;
