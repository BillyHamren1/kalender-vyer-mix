
# Flytta tidrapporter till en tabb i headern

## Vad som andras

Tidrapporter visas inte langre oppet pa sidan. Istallet laggs tva tabbar till hogst upp pa personalsidan -- **"Information"** och **"Tidrapporter"** -- sa att anvandaren valjer vilken vy som visas.

## Teknisk losning

### Endra i `StaffDetail.tsx`

1. **Lagg till en `activeTab` state** (`'info' | 'timereports'`) med default `'info'`
2. **Lagg till `Tabs`-komponent** (fran `@radix-ui/react-tabs` som redan finns) i headern, under namn/badges
3. **Wrappa innehallet i `TabsContent`**:
   - `TabsContent value="info"`: Alla kort (Personuppgifter, Anstallning, Lon, Adress, Nodfallskontakt, Anteckningar, Konto)
   - `TabsContent value="timereports"`: Tidrapporter-kortet (manadsnavigation, statistik, formuler, lista)
4. **Ta bort det separata Tidrapporter-kortet** fran den scrollbara listan och flytta innehallet till sin tabb

### Layout

```text
+--------------------------------------------------+
| <- Tillbaka                                       |
| [Initialer]  Anna Andersson                       |
|              Tekniker | Avdelning X               |
|                                                    |
| [Information]  [Tidrapporter]    <-- tabbar        |
+--------------------------------------------------+
| (innehall baserat pa aktiv tabb)                  |
+--------------------------------------------------+
```

### Importandringar
- Lagg till import av `Tabs, TabsList, TabsTrigger, TabsContent` fran `@/components/ui/tabs`

### Ingen annan fil paverkas
