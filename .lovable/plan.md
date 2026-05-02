## Plan

Jag kommer att ändra logiken för GPS-besök så att listan visar ett verkligt besök per plats, i stället för flera korta ping-perioder.

### Vad som ska byggas
1. Uppdatera logiken i `src/lib/staff/stayPoints.ts` så att flera närliggande ping-kluster på samma plats slås ihop till ett enda besök.
2. Behålla visningen i `src/components/staff/GpsStopsRows.tsx` som en rad per besök med:
   - Ankom = första ping i besöket
   - Lämnade = sista ping i besöket
   - Adress = platsen
   - På plats = total tid mellan första ankomst och sista avfärd
3. Säkerställa att separata återbesök senare på dagen fortfarande visas som egna rader.

### Regler som implementationen ska följa
- Slå ihop rader när de representerar samma fysiska plats.
- Slå bara ihop kluster som ligger nära varandra i både plats och tid.
- Korta luckor i pingarna ska tolkas som GPS-glapp, inte som att användaren lämnat platsen.
- Ett tydligt besök på annan plats emellan ska bryta sammanslagningen.
- Olika adresser ska aldrig slås ihop.

### Förväntat resultat för exemplet du visade
Listan ska reduceras till ungefär:
- David Adrians väg, Upplands Väsby: 07:05 → 08:38
- Hammarbacken, Sollentuna: 08:58 → 09:14
- Drottninggatan, Stockholm: 09:34 → 11:17
- David Adrians väg, Upplands Väsby: 11:37 → 12:06
- Pommervägen, Sollentuna: 12:30 → 13:19
- Venngarn, Sigtuna: 13:49 → 14:47

## Tekniska detaljer
- Den nuvarande breda sammanslagningen i `mergeAdjacentSamePlace` ska ersättas med en striktare regel:
  - endast direkt angränsande kluster
  - inom rimlig platsradie
  - med kort max-glapp i minuter
- Ingen look-ahead som kan råka slå ihop flera separata besök över längre tid.
- Starttid ska hämtas från första klustret i serien och sluttid från sista klustret i serien.
- Om nödvändigt justeras centroid/centerpunkt för ett sammanslaget besök så adressuppslagningen fortsätter bli stabil.

## Verifiering
- Kontrollera att morgonens tre rader på David Adrians väg blir en rad.
- Kontrollera att Drottninggatan 09:34, 10:51 och 11:10 blir en rad 09:34 → 11:17.
- Kontrollera att återkomsten till David Adrians väg 11:37 → 12:06 fortfarande visas som ett nytt separat besök.
- Kontrollera att UI-tabellen inte ändras på annat sätt än att felaktiga dubletter försvinner.