# Adressfälten på projekt visar tomt – fix

## Vad som har hänt

I commit `926c4051` lades ett nytt **adresskort** till på `ProjectLayout.tsx` (medelprojektets toppvy). Kortet läser adressen så här:

```tsx
{(project as any).deliveryaddress || 'Ingen adress – klicka för att lägga till'}
```

Problemet: kolumnen `projects.deliveryaddress` är **nästan alltid `NULL`**. Adressen för bokade projekt ligger på den länkade bokningen (`bookings.deliveryaddress`), inte på projects-raden.

Verifierat i DB:
- 102 aktiva projekt totalt
- **1** har egen `projects.deliveryaddress`
- **70** har `NULL` på projektet men adress finns på `bookings`
- Det öppna projektet (`b6f0ba67…`): `projects.deliveryaddress = NULL`, men `bookings.deliveryaddress = "Skoklostervägen 100"`

Det gamla flödet (BookingInfoExpanded, JobDetail, mobil m.m.) går alla via `booking.deliveryaddress` och fungerar fortfarande. Det är bara det nya adresskortet som råkar visa fel.

Stora projekt (`LargeProjectLayout`) påverkas inte — där läses `b.deliveryaddress` från booking-raden direkt.

## Fix

**Fil:** `src/pages/project/ProjectLayout.tsx`

1. Beräkna en effektiv adress + koordinater som faller tillbaka till booking:
   ```ts
   const effectiveAddress =
     (project as any).deliveryaddress ?? project.booking?.deliveryaddress ?? null;
   const effectiveLat =
     (project as any).delivery_latitude ?? project.booking?.delivery_latitude ?? null;
   const effectiveLng =
     (project as any).delivery_longitude ?? project.booking?.delivery_longitude ?? null;
   ```
2. Använd `effectiveAddress` / `effectiveLat` / `effectiveLng`:
   - i adresskortets text + koordinat-badge
   - som `initial` till `ProjectAddressMapDialog`
3. Behåll save-flödet som det är (skriver lokal override till `projects`-raden via `detail.updateProject`). Det betyder att om man redigerar adressen så får projektet sin egen adress, annars ärvs booking-adressen.

**Fil:** `src/services/projectService.ts` (fetchProject, rad 36-54)

Lägg till `delivery_latitude` och `delivery_longitude` i `booking`-selecten så fallback-koordinaterna kan plockas. (Rad 42 har `deliveryaddress` men koordinaterna saknas.)

## Verifiering

- Öppna `/project/b6f0ba67-…` → adresskortet ska visa "Skoklostervägen 100".
- Öppna ett projekt utan booking och utan egen adress → "Ingen adress – klicka för att lägga till".
- Spara ny adress via dialogen → den lokala overriden visas och persistas på projektet.

Inga DB-migreringar behövs.
