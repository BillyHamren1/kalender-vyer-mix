

# UI-granskning: Avvikelser fran designsystemet

## Hittade problem

### 1. ClientInformation -- avvikande storlekar
Kortet anvander mindre padding och typsnitt an alla andra kort:
- `py-2 px-3` istallet for `py-3 px-4`
- `text-sm` istallet for `text-base`
- `h-3.5 w-3.5` ikon istallet for `h-4 w-4`

### 2. Engelska kvar i flera komponenter

**StatusChangeForm.tsx:**
- Statusetiketter: "Offer", "Confirmed", "Cancelled" -- bor vara "Offert", "Bekraftad", "Avbokad"
- "Updating..." -- bor vara "Uppdaterar..."

**DateBadge.tsx:**
- "Not scheduled" -- bor vara "Ej schemalagd"
- ConfirmationDialog: "Remove rig day?", "Are you sure you want to remove...?", "Remove", "Cancel" -- allt pa engelska
- Tooltip: "Double-click to remove" / "Cannot remove the only..." -- engelska

**DatesSection.tsx:**
- "No dates scheduled" -- bor vara "Inga datum schemalagda"

**ProductsList.tsx:**
- "Qty:" -- bor vara "Antal:" eller "St:"

### 3. Hardkodade gra farger istallet for semantiska

Designsystemet foreskriver `text-muted-foreground` och `bg-muted` istallet for `text-gray-500`, `text-gray-400`, `bg-gray-50` etc.

**AttachmentsList.tsx:**
- `text-gray-500` (rad 211, 314) -- bor vara `text-muted-foreground`
- `text-gray-400` (rad 359) -- bor vara `text-muted-foreground`
- `divide-gray-100` (rad 244) -- bor vara `divide-border`
- `text-blue-600` for lankar (rad 300, 310) -- bor vara `text-primary`

**InternalNotes.tsx:**
- `text-gray-700` (rad 93) -- bor vara `text-foreground`
- `text-gray-400` (rad 93) -- bor vara `text-muted-foreground`
- `hover:bg-gray-50` (rad 93) -- bor vara `hover:bg-muted`

**DatesSection.tsx:**
- `text-gray-500` (rad 52) -- bor vara `text-muted-foreground`

**StatusChangeForm.tsx:**
- `text-gray-500` (rad 163) -- bor vara `text-muted-foreground`
- DialogContent saknar `bg-card` (designsystemkrav for alla dialoger/popups)

### 4. StatusChangeForm dialog saknar bg-card
Alla dialoger ska ha `bg-card` enligt designsystemet. Rad 169: `<DialogContent className="max-w-sm">` saknar `bg-card`.

---

## Atgardsplan

### Steg 1: ClientInformation -- standardisera storlekar
Andra till `py-3 px-4`, `text-base`, och `h-4 w-4` for att matcha ovriga kort.

### Steg 2: Oversatt all kvarvarande engelska

**StatusChangeForm.tsx:**
- "Offer" till "Offert", "Confirmed" till "Bekraftad", "Cancelled" till "Avbokad"
- "Updating..." till "Uppdaterar..."

**DateBadge.tsx:**
- "Not scheduled" till "Ej schemalagd"
- "Remove rig day?" till "Ta bort riggdag?"
- Bekraftelsetext och knappar pa svenska
- Tooltip-texter pa svenska

**DatesSection.tsx:**
- "No dates scheduled" till "Inga datum schemalagda"

**ProductsList.tsx:**
- "Qty:" till "Antal:"

### Steg 3: Byt hardkodade farger till semantiska

I **AttachmentsList.tsx**, **InternalNotes.tsx**, **DatesSection.tsx**, och **StatusChangeForm.tsx**:
- `text-gray-*` till `text-muted-foreground` / `text-foreground`
- `bg-gray-50` till `bg-muted`
- `divide-gray-100` till `divide-border`
- `text-blue-600` till `text-primary`

### Steg 4: Lagg till bg-card pa StatusChangeForm-dialogen

---

## Filer som andras

| Fil | Andring |
|-----|---------|
| `src/components/booking/ClientInformation.tsx` | Standardisera padding/storlekar |
| `src/components/booking/StatusChangeForm.tsx` | Svenska etiketter, semantiska farger, bg-card |
| `src/components/booking/DateBadge.tsx` | Svenska texter |
| `src/components/booking/DatesSection.tsx` | Svenska texter, semantiska farger |
| `src/components/booking/ProductsList.tsx` | "Qty" till "Antal" |
| `src/components/booking/AttachmentsList.tsx` | Semantiska farger |
| `src/components/booking/InternalNotes.tsx` | Semantiska farger |

