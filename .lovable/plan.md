

## En fråga: Varför pingar Raivis telefon inte längre?

Jag stannar och fokuserar bara på detta. Inga fixar, inga sidospår.

### Vad jag vet redan (från tidigare undersökningar)
- `staff_locations.updated_at` för Raivis = **08:02:22** idag. Sen tystnad.
- Position vid 08:02 = Stockholm city (~25 km från lagret) → telefonen levde och rörde sig.
- Inga `device_tokens` registrerade för Raivis någonsin.
- `staff_location_history` har 0 rader för honom (separat bug, inte orsaken till tystnaden).

### Vad jag behöver kolla för att svara på frågan
1. **Exakt sista ping-tid + alla pings sista 24h** för Raivis i `staff_locations` (är det verkligen 08:02 eller har det kommit nåt sen?).
2. **Sista raden i `staff_location_history`** över huvud taget — när slutade den skrivas?
3. **Kolla edge function logs (`mobile-app-api`)** för Raivis staff_id efter 08:02 — kommer det `report_location`-anrop som failar tyst, eller kommer det inga anrop alls?
4. **Auth-logs / `staff_sessions`** — finns en logout-event eller token-expiry runt 08:02?
5. **App-version + plattform** om det finns i `staff_locations`/`device_info` — web PWA eller native iOS/Android?

### Vad jag levererar
Ett rakt svar:  
**"Raivis telefon slutade pinga kl XX:XX. Orsaken är [A/B/C]."**

Möjliga orsaker (en av dessa kommer bekräftas):
- **A — Han stängde appen / dödade processen.** Inga anrop alls efter 08:02 i edge logs.
- **B — Token expirerade och re-auth misslyckades.** Edge logs visar 401:or efter 08:02.
- **C — OS dödade bakgrundsprocessen** (iOS "While Using" + skärm släckt → killed efter ~10 min). Anrop kommer i burst, sen tystnad.
- **D — Han loggade ut.** Auth-log visar SIGN_OUT.
- **E — Native plugin kraschade.** Inga anrop, men sessionen lever.

### Inga kodändringar i denna runda
Bara läsning av databas + edge logs för att ge dig **EN orsak med bevis**.

