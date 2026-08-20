# Tre packningsblock 21 aug – vad datan visar

Jag kontrollerade de tre korten i lagerkalendern. De är **inte** samma jobb kopierat tre gånger — det är tre olika bokningar från samma kund, var och en med egen adress, egna produkter och eget skapandedatum:

| Bokning | Rubrik | Adress | Produkter | Skapad | Riv |
|---|---|---|---|---|---|
| 2604-135 | 6x15 | Tornslingan | 25 | 27 apr | 25 aug |
| 2605-68 | Kopia | Dahlbergsvägen 20 | 25 | 21 maj | 24 aug |
| 2608-22 | 4x9 | Båtsmansvägen 47 B | 19 | 11 aug | 24 aug |

Varje bokning har exakt **en** packning och ett block — ingen dubblering sker i koden. Problemet är att kortet bara visar kundnamnet stort, så tre olika jobb ser identiska ut. Att en av dem heter "Kopia" i Booking förstärker känslan av dubblett.

## Vad jag föreslår

### 1. Gör korten identifierbara (huvudåtgärden)
Lagerkortet ska visa, i den befintliga layouten utan att bygga om kalendern:
- Bokningens rubrik (6x15 / 4x9) tydligt under kundnamnet — den hämtas redan men syns inte på packningskort idag.
- Leveransadressens gatunamn som andra rad, så tre jobb samma dag alltid går att skilja åt.
- Bokningsnumret behålls där det står idag.

### 2. Dubblettvarning istället för tyst likhet
Om två eller fler bokningar samma dag har samma kund **och** samma adress, markeras korten med en liten varningsikon "Möjlig dubblett". Idag har de tre olika adresser, så de flaggas inte — men äkta dubbletter fångas direkt i framtiden.

### 3. Verifieringstest
Ett automatiskt test som:
- Bygger kortdata för de tre bokningarna och säkerställer att rubrik + adress renderas och att korten får unikt innehåll.
- Säkerställer att en bokning aldrig genererar mer än ett packningsblock per dag i kalendern (regression mot äkta dubblering).
- En kontrollfråga mot databasen som listar bokningar med fler än en packning — svaret idag är noll rader.

## Teknisk detalj

- `src/pages/WarehouseCalendarPage.tsx`: skicka med `deliveryAddress` och rubrik i `extendedProps` även för packningskort samt beräkna dubblettflagga per dag (kund + adress).
- `src/components/Calendar/CustomEvent.tsx`: rendera rubrik + adressrad och varningsikon i packningskortets befintliga block; ingen ändring av kortets storlek, färger eller kalenderns layout.
- Nytt test under `src/__tests__/` som täcker punkterna ovan.
- Inga databasändringar.
