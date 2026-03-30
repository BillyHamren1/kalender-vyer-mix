

## Problem

Kontrollpanelen är passiv — den listar problem men erbjuder inga snabbåtgärder. En projektledare som ser "8 saknar info" och "7 utan ägare" tvingas klicka in på varje uppgift en i taget och fixa manuellt. Det är inte en kontrollpanel — det är en lista.

## Vad som saknas

1. **Inline-åtgärder per issue-typ** — t.ex. "Tilldela ägare" dropdown direkt i raden för "Utan ägare"-uppgifter, "Sätt datum" för "Utan datum"-uppgifter
2. **Bulk-åtgärder per grupp** — "Tilldela alla till..." knapp för hela "Utan ägare"-gruppen
3. **Kontextuell vägledning** — kort text per problemtyp som förklarar *varför* det är ett problem och *vad* som bör göras
4. **Tom panel är meningslös** — "Inga aktiviteter idag"-kortet tar plats utan nytta. Bör dölja sig eller visa nästa kommande aktivitet istället

## Plan

### 1. Gör issue-rader actionable
Varje rad i "Kräver åtgärd" får en kontextuell snabbknapp beroende på typ:
- **Utan ägare** → inline staff-dropdown (välj person direkt)
- **Utan datum** → inline datepicker (sätt start/slutdatum direkt)
- **Blockerad** → knapp "Visa blockering" som öppnar detalj
- **Saknar info / Väntar extern / Beslut krävs** → behåll klick-till-detalj men lägg till en liten statustext

### 2. Lägg till bulk-åtgärder per grupp
Ovanför varje issue-grupp (t.ex. "UTAN ÄGARE (7)") lägg till en "Tilldela alla →" knapp som öppnar en staff-picker och tilldelar vald person till alla uppgifter i gruppen.

### 3. Fixa tomma "Idag"-panelen
- Om inga aktiviteter idag/imorgon: visa nästa kommande aktivitet med "Nästa: [titel] om X dagar" istället för ett tomt kort
- Om inga aktiviteter alls: dölj kortet helt (visa bara issues-kortet i full bredd)

### 4. Layout-anpassning
- När bara ett kort har innehåll → låt det ta full bredd (ändra grid till dynamiskt)
- Ge issues-kortet mer plats om det finns många problem

## Tekniska detaljer

**Filer som ändras:**
- `src/components/project/planning/ProjectControlPanel.tsx` — huvudsakliga ändringar: inline dropdowns, bulk-knappar, dynamisk layout
- `src/services/establishmentTaskService.ts` — ny funktion `bulkUpdateEstablishmentTasks` för att uppdatera flera uppgifter samtidigt (assigned_to, datum)
- `src/hooks/useTaskAnalytics.ts` — utöka `upcomingWeek` med "nästa kommande" fallback

**Inline staff-dropdown:** Återanvänder befintlig `staffPool` prop. Vid val anropas `updateEstablishmentTask` direkt + invalidering av react-query cache.

**Bulk-uppdatering:** Ny service-funktion som tar en lista av task-IDs och ett updates-objekt, kör en enda Supabase `.in('id', ids).update(...)` för effektivitet.

