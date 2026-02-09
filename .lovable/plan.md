

# Ta bort teal-headern och fixa loggan i alla mejlmallar

## Problem
1. **Loggan syns inte** -- Bilden finns i Supabase Storage och URL:en fungerar, men mejlklienter (Gmail/Outlook) kan blockera den. Nuvarande URL saknar cache-bust-parameter och alt-texten ar inte tillrackligt tydlig som fallback.
2. **Teal-headern ska bort** -- Anvandaren vill INTE ha den fargade headern alls. Titeln ("Transportforfragan", "Korning bokad!" osv.) ska vara vanlig mork text, inte vit text pa fargad bakgrund.

## Losning

Ta bort den separata teal/rod header-raden helt. Flytta titeln ner som vanlig mork text direkt under logo-raden. Resultatet blir en renare, enklare layout:

**Nuvarande layout (3 rader):**
```text
+--------------------------------------+
| [logga]             Referensnummer   |  <-- Vit rad (loggan syns inte)
+--------------------------------------+
| TRANSPORTFORFRAGAN                   |  <-- Teal header (ska bort)
| Ny korning att granska...            |
+--------------------------------------+
| Hej Partner,                         |  <-- Text
| Vi har en ny transport...            |
+--------------------------------------+
```

**Ny layout (2 rader):**
```text
+--------------------------------------+
| [logga]             Referensnummer   |  <-- Vit rad med logo
+--------------------------------------+
| Transportforfragan                   |  <-- Titel som vanlig mork text
| Ny korning att granska               |
|                                      |
| Hej Partner,                         |
| Vi har en ny transport...            |
+--------------------------------------+
```

## Tekniska detaljer

### Logo-fix
- Lagga till `?t=1` som cache-bust-parameter pa Storage-URL:en
- Lagga till `onerror`-fallback-text som visas om bilden inte laddas
- Behalla `alt="Frans August"` som fallback-text

### Alla 3 filer andras pa samma satt:

**1. `supabase/functions/send-transport-request/index.ts`**
- Ta bort `<!-- Header -->` `<tr>` (raderna med teal gradient, h1 och subtitle)  
- Lagga till titel som vanlig `<h1>` med mork farg (`#1a3a3c`) i content-arean, med subtitel under
- Sla ihop med halsnings-raden ("Hej Partner...") i samma `<td>` eller lagger titeln i en egen rad med minimal padding

**2. `supabase/functions/send-transport-cancellation/index.ts`**
- Samma andring: ta bort orange/rod header-rad
- Titel "Transport avbokad" som mork text. Kan anvanda rod farg (`#dc2626`) for titeln for att markera att det ar en avbokning

**3. `supabase/functions/handle-transport-response/index.ts`**
- Samma andring i bade `buildConfirmationEmail` och `buildBatchConfirmationEmail`
- "Korning bokad!" i teal-farg (`#279B9E`) som text, "Korning nekad" i rod farg (`#dc2626`)
- Ta bort headerBgColor/headerBgGradient-variablerna helt

### Ny HTML-struktur (ersatter bade header-raden och greeting-raden):

```html
<!-- Titel + Halsning (ersatter gamla Header + Partner greeting) -->
<tr>
  <td style="padding:20px 40px 0;">
    <h1 style="margin:0;font-size:22px;font-weight:700;color:#1a3a3c;letter-spacing:-0.5px;">
      Transportforfragan
    </h1>
    <p style="margin:4px 0 0;font-size:13px;color:#7a8b8d;">
      Ny korning att granska fran Frans August Logistik
    </p>
    <hr style="border:none;border-top:1px solid #e0ecee;margin:16px 0;" />
    <p style="margin:0;font-size:15px;color:#1a3a3c;font-weight:600;">
      Hej Partner,
    </p>
    <p style="margin:6px 0 0;font-size:14px;color:#5a6b6d;line-height:1.6;">
      Vi har en ny transportforfragan...
    </p>
  </td>
</tr>
```

For avbokning anvands rod titeltext:
```html
<h1 style="...;color:#dc2626;">Transport avbokad</h1>
```

For bekraftelse anvands teal (accepterad) eller rod (nekad):
```html
<h1 style="...;color:#279B9E;">Korning bokad!</h1>
<h1 style="...;color:#dc2626;">Korning nekad</h1>
```

### Filer som andras
- `supabase/functions/send-transport-request/index.ts`
- `supabase/functions/send-transport-cancellation/index.ts`
- `supabase/functions/handle-transport-response/index.ts`

### Edge Functions att deploya
- `send-transport-request`
- `send-transport-cancellation`
- `handle-transport-response`
