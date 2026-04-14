

## Plan: Tydligare "FRÅN → TILL" i ändringsvisningen

### Problem
Datan i databasen är korrekt — `previous_values` och `new_values` lagras båda. Men:
1. Vid `change_type = 'new'` (ny bokning) finns inga `previous_values`, så allt visas som "– → värde" utan förklaring
2. Layouten gör det otydligt vad som är gammalt vs nytt

### Lösning i `BookingChangesDetail.tsx`

**1. Visa ändringstyp som rubrik:**
- `change_type = 'new'` → "Ny bokning skapad"
- `change_type = 'update'` → "Bokning uppdaterad"  
- `change_type = 'status_change'` → "Status ändrad"

**2. Ny layout per fält — tydliga "Från/Till"-etiketter:**

Vid **update/status_change** (där det finns gamla värden):
```text
Riggtid start
  Från: 08:00  →  Till: 09:00
```

Vid **new** (inget gammalt värde):
```text
Riggtid start
  Satt till: 09:00
```

**3. Bättre visuell separation:**
- Varje fält som en egen rad med fältnamn som etikett ovanför
- Gamla värdet i dämpad färg, nytt i primary/grön
- Pil bara vid faktiska ändringar (inte vid nya värden)

### Fil som ändras
| Fil | Ändring |
|-----|---------|
| `src/components/booking/BookingChangesDetail.tsx` | Rubrik med ändringstyp, "Från/Till"-layout, hantera `new` vs `update` |

