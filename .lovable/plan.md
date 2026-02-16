
# Förbättra Utläggssidan -- Synligare och snabbare

## Problem
Utläggssidan har all funktionalitet (formulär, kamerafoto, kvittohantering) men den är gömd bakom en liten "Nytt"-knapp. Sidan visas som tom tills man aktivt klickar den knappen, vilket ger intrycket att "allt är borta".

## Lösning

### 1. Visa formuläret som standard när inga utlägg finns
Istället for att starta med tomt tillstand, visa formularet direkt nar det inte finns nagra utlagg. Detta gor att anvandaren omedelbart kan borja registrera.

### 2. Stor, tydlig "Fota kvitto"-knapp som huvudaction
Lagg till en framtradande knapp med kameraikon som primart call-to-action nar formularet inte ar oppet, sa att anvandaren direkt forstar att man kan fotografera kvitton.

### 3. Auto-valj jobb om bara ett finns
Om anvandaren bara ar tilldelad ett jobb, forvalj det automatiskt sa att man slipper ett extra steg.

### 4. Visa alla utlagg oavsett valt jobb
Ladda in utlagg fran alla jobb direkt vid start (inte bara nar ett jobb ar valt), sa att historiken alltid syns.

## Tekniska andringar

### `src/pages/mobile/MobileExpenses.tsx`
- Ladda utlagg fran alla bokningar vid uppstart (loopa over alla bookings och hamta purchases)
- Auto-valj `selectedBookingId` om bara en booking finns
- Satt `showForm = true` som default nar purchases ar tomma
- Lagg till en stor, synlig CTA-knapp ("Registrera utlagg") med kameraikon nar formularet ar stangd
- Visa en sammanfattning av totala utlagg langst upp (oavsett vilken bokning)

### `src/services/mobileApiService.ts`
- Ingen andring behovs -- befintliga endpoints racker

## Resultat
Anvandaren ser antingen formularet direkt (om inga utlagg finns) eller en tydlig "Registrera utlagg"-knapp + sin historik. Det blir omojligt att missa att man kan fota kvitton.
