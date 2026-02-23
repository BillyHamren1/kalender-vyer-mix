

# Omdesign: Personalsidan -- Allt pa svenska, allt pa en sida

## Vad som andras

Hela `StaffDetail.tsx` skrivs om till en **ensidig, scrollbar vy** dar ALL information visas direkt -- utan tabbar, toggler eller "Redigera"-dialoger. Alla falt ar direkt-redigerbara inline (som idag, men utan kraven pa att oppna en separat dialog).

## Nuvarande problem

- All text ar pa engelska ("Personal Information", "Hours This Month", etc.)
- Informationen ar uppdelad i tva vyer via en toggle-switch (Staff Info / Time Reports)
- "Edit Staff"-knappen oppnar en separat dialog -- redundant eftersom falten redan ar inline-redigerbara
- Rorigt och svart att fa en helhetsbild

## Ny layout (en enda scrollbar sida)

```text
+--------------------------------------------------+
| <- Tillbaka              [Aktiv/Inaktiv toggle]   |
| [Initialer]  Anna Andersson                       |
|              Tekniker | Avdelning X               |
+--------------------------------------------------+
|                                                    |
| --- Personuppgifter ---                           |
| Namn: [direkt-redigerbart]                        |
| E-post: [direkt-redigerbart]                      |
| Telefon: [direkt-redigerbart]                     |
|                                                    |
| --- Anstallning ---                               |
| Roll: [direkt-redigerbart]                        |
| Avdelning: [direkt-redigerbart]                   |
| Anstallningsdatum: [direkt-redigerbart]           |
|                                                    |
| --- Lon & ersattning ---                          |
| Timlon: [direkt-redigerbart]                      |
| OB-tillagg: [direkt-redigerbart]                  |
| Manadslon: [direkt-redigerbart]                   |
|                                                    |
| --- Adress ---                                    |
| Adress / Postnummer / Stad                        |
|                                                    |
| --- Kontaktperson vid nodfall ---                 |
| Namn / Telefon                                    |
|                                                    |
| --- Anteckningar ---                              |
| [direkt-redigerbart textfalt]                     |
|                                                    |
| --- Konto ---                                     |
| StaffAccountCard (oforandrad)                     |
|                                                    |
| --- Tidrapporter (feb 2026) ---  [<] [>] [+]     |
| Manadsstatistik: Timmar | Intjaning | Antal | OB  |
| [Lista med tidrapporter]                           |
+--------------------------------------------------+
```

## Tekniska steg

### 1. Oversatt alla etiketter till svenska
Alla hardkodade engelska strangar ersatts:

| Engelska | Svenska |
|---|---|
| Personal Information | Personuppgifter |
| Full Name | Namn |
| Email | E-post |
| Phone | Telefon |
| Employment Details | Anstallning |
| Role/Position | Roll |
| Department | Avdelning |
| Hire Date | Anstallningsdatum |
| Financial Information | Lon och ersattning |
| Hourly Rate (SEK) | Timlon (kr) |
| Overtime Rate (SEK) | OB-tillagg (kr) |
| Monthly Salary (SEK) | Manadslon (kr) |
| Address Information | Adress |
| Emergency Contact | Kontaktperson vid nodfall |
| Contact Name | Namn |
| Contact Phone | Telefon |
| Notes | Anteckningar |
| Hours This Month | Timmar denna manad |
| Earnings This Month | Intjaning denna manad |
| Reports Submitted | Inlamnade rapporter |
| Overtime Hours | OB-timmar |
| Staff member not found | Personal hittades inte |
| Loading staff details... | Laddar personaluppgifter... |

Aven toast-meddelanden och knappar oversatts.

### 2. Ta bort toggle-switchen och visa allt pa en sida
- Ta bort `showTimeReports`-state och Switch-komponenten
- Visa personalinformation OCH tidrapporter efter varandra i en scrollbar vy
- Behall `DirectEditField`-komponenten (den ar bra for inline-redigering)

### 3. Ta bort "Edit Staff"-knappen och EditStaffDialog
- All redigering sker redan inline via `DirectEditField`
- Dialogen ar overplodig -- ta bort importen och renderingen
- Headern forenklas: bara "Tillbaka"-knapp och eventuellt en aktiv/inaktiv-toggle

### 4. Flytta tidrapportssektionen till botten av sidan
- Manadsnavigation, statistikkort och tidrapportslistan visas direkt under personalinfo
- "Lagg till tidrapport"-knappen placeras vid tidrapportsrubriken
- `TimeReportForm` visas som expanderbar sektion, inte i en separat dialog

### 5. Filer som andras
- **`src/pages/StaffDetail.tsx`** -- huvudsaklig omskrivning (ta bort toggle, oversatt, samla allt)
- Inga nya filer behovs, inga andra filer paverkas

