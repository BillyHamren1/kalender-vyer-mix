
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { X, Filter } from 'lucide-react';
import { StaffCalendarEvent } from '@/services/staffCalendarService';

interface ClientSelectorProps {
  events: StaffCalendarEvent[];
  selectedClients: string[];
  onSelectionChange: (clients: string[]) => void;
}

const ClientSelector: React.FC<ClientSelectorProps> = ({
  events,
  selectedClients,
  onSelectionChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [availableClients, setAvailableClients] = useState<string[]>([]);

  // Extract unique clients from events
  useEffect(() => {
    const clients = new Set<string>();
    events.forEach(event => {
      // Extract client name from event title (assuming format like "Client Name - Job")
      const titleParts = event.title.split(' - ');
      if (titleParts.length > 0) {
        const client = titleParts[0].trim();
        if (client) clients.add(client);
      }
    });
    setAvailableClients(Array.from(clients).sort());
  }, [events]);

  const handleClientToggle = (client: string) => {
    const newSelection = selectedClients.includes(client)
      ? selectedClients.filter(c => c !== client)
      : [...selectedClients, client];
    onSelectionChange(newSelection);
  };

  const clearAllClients = () => {
    onSelectionChange([]);
  };

  const selectAllClients = () => {
    onSelectionChange(availableClients);
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2"
      >
        <Filter className="h-4 w-4" />
        <span>Filter Clients</span>
        {selectedClients.length > 0 && (
          <Badge variant="secondary">{selectedClients.length}</Badge>
        )}
      </Button>

      {isOpen && (
        <Card className="absolute top-full left-0 mt-2 w-80 z-50 shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              Select Clients
              <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Quick actions */}
            <div className="flex space-x-2">
              <Button size="sm" variant="outline" onClick={selectAllClients}>
                Select All
              </Button>
              <Button size="sm" variant="outline" onClick={clearAllClients}>
                Clear All
              </Button>
            </div>

            {/* Selected clients */}
            {selectedClients.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Selected:</div>
                <div className="flex flex-wrap gap-1">
                  {selectedClients.map(client => (
                    <Badge key={client} variant="default" className="text-xs">
                      {client}
                      <X 
                        className="h-3 w-3 ml-1 cursor-pointer" 
                        onClick={() => handleClientToggle(client)}
                      />
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Client list */}
            <div className="max-h-48 overflow-y-auto space-y-2">
              {availableClients.map(client => (
                <div key={client} className="flex items-center space-x-2">
                  <Checkbox
                    id={`client-${client}`}
                    checked={selectedClients.includes(client)}
                    onCheckedChange={() => handleClientToggle(client)}
                  />
                  <label 
                    htmlFor={`client-${client}`}
                    className="text-sm cursor-pointer flex-1"
                  >
                    {client}
                  </label>
                </div>
              ))}
            </div>

            {availableClients.length === 0 && (
              <div className="text-sm text-gray-500 text-center py-4">
                No clients found in current events
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ClientSelector;
