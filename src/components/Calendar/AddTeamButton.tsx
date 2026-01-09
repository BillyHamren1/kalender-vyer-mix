
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Form, FormField, FormItem, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

interface AddTeamButtonProps {
  onAddTeam: (teamName: string) => void;
  onRemoveTeam: (teamId: string) => void;
  teamCount: number;
  teamResources: Resource[];
}

const formSchema = z.object({
  teamName: z.string().min(1, { message: "Team name is required" }).max(30, { message: "Team name cannot exceed 30 characters" })
});

const AddTeamButton: React.FC<AddTeamButtonProps> = ({ 
  onAddTeam, 
  onRemoveTeam, 
  teamCount,
  teamResources 
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const isMobile = useIsMobile();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      teamName: `Team ${teamCount}`
    }
  });

  const handleSubmit = (values: z.infer<typeof formSchema>) => {
    onAddTeam(values.teamName);
    setDialogOpen(false);
    form.reset({ teamName: `Team ${teamCount + 1}` });
  };

  return (
    <div className="flex">
      <Button 
        onClick={() => setDialogOpen(true)}
        className={`bg-primary hover:bg-primary/90 text-primary-foreground text-sm ${
          teamResources.length > 0 ? 'rounded-r-none' : ''
        } border-r border-r-primary/40 ${
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
              className={`bg-primary hover:bg-primary/90 text-primary-foreground rounded-l-none ${
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

      {/* Add Team Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add New Team</DialogTitle>
            <DialogDescription>
              Enter a name for your new team.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="teamName"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input placeholder="Team name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="flex justify-end gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  Add Team
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AddTeamButton;
