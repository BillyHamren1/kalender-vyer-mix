

## Problem

Formulärfälten i tidrapporterings-appen har för lite visuell separation — gränserna smälter ihop med kortets bakgrund, speciellt på mobil. Fälten ser ut att "flyta ihop" som i skärmdumpen.

## Orsak

Formuläret i `MobileTimeReport.tsx` använder `space-y-4` mellan fältgrupper, men inputfälten har standardstyling med subtil `border-input` som knappt syns mot `bg-card`. Dessutom saknas tydlig bakgrundsfärg på inputfälten som skiljer dem från kortet.

## Fix

**Fil:** `src/pages/mobile/MobileTimeReport.tsx`

1. Öka mellanrummet mellan fältgrupper från `space-y-4` till `space-y-5`
2. Ge alla Input- och Select-fält en tydlig bakgrundsfärg (`bg-muted/50`) och starkare border (`border-border`)
3. Lägg till lite extra padding i input-fälten för bättre touch-target
4. Öka gap mellan grid-kolumner från `gap-4` till `gap-3` (behålls rimligt)
5. Lägg till en divider/separator-linje mellan fältgrupperna "Start/Slut" och "Rast/Övertid" för tydligare gruppering

Konkreta ändringar:
- Alla `Input` och `SelectTrigger`: lägg till `bg-muted/50 border-border/60` för tydlig kontrast mot kortet
- `Textarea`: samma bakgrundsfärg
- Behåll `h-10` och `rounded-lg` (fungerar bra med mobilriktlinjerna)
- Kortet (`space-y-4` → `space-y-5`) för mer luft mellan fältgrupper

