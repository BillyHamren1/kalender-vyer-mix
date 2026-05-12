import { useState, useEffect } from 'react';
import { Resource } from '@/components/Calendar/ResourceData';
import { toast } from 'sonner';

const STORAGE_KEY = 'warehouseResources';

const defaultWarehouseTeams: Resource[] = [
  { id: 'lager-1', title: 'Lager 1', eventColor: '#3788d8' },
  { id: 'lager-2', title: 'Lager 2', eventColor: '#1e90ff' },
  { id: 'lager-3', title: 'Lager 3', eventColor: '#4169e1' },
  { id: 'lager-4', title: 'Lager 4', eventColor: '#0073cf' },
  { id: 'lager-5', title: 'Lager 5', eventColor: '#4682b4' },
  { id: 'lager-6', title: 'Lager 6', eventColor: '#6a5acd' },
  { id: 'lager-7', title: 'Lager 7', eventColor: '#8a2be2' },
  { id: 'lager-8', title: 'Lager 8', eventColor: '#9370db' },
  { id: 'lager-9', title: 'Lager 9', eventColor: '#ba55d3' },
  { id: 'lager-10', title: 'Lager 10', eventColor: '#da70d6' },
];

const loadFromStorage = (): Resource[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveToStorage = (resources: Resource[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(resources));
};

export const useWarehouseResources = () => {
  const [resources, setResources] = useState<Resource[]>([]);
  const [teamCount, setTeamCount] = useState(11);

  useEffect(() => {
    let loaded = loadFromStorage();

    // Strip legacy Transport/Transporter columns – only Lager-N remains.
    const before = loaded.length;
    loaded = loaded.filter(r => r.id !== 'warehouse-event' && r.id !== 'transport');
    const stripped = before !== loaded.length;

    if (loaded.length === 0) {
      loaded = [...defaultWarehouseTeams];
    } else {
      // Ensure all defaults exist
      defaultWarehouseTeams.forEach(def => {
        const existing = loaded.find(r => r.id === def.id);
        if (!existing) {
          loaded.push(def);
        }
      });
    }

    if (stripped) saveToStorage(loaded);
    else saveToStorage(loaded);
    setResources(loaded);

    const maxNum = loaded
      .filter(r => r.id.startsWith('lager-'))
      .map(r => parseInt(r.id.replace('lager-', '')) || 0)
      .reduce((a, b) => Math.max(a, b), 0);
    setTeamCount(maxNum + 1);
  }, []);

  useEffect(() => {
    if (resources.length > 0) saveToStorage(resources);
  }, [resources]);

  const addTeam = (name = '') => {
    if (resources.length >= 10) {
      toast.error('Max antal lagerteam nått');
      return;
    }
    const id = `lager-${teamCount}`;
    const title = name.trim() || `Lager ${teamCount}`;
    setResources(prev => [...prev, { id, title, eventColor: '#9b87f5' }]);
    setTeamCount(c => c + 1);
    toast(`${title} tillagt`);
  };

  const removeTeam = (teamId: string) => {
    if (['lager-1', 'lager-2', 'lager-3', 'lager-4'].includes(teamId)) {
      toast.error('Kan inte ta bort standardteam');
      return;
    }
    const team = resources.find(r => r.id === teamId);
    setResources(prev => prev.filter(r => r.id !== teamId));
    if (team) toast(`${team.title} borttaget`);
  };

  const transportResource: Resource = { id: 'transport', title: 'Transporter', eventColor: '#3B82F6' };

  const teamResources = [
    ...resources.filter(r => r.id.startsWith('lager-') || r.id === 'warehouse-event'),
    transportResource,
  ].sort((a, b) => {
      // warehouse-event always goes last
      if (a.id === 'warehouse-event') return 1;
      if (b.id === 'warehouse-event') return -1;
      // transport goes just before warehouse-event
      if (a.id === 'transport' && b.id !== 'warehouse-event') return 1;
      if (b.id === 'transport' && a.id !== 'warehouse-event') return -1;
      if (a.id === 'transport') return -1;
      if (b.id === 'transport') return 1;
      const aNum = parseInt(a.id.replace('lager-', '')) || 0;
      const bNum = parseInt(b.id.replace('lager-', '')) || 0;
      return aNum - bNum;
    });

  return { resources, teamResources, addTeam, removeTeam };
};
