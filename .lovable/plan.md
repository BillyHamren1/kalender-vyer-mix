
## Problem

`ProjectActivityLog` renderas utanför sin container av två anledningar:

### 1. Filterknapparna i CardHeader svämmar över
Alla sex filter-knappar (Alla, Status, Uppgifter, Kommentarer, Filer, Transport) ligger på en `flex`-rad i `CardHeader`. I en tredjedels kolumn (lg:grid-cols-3) är de för många för att rymmas på en rad – de flödar ut ur kortets kant.

### 2. `className` byggs ihop fel – mellanslag saknas
På rad 186 i `ProjectActivityLog.tsx`:
```tsx
// Nuvarande – FEL: ger t.ex. "border-border/40 shadow-2xl rounded-2xlh-full"
<Card className={`border-border/40 shadow-2xl rounded-2xl${className ? ` ${className}` : ''}`}>
```
`rounded-2xl` och `h-full` smälter ihop till `rounded-2xlh-full` som inte är en giltig klass.

## Lösning

### Fil: `src/components/project/ProjectActivityLog.tsx`

**Fix 1 – Använd `cn()` för className-sammanslagning (rad 186)**

Byt ut sträng-konkatenering mot `cn()` som redan importeras:
```tsx
<Card className={cn("border-border/40 shadow-2xl rounded-2xl", className)}>
```

**Fix 2 – Gör filter-knapparna responsiva**

Bryt ut filtren till ett eget block som kan wrappa. Ersätt den horisontella `flex`-raden med en `flex-wrap`-variant, eller flytta filtren under titeln som en andra rad i CardHeader:

```tsx
<CardHeader className="pb-3">
  <CardTitle className="text-lg flex items-center gap-3 tracking-tight">
    ...Aktivitetslogg
  </CardTitle>
  <div className="flex items-center gap-1 flex-wrap mt-2">
    <Filter className="h-3.5 w-3.5 text-muted-foreground mr-1" />
    {FILTER_OPTIONS.map(option => (
      <Button key={option.value} ...>{option.label}</Button>
    ))}
  </div>
</CardHeader>
```

Detta placerar filter-knapparna på en egen rad under titeln, med `flex-wrap` så de radbryts vid behov – utan att svämma utanför kortet.

## Tekniska steg

| Fil | Ändring |
|---|---|
| `src/components/project/ProjectActivityLog.tsx` | Rad 186: byt till `cn(...)` för className |
| `src/components/project/ProjectActivityLog.tsx` | Rad 187-211: dela CardHeader i titel-rad + filter-rad med flex-wrap |

Inga andra filer behöver ändras.
