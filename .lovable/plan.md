

# Fixa meddelandefältets layout i chattvyerna

## Problem
Meddelandefältet "flyter" mitt på skärmen med stor tom yta under. Orsaken är `pb-24` (bottom padding för bottennavigering) på containern, men i en chattvy ska inputfältet sitta fast i botten — bottennavigering visas inte i en trådvy.

## Åtgärd

**Fil:** `src/pages/mobile/MobileInbox.tsx`

Ändra layout för DM-tråden (rad ~369) och Jobb-tråden (rad ~425):

- Byt `min-h-screen pb-24` → `h-screen` (eller `h-[100dvh]` för iOS) utan bottom-padding
- Inputfältet sitter redan `shrink-0` i botten av flex-kolumnen — det räcker med att ta bort den extra paddingen
- Säkerställ att `overflow-y-auto` på meddelandelistan tar allt tillgängligt utrymme
- Ge inputfältet en tydligare visuell separation: skugga (`shadow-sm`) uppåt istället för bara border-top

### Innan
```
<div className="flex flex-col min-h-screen pb-24 bg-background">
```

### Efter
```
<div className="flex flex-col h-[100dvh] bg-background">
```

Samma fix på båda trådvyerna (DM och Jobb).

