# Engångsfix: stäng gamla packningar

Alla packningar vars rivdatum redan passerat ska markeras som avslutade så de försvinner ur akut-/att-göra-listorna.

## Vad som händer

- Packningar med rivdatum (eller slutdatum) före dagens datum, som fortfarande ligger som **Planering** (150 st) eller **Pågående** (13 st), sätts till **Avslutad**.
- Totalt 163 rader uppdateras.
- Packningar som redan är avslutade, returnerade eller avbokade rörs inte.
- De 5 packningarna helt utan datum rörs inte (går inte att avgöra om de är klara).
- Ingen rad raderas, inget annat fält ändras.

## Teknisk detalj

En engångs-datauppdatering (ingen schemaändring, ingen kodändring):

```sql
UPDATE packing_projects p
SET status = 'completed', updated_at = now()
FROM (
  SELECT pp.id
  FROM packing_projects pp
  LEFT JOIN bookings b ON b.id = pp.booking_id
  WHERE COALESCE(b.rigdowndate, pp.end_date) < CURRENT_DATE
    AND pp.status IN ('planning','in_progress')
) x
WHERE p.id = x.id;
```

Status `completed_in` (169 gamla returer) lämnas orörd eftersom de redan räknas som klara.

## Efter körning

Kontrollräkning att inga packningar med passerat rivdatum ligger kvar i öppet läge, samt en titt på Lager OPS/översikten så att de akuta listorna är rensade.
