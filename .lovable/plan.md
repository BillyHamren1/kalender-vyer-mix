

## Upprensning av Personalsidan

### Problem
Sidan har for manga synliga knappar, ikoner och element som konkurrerar om uppmarksamhet. Varje personalkort har 5-6 interaktiva element (toggle, 3 knappar, nyckelikon), headern har 4 knappar, och hogerpanelen ar tung. Det saknas tydlig visuell hierarki.

---

### 1. Forenkla headern

**Fore:** 4 separata knappar (Importera, Exportera, Uppdatera, Lagg till personal)

**Efter:** Behall bara "Lagg till personal" som primar knapp. Flytta Importera, Exportera och Uppdatera till en enda "mer"-meny (DropdownMenu med tre-punkts-ikon). Titeln andras fran "Personaladministration" till "Personal" och undertiteln kortas.

---

### 2. Forenkla personalkorten

**Fore:** Varje kort visar avatar med nyckelikon-overlay, namn, roll, mejl, telefon, aktiv-toggle, kalenderknapp, fargknapp, redigeringsknapp.

**Efter:**
- Ta bort nyckelikon-overlayen pa avataren (kontostatus finns redan i hogerpanelen)
- Ta bort de tre separata aktionsknapparna (kalender, farg, redigera) - ersatt med en enda liten redigeringsikon som visas vid hover
- Behall aktiv-toggeln men gor den mer diskret (mindre, utan text "Aktiv/Inaktiv")
- Klick pa kortet navigerar till personaldetaljsidan (fungerar redan)
- Fargandring flyttas till redigeringsdialogen istallet for separat panel

---

### 3. Ta bort farginstellningar-panelen fran hogersidan

Farginstellningspanelen tar plats och ar overfloding som separat sektion. Fargvalet flyttas istallet in i EditStaffDialog sa att allt redigeras pa ett stalle. Hogersidan visar da bara Personalkonton-panelen.

---

### 4. Rensa hogerpanelens (Personalkonton) visuella tyngd

- Behall all funktionalitet
- Gor layouten mer kompakt med mindre mellanrum
- Ta bort hardkodade farger (green-50, orange-100) och anvand semantiska tokens istallet (bg-muted, text-muted-foreground)

---

### Tekniska andringar

| Fil | Andring |
|---|---|
| `src/pages/StaffManagement.tsx` | Byt ut separata knappar mot DropdownMenu. Ta bort farginstallningspanelen fran layouten. Rensa bort `selectedStaffForColor`-state. Andra titel till "Personal". |
| `src/components/staff/StaffList.tsx` | Ta bort nyckelikon-overlay fran avatar. Ersatt tre aktionsknappar med en hover-synlig redigeringsikon. Ta bort `onColorEdit` prop. |
| `src/components/staff/StaffAccountsPanel.tsx` | Byt hardkodade farger (green-50, orange-100) till semantiska tokens. |
| `src/components/staff/EditStaffDialog.tsx` | Lagg till fargvaljare i dialogen (importera ColorPicker). |

### Vad som INTE andras
- Alla funktioner behalls (lagg till, redigera, importera, exportera, konton, tillganglighet)
- Navigering till personaldetalj vid klick fungerar som forut
- Kontosystemet (skapa/ta bort/aterstall) rors inte
- Befintliga dialoger och datafloden behalls

