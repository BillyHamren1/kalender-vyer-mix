
import { Resource } from './ResourceData';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Form, FormField, FormItem, FormControl, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

interface TeamManagerProps {
  teams: Resource[];
  onAddTeam: (teamName: string) => void;
  onRemoveTeam: (teamId: string) => void;
  teamCount: number;
}

const formSchema = z.object({
  teamName: z.string().min(1, { message: "Team name is required" }).max(30, { message: "Team name cannot exceed 30 characters" })
});

const TeamManager = ({ teams, onAddTeam, onRemoveTeam, teamCount }: TeamManagerProps) => {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      teamName: `Team ${teamCount}`
    }
  });

  const handleSubmit = (values: z.infer<typeof formSchema>) => {
    onAddTeam(values.teamName);
    form.reset({ teamName: `Team ${teamCount + 1}` });
  };

  return (
    <div className="py-4">
      <div className="mb-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex gap-2">
            <FormField
              control={form.control}
              name="teamName"
              render={({ field }) => (
                <FormItem className="flex-grow">
                  <FormControl>
                    <Input placeholder="Team name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button 
              type="submit"
              className="text-[var(--primary)] border-[var(--primary)] hover:bg-[color:var(--primary)] hover:bg-opacity-10"
              variant="outline"
            >
              <Plus size={16} className="mr-1" />
              Add Team
            </Button>
          </form>
        </Form>
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-6 text-gray-500">
          <p>Inga teams tillagda. Lägg till ett team för att komma igång.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
          {teams.map((team) => (
            <Card key={team.id} className="border-gray-200">
              <CardContent className="p-3 flex justify-between items-center">
                <div className="flex items-center">
                  <div 
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: team.eventColor }}
                  />
                  <span className="font-medium">{team.title}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveTeam(team.id)}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 h-auto"
                >
                  <Trash2 size={16} />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
      <div className="mt-6 text-right">
        <Button
          variant="outline"
          onClick={() => window.location.reload()}
          className="mr-2"
        >
          Avbryt
        </Button>
        <Button 
          onClick={() => window.location.reload()}
          className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white"
        >
          Klar
        </Button>
      </div>
    </div>
  );
};

export default TeamManager;
