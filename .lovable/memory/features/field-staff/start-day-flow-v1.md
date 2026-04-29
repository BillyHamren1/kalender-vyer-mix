---
name: Start Day Flow v1
description: Starta dagen uses quick GPS auto-start on geofence hit, else mandatory choice dialog; off-site manual starts require explanation.
type: feature
---
Starta dagen följer denna policy i mobilappen:

- Vid tryck på **Starta dagen** görs en snabb GPS-poll (upp till ~3 sekunder).
- Om användaren matchar en booking/projekt inom geofence (`ENTER_RADIUS`) ska dagen **auto-startas direkt** med workday + projekttimer.
- Om ingen GPS-träff finns ska `StartDayDialog` öppnas och användaren **måste** välja ett projekt/plats eller skriva fri text.
- Fri text skapar `workday_flag` av typen `unclear_start_target`.
- Om användaren manuellt startar ett projekt men befinner sig tydligt utanför platsen (>300 m), måste användaren ange en förklaring innan start; den sparas som kommentar via `geofence_presence_mismatch`.
- Knappen i headern ska fortsatt tydligt visa texten **Starta dagen** — inte bara ikon.