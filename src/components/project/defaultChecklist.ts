export interface DeadlineRule {
  type: 'before_rig' | 'before_event' | 'after_rigdown' | 'after_created' | 'on_rig' | 'on_event' | 'on_rigdown';
  days: number;
  asapIfLess?: boolean;
  minMonthsRequired?: number;
}

export interface ChecklistTemplate {
  title: string;
  sort_order: number;
  deadlineRule: DeadlineRule;
  isInfoOnly?: boolean;
}

export const DEFAULT_CHECKLIST: ChecklistTemplate[] = [
  { 
    title: 'Transportbokning', 
    sort_order: 0,
    deadlineRule: { type: 'before_rig', days: 14, asapIfLess: true }
  },
  { 
    title: 'Kontroll av material tillgänglighet', 
    sort_order: 1,
    deadlineRule: { type: 'before_rig', days: 28, asapIfLess: true }
  },
  { 
    title: 'Bokning av UE', 
    sort_order: 2,
    deadlineRule: { type: 'after_created', days: 7, minMonthsRequired: 3, asapIfLess: true }
  },
  { 
    title: 'Personalplanering', 
    sort_order: 3,
    deadlineRule: { type: 'before_rig', days: 14, asapIfLess: true }
  },
  { 
    title: 'Platskontroll innan byggnation', 
    sort_order: 4,
    deadlineRule: { type: 'before_rig', days: 3, asapIfLess: true }
  },
  { 
    title: 'Slutkontroll före leverans', 
    sort_order: 5,
    deadlineRule: { type: 'before_event', days: 14, asapIfLess: true }
  },
  { 
    title: 'Packning', 
    sort_order: 6,
    deadlineRule: { type: 'before_event', days: 3, asapIfLess: true }
  },
  { 
    title: 'Byggnation', 
    sort_order: 7,
    deadlineRule: { type: 'on_rig', days: 0 },
    isInfoOnly: true
  },
  { 
    title: 'Event', 
    sort_order: 8,
    deadlineRule: { type: 'on_event', days: 0 },
    isInfoOnly: true
  },
  { 
    title: 'Nedmontering', 
    sort_order: 9,
    deadlineRule: { type: 'on_rigdown', days: 0 },
    isInfoOnly: true
  },
  { 
    title: 'Feedback', 
    sort_order: 10,
    deadlineRule: { type: 'after_rigdown', days: 6 }
  },
  { 
    title: 'Stängning av projekt', 
    sort_order: 11,
    deadlineRule: { type: 'after_rigdown', days: 7 }
  },
];
