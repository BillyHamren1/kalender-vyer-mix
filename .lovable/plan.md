
# Plan: Packlistor med QR-verifiering

## Problem
Systemet har uppgifter som "Packlista klar" men inga **faktiska packlistor** med produkter att checka av. Lagerpersonal behöver kunna:
1. Se alla produkter som ska packas för en bokning
2. Markera varje produkt som "packad"
3. Verifiera packning via QR-scanner

## Lösningsöversikt

### Ny databasstruktur

| Tabell | Syfte |
|--------|-------|
| `packing_list_items` | Koppling mellan packing_project och produkter, med status för varje artikel |

```text
packing_list_items
├── id (uuid)
├── packing_id → packing_projects.id
├── booking_product_id → booking_products.id
├── quantity_to_pack (integer)
├── quantity_packed (integer, default 0)
├── packed_by (text, nullable)
├── packed_at (timestamptz, nullable)
├── verified_by (text, nullable)  
├── verified_at (timestamptz, nullable)
├── notes (text, nullable)
└── created_at (timestamptz)
```

### Nytt UI: Packlista-flik

Lägg till en ny flik **"Packlista"** i PackingDetail som visar:

```text
┌─────────────────────────────────────────────────────────────────┐
│ Packlista                           Generera QR │ Slutför alla │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ▣ Multiflex 8x6 ..............................  2/3 packade   │
│   ☐ ↳ M Takduk 8m - Transparent .............  0/2 packade   │
│   ☑ ↳ M Transparant Vägg 3M .................  1/1 packade   │
│   ☐ ↳ Dubbeldörr till MF & F ................  0/1 packade   │
│                                                                 │
│ ☑ Multiflex 8x12 .............................  1/1 packade   │
│                                                                 │
│ ☐ F12 - 12x10/300 ............................  0/1 packade   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Packat: 4/36 artiklar (11%)                          ▓▓░░░░░░░ │
└─────────────────────────────────────────────────────────────────┘
```

### QR-skanner-flöde

1. **Generera QR-kod**: Skapar en unik URL för packlistans verifieringssida
2. **Skanna**: Personal skannar QR med mobilenhet
3. **Verifiera**: Mobilvy visar checklista, bekräftar packning artikel för artikel
4. **Logga**: Varje scan loggas med tidsstämpel och vem som verifierade

## Tekniska ändringar

| Fil | Typ | Beskrivning |
|-----|-----|-------------|
| `supabase/migrations/...` | Ny | Skapa `packing_list_items` tabell |
| `src/types/packing.ts` | Uppdatera | Lägg till `PackingListItem` interface |
| `src/services/packingService.ts` | Uppdatera | CRUD för packlisteartiklar |
| `src/hooks/usePackingDetail.tsx` | Uppdatera | Hämta och uppdatera packlisteposter |
| `src/components/packing/PackingListTab.tsx` | Ny | Huvudkomponent för packlistan |
| `src/components/packing/PackingListItem.tsx` | Ny | Enskild artikel med checkbox |
| `src/components/packing/PackingListProgress.tsx` | Ny | Progress-indikator |
| `src/components/packing/PackingQRCode.tsx` | Ny | QR-kod generator |
| `src/pages/PackingDetail.tsx` | Uppdatera | Lägg till Packlista-flik |
| `src/pages/PackingVerify.tsx` | Ny | Mobilvänlig verifieringssida |
| `src/App.tsx` | Uppdatera | Route för `/warehouse/packing/:id/verify` |

## Implementation: Automatisk generering av packlista

När en packning skapas (eller vid första besök av Packlista-fliken):

```text
1. Kontrollera om packing_list_items finns för detta packing_id
2. Om ej: 
   - Hämta alla booking_products för booking_id
   - Skapa en packing_list_item för varje produkt
   - Sätt quantity_to_pack = product.quantity
```

## Verifieringslogik

Varje packad artikel loggas med:
- `packed_by`: Namn på person som packade
- `packed_at`: Tidsstämpel
- `verified_by`: Namn på person som verifierade (via QR)
- `verified_at`: Tidsstämpel för verifiering

## Mobilvy för QR-verifiering

```text
┌─────────────────────────────┐
│ ✓ Packlista Verifiering     │
│ Testkund - 2026-01-30       │
├─────────────────────────────┤
│                             │
│ ☐ Multiflex 8x6        (3)  │
│ ☐ Multiflex 8x12       (1)  │
│ ☑ F12 - 12x10/300      (1)  │
│                             │
│ [Bekräfta nästa artikel]    │
│                             │
├─────────────────────────────┤
│ Verifierat: 1/15            │
└─────────────────────────────┘
```

## Resultat

Efter implementation:
- Ny "Packlista"-flik i packningsvyn
- Checkboxar för varje produkt (huvudprodukter + tillbehör)
- Progress-visning för hur mycket som är packat
- QR-kod för verifiering
- Mobilvänlig verifieringssida
- Loggning av vem som packade/verifierade varje artikel
