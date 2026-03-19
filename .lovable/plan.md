

# Fix: Tidsöversiktens eventblock visar lila istället för rätt färger

## Problem
I `OpsStaffTimeline.tsx` matchar färgnyckeln exakta strängar (`Rigg`, `Event`, `Nedrigg`), men datan från databasen returnerar andra format (`rig`, `event`, `rigDown`, `rigdown` etc.). Alla omatchade eventtyper faller tillbaka till `bg-primary/60` — som är **lila** under `.theme-purple`.

## Lösning
Ersätt den exakta nyckelmatchningen med en normaliseringsfunktion (samma mönster som `WeekProjectsView.tsx` redan använder).

### Ändring i `src/components/ops-control/OpsStaffTimeline.tsx`

**Rad 37–41** — Byt ut `eventTypeColors`-nycklar till normaliserade värden:

```typescript
const eventTypeColors: Record<string, { bg: string; border: string; label: string }> = {
  rig:     { bg: 'bg-green-200/75', border: 'border-green-400', label: 'Rigg' },
  event:   { bg: 'bg-yellow-200/75', border: 'border-yellow-400', label: 'Event' },
  rigdown: { bg: 'bg-red-200/75', border: 'border-red-400', label: 'Nedrigg' },
};
```

**Lägg till normaliseringsfunktion** (före `eventTypeColors`):

```typescript
const normalizeEventType = (t: string | null): string => {
  const s = (t ?? '').trim().toLowerCase();
  if (s === 'rigg' || s === 'rig' || s.includes('monter')) return 'rig';
  if (s === 'event') return 'event';
  if (s.includes('rigdown') || s.includes('riggdown') || s.includes('nedrigg') || s.includes('demonter')) return 'rigdown';
  return s;
};
```

**Rad 227** — Använd normalisering vid uppslagning:

```typescript
const colors = eventTypeColors[normalizeEventType(a.eventType)] || { bg: 'bg-muted/60', border: 'border-muted', label: a.eventType || '' };
```

**Rad 252/256** — Byt `text-primary-foreground` till `text-foreground` så texten syns på de ljusa bakgrunderna (grön/gul/röd-200).

**Rad 381–386** — Uppdatera legenden att använda `label` från den nya strukturen.

### Filer som ändras
- `src/components/ops-control/OpsStaffTimeline.tsx` — normaliseringsfunktion + uppdaterade färgnycklar + textfärg

