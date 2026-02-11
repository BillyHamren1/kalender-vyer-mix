
# Samlad projektvy -- allt synligt utan flikar

## Vad vi andrar

Idag ar projektvyn uppdelad i flikar (Uppgifter, Filer, Kommentarer, Historik, Transport). Anvandaren maste klicka mellan flikar for att se olika delar. Vi tar bort flik-strukturen och visar **allt pa en enda scrollbar sida** i logiska sektioner, plus en ny sektion for bokningens produkter.

## Ny sidstruktur (uppifran och ned)

1. **Oversiktskort** (befintliga 3 kort -- behalls som de ar)
2. **Gantt-schema** (befintligt, visas alltid)
3. **Utrustning / Produkter** (NY) -- Visar bokningens produkter med hierarkisk gruppering
4. **Uppgifter** -- Checklistan
5. **Transport** -- Transportwidgeten
6. **Filer** -- Filsektionen
7. **Kommentarer** -- Kommentarsektionen
8. **Historik** -- Aktivitetsloggen

Varje sektion far en kompakt rubrik med ikon och badge (antal). Sektionerna ar visuellt separerade med `space-y-6`.

## Ny komponent: Produktlista

En ny komponent `ProjectProductsList` som:
- Tar emot `bookingId` och hamtar produkter fran `booking_products`
- Visar produkter i en kompakt lista med hierarkisk gruppering (samma logik som redan finns i projektet -- `parent_product_id`, `is_package_component`)
- Visar namn, antal, och eventuell notering
- Visar totalvikt/volym om data finns
- Ren, kompakt design utan overflodiga detaljer

## Teknisk plan

### 1. `ProjectViewPage.tsx` -- Ta bort Tabs, visa allt
- Ta bort `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger` helt
- Renderar alla sektioner sekventiellt med sektionsrubriker
- Lagg till Gantt-schemat och den nya produktlistan

### 2. `ProjectProductsList.tsx` (NY)
- Hamtar `booking_products` via `bookingId`
- Renderar en Card med rubrik "Utrustning" och produktlista
- Hierarkisk gruppering: huvudprodukter visas normalt, tillbehor/paketkomponenter indenteras med `pl-6` och `arrow`-indikator
- Visar `name`, `quantity`, och summary-rad med total antal produkter

### 3. `useProjectDetail.tsx` -- Ingen andring (redan exponerar all data)

## Filer

| Fil | Andring |
|-----|---------|
| `src/pages/project/ProjectViewPage.tsx` | Ta bort flikar, visa allt sekventiellt, lagg till Gantt + Produkter |
| `src/components/project/ProjectProductsList.tsx` | Ny komponent for bokningens produkter |
