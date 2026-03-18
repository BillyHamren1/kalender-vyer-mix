

## Plan: Inventarie-API integration i scanner-flödet

### Förståelse

Varje skannad QR-kod är ett unikt serienummer på en fysisk enhet. Systemet ska **alltid** validera och allokera via det externa inventarie-API:t — ingen lokal SKU-matchning. Det externa API:t svarar med vilken artikeltyp/SKU enheten tillhör, och den lokala packlistan uppdateras baserat på det.

### Flöde

```text
Scan QR → "QR-00142"
  ↓
scanner-api verify_product:
  1. Slå upp booking_id från packing_projects WHERE id = packingId
  2. POST allocate-instance → { serial_number: "QR-00142", reservation_id: booking_id }
     Headers: Authorization: Bearer PRICELIST_API_KEY, x-organization-id: ORG_ID
  3. Response: { sku: "STOL-001", item_type: "Bankettstol vit", remaining: 6, ... }
  4. Matcha SKU mot lokal packing_list_items → uppdatera quantity_packed +1
  5. Returnera samma format som idag (success, itemId, productName, etc.)
```

### Ändringar

**1. Ny secret: `PRICELIST_API_KEY`**

Måste läggas till via secrets-verktyget innan implementering.

**2. `supabase/functions/scanner-api/index.ts` — ersätt `verify_product`-logiken**

Nuvarande logik (rad 207-248) matchar SKU lokalt. Ersätt med:

- Hämta `booking_id` från `packing_projects` via `packingId`
- Om inget `booking_id` finns → returnera fel ("Packlistan saknar kopplad bokning")
- POST till `https://pnvvnvywphfvmwdmqqzs.supabase.co/functions/v1/allocate-instance` med `{ serial_number: sku, reservation_id: booking_id }`
- Headers: `Authorization: Bearer <PRICELIST_API_KEY>`, `x-organization-id: <ORG_ID>`
- Vid 200: ta ut `sku` från svaret, matcha mot packing_list_items, uppdatera `quantity_packed +1` (samma lokala uppdateringslogik som idag)
- Vid 409: returnera `{ success: false, error: "Enheten är inte tillgänglig eller fullt allokerad" }`
- Vid 404: returnera `{ success: false, error: "Enheten hittades inte i lagersystemet" }`

**3. Ingen frontend-ändring krävs**

`handleScan` anropar `verifyProductBySku` som delegerar till `verify_product`. Svarsformatet är detsamma — frontenden vet inte om det var en inventarie-allokering.

### Filer som ändras

| Fil | Ändring |
|-----|--------|
| `supabase/functions/scanner-api/index.ts` | Ersätt `verify_product` med inventarie-API-anrop |

### Secret som behövs

| Secret | Status |
|--------|--------|
| `PRICELIST_API_KEY` | Saknas — behöver läggas till |

