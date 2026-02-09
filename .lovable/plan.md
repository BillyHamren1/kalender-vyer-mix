
# Bekraftelsemail istallet for webbsida vid partnersvar

## Problem
1. **Sidan visar ra HTML** -- Trots tidigare fix med headers renderas fortfarande HTML-kallkod i webblasaren nar partnern klickar pa acceptera/neka-lanken. Teckenkodningen ar ocksa trasig (t.ex. "Korning" visas som "KA¶rning").
2. **Onodigt steg** -- Partnern tvingas till en webbsida som de anda bara stanger direkt.

## Losning
Istallet for att visa en HTML-sida nar partnern svarar, skickar vi ett **bekraftelsemejl via Resend** till partnern och gor en enkel **HTTP-redirect** till en minimal tacksida. Tacksidan behover bara vara extremt enkel -- ingen komplex HTML.

Flode idag:
```text
Partner klickar lank --> Edge function --> Visar HTML-sida (trasig)
```

Nytt flode:
```text
Partner klickar lank --> Edge function --> Uppdaterar DB + Skickar bekraftelsemejl --> Enkel redirect-sida
```

## Tekniska detaljer

### Fil: `supabase/functions/handle-transport-response/index.ts`

**Andringar:**

1. **Lagg till Resend-import** for att skicka bekraftelsemejl
2. **Hamta vehicle.contact_email** fran DB:n (redan tillganglig via join pa `vehicles`)
3. **Bygg och skicka bekraftelsemejl** med samma visuella stil som ovriga mejl (logo, teal/rod header, etc.)
4. **Ersatt den komplexa HTML-sidan** med en minimal redirect/tack-respons som anvander `Response.redirect()` eller en extremt enkel sida som bara sager "Tack, kolla din mejl"

**Bekraftelsemejlets innehall (vid accept):**
- Logo + referensnummer
- Gron/teal header: "Korning bokad!"
- Text: "Tack [Partnernamn]! Ni har accepterat transporten for [Kund] den [Datum]. Vi aterkommer med ytterligare detaljer vid behov."
- Transportdetaljer (datum, tid, adress)
- Footer

**Bekraftelsemejlets innehall (vid neka):**
- Logo + referensnummer
- Rod header: "Korning nekad"
- Text: "Tack for ert svar [Partnernamn]. Korningen for [Kund] den [Datum] har registrerats som nekad."
- Footer

**Enkel webbsida (ultra-minimal):**
- Visar bara: "Tack! Ett bekraftelsemejl har skickats till er." (inga svenska specialtecken-problem med sa lite text, och vi kan anvanda HTML-entities som `&ouml;` istallet)

**DB-query utokad:**
- Lagga till `contact_email` i vehicle-joinen sa vi har mejladressen
- Lagga till `booking_number` fran booking-joinen for referens i mejlet

**Mejlloggning:**
- Logga bekraftelsemejlet i `transport_email_log` med type `transport_confirmation`

### Filer som andras
- `supabase/functions/handle-transport-response/index.ts` -- Omskriven: skickar bekraftelsemejl via Resend + minimal tacksida

### Edge Functions att deploya
- `handle-transport-response`
