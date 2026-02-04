
# Kolli-funktion för Scanner

## Översikt
Lägger till en "Kolli"-knapp i scannerappen som låter användaren gruppera produkter i fysiska kollin (fraktpaket). Flödet blir:

1. Tryck på "Kolli"-knappen
2. Scanna produkter som ska ingå i kolliet
3. Produkterna länkas till kolliet med nummer (Kolli #1, Kolli #2, etc.)
4. Tryck "Nästa kolli" för att starta ett nytt kolli, eller "Avsluta" för att gå tillbaka

## Användarflöde

```text
┌─────────────────────────────────────┐
│  Verifierings-vy                    │
│                                     │
│  [Progress bar]  [QR]  [📦 Kolli]   │
│                                     │
│  Produktlista...                    │
└─────────────────────────────────────┘
                │
                ▼ Tryck "Kolli"
┌─────────────────────────────────────┐
│  KOLLI-LÄGE  (#1)                   │
│  ─────────────────                  │
│  Scanna produkter för Kolli #1      │
│                                     │
│  ✓ Produkt A → Kolli #1             │
│  ✓ Produkt B → Kolli #1             │
│                                     │
│  [Nästa kolli]     [Avsluta]        │
└─────────────────────────────────────┘
                │
                ▼ Tryck "Nästa kolli"
┌─────────────────────────────────────┐
│  KOLLI-LÄGE  (#2)                   │
│  ─────────────────                  │
│  Scanna produkter för Kolli #2      │
│                                     │
│  ✓ Produkt C → Kolli #2             │
│                                     │
│  [Nästa kolli]     [Avsluta]        │
└─────────────────────────────────────┘
```

---

## Tekniska ändringar

### 1. Ny databastabell: `packing_parcels`
Sparar varje kolli för en packlista:

| Kolumn | Typ | Beskrivning |
|--------|-----|-------------|
| id | UUID | Primärnyckel |
| packing_id | UUID | Koppling till packlista |
| parcel_number | INTEGER | Kollinummer (1, 2, 3...) |
| created_by | TEXT | Vem som skapade kolliet |
| created_at | TIMESTAMP | När det skapades |

### 2. Ny kolumn i `packing_list_items`
Lägger till en referens till vilket kolli produkten packats i:

| Kolumn | Typ | Beskrivning |
|--------|-----|-------------|
| parcel_id | UUID | Referens till kolli (nullable) |

### 3. Nya tjänstefunktioner i `scannerService.ts`
- `createParcel(packingId, createdBy)` - Skapa nytt kolli
- `assignItemToParcel(itemId, parcelId)` - Länka produkt till kolli
- `getParcelsByPacking(packingId)` - Hämta alla kolli för en packlista

### 4. UI-ändringar i `VerificationView.tsx`
- Ny knapp "Kolli" bredvid QR-knappen
- Kolli-läge med header som visar aktuellt kollinummer
- Vid scan/manuell bockning: produkten kopplas till aktivt kolli
- Knappar "Nästa kolli" och "Avsluta"
- Visuell indikator på produkter som visar vilket kolli de tillhör (t.ex. "📦 #1")

---

## Visuellt i produktlistan

Efter kolli-tilldelning visas ett litet märke på produkten:

```text
✓ MULTIFLEX 8X15          📦#1    1/1
  ↳ Transparant Vägg 3M   📦#1    3/3
  ↳ Tak                   📦#2    1/1
```

---

## Filer som ändras

| Fil | Ändring |
|-----|---------|
| `supabase/migrations/` | Ny tabell + kolumn |
| `src/integrations/supabase/types.ts` | Uppdateras automatiskt |
| `src/services/scannerService.ts` | Nya funktioner för kolli |
| `src/components/scanner/VerificationView.tsx` | UI för kolli-läge |
| `src/types/packing.ts` | Typdefinitioner för Parcel |
