

## Signering: Spara i databasen + statusändring + visning

### Nuläge
"Signera"-knappen visar bara en toast. Ingenting sparas.

### Databasändring

Lägg till två kolumner på `packing_projects`:

```sql
ALTER TABLE packing_projects
  ADD COLUMN signed_by TEXT,
  ADD COLUMN signed_at TIMESTAMPTZ;
```

Ingen ny tabell behövs. Kolumnerna är nullable -- null = ej signerad.

### Kodändringar i `ManualChecklistView.tsx`

1. **`onConfirm`-logiken** ersätts med en asynkron funktion som:
   - Uppdaterar `packing_projects` med `signed_by = staffFirstName` (eller fullständigt namn), `signed_at = now()`, och `status = 'completed'`
   - Visar toast vid lyckat resultat
   - Visar felmeddelande vid misslyckande

2. **Efter signering**: Knappen ersätts med en "Signerad"-indikator som visar vem som signerade och när.

```text
Tryck "Signera" → Bekräfta "Ja"
    ↓
UPDATE packing_projects
  SET signed_by = 'Karl',
      signed_at = NOW(),
      status = 'completed'
  WHERE id = packingId
    ↓
toast('Signering klar!')
Knappen byts mot: ✓ Signerad av Karl, 25 feb 23:45
```

### Visning i packlistan (PackingDetail / PackingCard)

Visa en liten badge eller rad med "Signerad av X, datum" om `signed_by` finns. Exakt var och hur beror på befintlig layout -- men data finns tillgängligt via den befintliga fetchen.

### Framtida utökning

Med `signed_by`, `signed_at` och `status` på plats har du grunden för en packnings-dashboard som visar:
- Alla packningar med status (planering/pågående/signerad/klar)
- Vem som påbörjat och signerat
- Tid kvar till deadline (baserat på bokningens riggdag)

Det byggs som ett separat steg efter att signeringen fungerar.

### Sammanfattning av ändringar

| Vad | Var |
|-----|-----|
| Nya kolumner `signed_by`, `signed_at` | `packing_projects` (migration) |
| Spara signering + sätt status `completed` | `ManualChecklistView.tsx` |
| Visa signeringsstatus efter signering | `ManualChecklistView.tsx` |
| Uppdatera TypeScript-typer | `src/types/packing.ts` |

