
## Fixplan: gör "Starta från ankomsttid" tydlig och omissbar

### Trolig orsak
Koden har redan stöd för baklogg:
- `ArrivalPromptDialog` renderar `Starta från {arrivalLabel}`
- `MobileAppLayout` skickar rätt `arrived_at` till dialogen

Det som sannolikt gick fel är UI-flödet på mobil:
1. Dialogens knapplayout bygger på `DialogFooter`, som redan har `flex-col-reverse`.
2. `ArrivalPromptDialog` lägger ovanpå egna klasser (`flex-col sm:flex-row`), vilket gör ordning/prioritet skör på små skärmar.
3. Resultatet blir att "Starta nu" / "Inte nu" upplevs som de tydliga valen, medan backdate-knappen inte blir primär nog och kan hamna fel visuellt.
4. Om användaren öppnar `Anpassa tid` defaultas tiden till **nu**, vilket förstärker känslan att baklogg saknas.

### Vad jag bygger
1. Gör `Starta från {ankomsttid}` till den tydliga primärknappen längst upp i mobil-dialogen.
2. Lägg `Starta nu` och `Inte nu` som sekundära val under den.
3. Säkerställ att dialogen på små skärmar alltid är fullt läsbar:
   - bättre vertikal layout
   - ingen risk att primärknappen hamnar utanför synligt område
   - ev. maxhöjd + scroll i dialoginnehåll vid små viewportar
4. Ändra `Anpassa tid` så den startar på **ankomsttiden**, inte aktuell tid.
5. Behåll serverlogiken oförändrad — problemet verkar vara presentation/UX, inte själva `arrived_at`-värdet.

### Berörda filer
- `src/components/mobile-app/ArrivalPromptDialog.tsx`
- `src/components/ui/dialog.tsx` endast om den gemensamma footer-komponenten behöver säkras utan att påverka andra dialoger
- eventuellt `src/components/mobile-app/MobileAppLayout.tsx` om vi vill skicka extra UI-state, men sannolikt behövs det inte

### Tekniska ändringar
- Sluta förlita dialogen på den generella `DialogFooter`-ordningen för dessa tre CTA:er
- Bygg explicit CTA-stack i `ArrivalPromptDialog`
- Sätt `customTime` = ankomstens `HH:mm`
- Säkerställ mobilanpassning med tydlig knappordning:
```text
[ Starta från 07:27 ]  <- primär
[ Starta nu ]
[ Inte nu ]
[ Anpassa tid ]
```

### QA
Jag verifierar efter implementation att:
1. prompten på mobil alltid visar `Starta från {tid}` när `arrived_at` finns
2. den knappen är synlig utan extra scroll på normal mobilhöjd
3. `Anpassa tid` öppnar med ankomsttid förifylld
4. valet `Starta från` verkligen startar timern med `arrivalState.arrived_at`
5. flödet fungerar end-to-end i lager/scenario med faktisk arrival-prompt

### Inte i denna ändring
- Ingen ny serverlogik för att räkna ut ännu äldre ankomst än `location_time_entries.entered_at`
- Ingen ny separat “baklogga”-dialog
- Ingen databasändring
