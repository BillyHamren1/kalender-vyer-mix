# Plan för att hitta varför Raivis får "Login failed"

## Vad jag redan har verifierat
- **Raivis finns** i `staff_members`.
- Han har även en **`staff_accounts`-rad**.
- Hans användarnamn/e-post är `raivisminalto457@gmail.com`.
- Hans lösenordshash matchar exakt standardlösenordet **Frasse123**.
- Han har dessutom ett **aktivt `active_mobile_session_id`**, vilket betyder att kontot åtminstone har lyckats logga in tidigare.
- För **Billy** ser vi färska `mobile-app-auth`-loggar med lyckad login.
- För **Raivis** ser vi **inga färska POST-loggar** i `mobile-app-auth` när felet rapporteras.
- I edge-analytics syns i princip bara **OPTIONS/preflight**, inte själva login-anropet för Raivis.

## Trolig felbild
Det starkaste spåret just nu är att **Raivis telefon/app inte når själva POST-loginet**, eller att frontend **maskerar det riktiga felet** och alltid visar den generiska texten "Login failed".

Det betyder att problemet sannolikt ligger i någon av dessa:
1. **Nätverk / native fetch / CORS / timeout** på just hans enhet eller build.
2. **Frontendens felhantering** i loginrutan visar fel text och döljer det riktiga orsaksmeddelandet.
3. Mindre sannolikt: en edge-funktion svarar med ett fel som inte loggas tydligt nog.

## Det jag föreslår att jag bygger
### 1) Förbättrad felvisning i mobil-login
Jag ändrar login-sidan så att den **visar det verkliga felmeddelandet** när vi får ett nätverksfel, timeout eller serversvar, istället för att nästan alltid översätta allt till "Login failed".

Exempel:
- fel användarnamn/lösen → "Fel e-post eller lösenord"
- timeout → tydligt timeout-meddelande
- nätverksfel → "Kunde inte nå servern..."
- backend-svar 403/500 → visa backendens riktiga text

### 2) Tydligare diagnostik i loginflödet
Jag lägger till **smal, riktad loggning** i frontend/loginflödet så vi kan skilja mellan:
- request startad
- preflight OK men POST saknas
- POST svarar med statuskod
- fetch dör innan svar
- timeout på 30s

### 3) Verifiering i preview + tester
Efter ändringen testar jag loginflödet direkt och kör relevanta tester så att vi vet att:
- Billy fortsatt fungerar
- fel credentials fortfarande ger rätt text
- nätverks-/timeoutfel inte längre döljs bakom "Login failed"

## Förväntat resultat
Efter denna ändring kommer vi kunna säga exakt vilket av dessa som gäller för Raivis:
- **fel konto/lösen**
- **nätverksproblem på enheten**
- **native/TestFlight-build-problem**
- **timeout/cold-start-problem**
- **backendfel**

## Teknisk not
Det finns redan en konkret brist i koden:
- `src/pages/mobile/MobileLogin.tsx` fångar fel och visar bara riktig text för exakt strängen **`Invalid email or password`**.
- Alla andra fel — även tydliga nätverks- och timeoutfel — blir bara **`login.failed`**.

Det är därför fullt möjligt att Raivis faktiskt får ett mycket mer specifikt fel bakom kulisserna, men UI:t gömmer det.

## När planen är genomförd
Om loggen efter detta fortfarande visar att **Raivis aldrig når POST-login**, då vet vi att felet ligger **utanför kontot** och sannolikt i hans TestFlight-build eller nätverksmiljö — inte i databasen.