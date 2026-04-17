

Användaren beskriver flödet för "dagens slut":
- Användaren loggar ut själv (manuellt stop av timer)
- Systemet vet senaste geofence-exit (sista gången hen lämnade arbetsplatsen)
- Vid stopp: dialog "Du lämnade arbetsplatsen kl XX:XX, använd som sluttid? Ja/Nej"
- Ja → tidrapport sparas med exit-tiden som end_time
- Nej → användaren skriver egen sluttid + kommentar (t.ex. "handlade på Bauhaus")
  - Systemet hämtar GPS-position vid den angivna sluttiden från `staff_locations` och sparar som anomaly med plats-info
  - Visas i adminvyn under avvikelser

Detta är en utökning av anomaly-systemet — inte ersättning. Det handlar specifikt om "tail end"-perioden mellan sista geofence-exit och manuell stop.

Jag behöver kolla:
1. Hur lagras staff_locations (för att kunna slå upp position vid given tidpunkt)
2. Hur ser nuvarande timer-stop ut i GlobalActiveTimerBanner
3. Finns geofence-exit-event lagrat någonstans (eller måste vi läsa från location_time_entries.exited_at)

Plan blir relativt enkel: ny dialog vid stop, ny endpoint för att hämta position vid tidpunkt, anomaly-skapande vid "Nej".

