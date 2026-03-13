

# Fix: Tidrapportformulär — fältbredder och layout

## Problem (från screenshots)
1. Input-fälten har för stora rounded corners (`rounded-xl`) och ser uppblåsta ut
2. Start/Slut-fälten och Rast/Övertid-fälten behöver tydligare separation (mer gap)
3. Labeln "Slut" är korrekt i koden — men layouten gör att fälten ser ihopkörda ut

## Ändringar

### `src/pages/mobile/MobileTimeReport.tsx`

**Rad 162-181** — Öka gap mellan kolumner och minska rounded corners:

```tsx
// Före: gap-3, rounded-xl
// Efter: gap-4, rounded-lg

<div className="grid grid-cols-2 gap-4">
  <div className="space-y-1.5">
    <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Start</Label>
    <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="h-10 rounded-lg text-sm" />
  </div>
  <div className="space-y-1.5">
    <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Slut</Label>
    <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="h-10 rounded-lg text-sm" />
  </div>
</div>

<div className="grid grid-cols-2 gap-4">
  <div className="space-y-1.5">
    <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Rast (h)</Label>
    <Input type="number" step="0.25" value={breakTime} onChange={e => setBreakTime(e.target.value)} className="h-10 rounded-lg text-sm" />
  </div>
  <div className="space-y-1.5">
    <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Övertid (h)</Label>
    <Input type="number" step="0.5" value={overtime} onChange={e => setOvertime(e.target.value)} className="h-10 rounded-lg text-sm" />
  </div>
</div>
```

Samma ändring för övriga inputs (Jobb-select, Datum, Beskrivning): `rounded-xl` → `rounded-lg`.

Formulärets container (rad 138): `rounded-2xl` → `rounded-xl` för att matcha.

**En fil ändras**: `src/pages/mobile/MobileTimeReport.tsx`

