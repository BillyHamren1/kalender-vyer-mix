
import { Resource } from './ResourceData';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface TeamManagerProps {
  teams: Resource[];
  onAddTeam: () => void;
  onRemoveTeam: (teamId: string) => void;
  teamCount: number;
}

const TeamManager = ({ teams, onAddTeam, onRemoveTeam, teamCount }: TeamManagerProps) => {
  return (
    <div className="py-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-medium">Teams ({teams.length})</h3>
        <Button 
          onClick={onAddTeam}
          variant="outline" 
          size="sm"
          className="text-purple-600 border-purple-600 hover:bg-purple-50"
        >
          <Plus size={16} className="mr-1" />
          Lägg till Team {teamCount}
        </Button>
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-6 text-gray-500">
          <p>Inga teams tillagda. Klicka på "Lägg till Team" för att komma igång.</p>
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
          className="bg-purple-500 hover:bg-purple-600 text-white"
        >
          Klar
        </Button>
      </div>
    </div>
  );
};

export default TeamManager;
