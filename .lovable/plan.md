# Leverantörsmejl i Planning — kartläggning och minsta säkra avsändarmodell

Analys enligt begäran. Ingen kod ändras i detta steg.

## 1. Vad som finns idag

**Utgående mejl sker endast i tre Edge Functions, alla via Resend-SDK och alla hårdkodade till Frans August:**

| Funktion | Rad | Avsändare |
|---|---|---|
| `supabase/functions/send-transport-request/index.ts` | 497 | `Frans August Logistik <noreply@fransaugust.se>` |
| `supabase/functions/send-transport-cancellation/index.ts` | 278 | samma |
| `supabase/functions/handle-transport-response/index.ts` | 361 | samma (bekräftelse tillbaka till partner) |

Ytterligare hårdkodning: logotyp-URL och `APP_URL = https://kalender-vyer-mix.lovable.app` i `handle-transport-response`, samt "Frans August Logistik" i HTML-mallarnas rubrik/footer i `send-transport-request`.

Nyckel: en enda global `RESEND_API_KEY` (Deno-env), inget per organisation.

**Ingen Reply-To sätts någonstans.** Mallen säger uttryckligen "Svara inte på detta mejl — använd knapparna ovan". Svar hanteras enbart via signerade länkar: `handle-transport-response?token=<partner_response_token>&action=accepted|declined`, som slår upp `transport_assignments` (rad 267) och därigenom `organization_id` + `booking_id`. Det finns alltså redan en fungerande token→org+bokning-koppling — men bara för klick, inte för mejlsvar.

**Leverantörsmejl (supplier) finns inte implementerat.** Tabellen `supplier_request_threads` existerar (kolumner: `project_id`, `booking_id`, `project_supplier_link_id`, `recipient_email`, `subject`, `body`, `status`, `response_token uuid`, `response_message`, `provider_message_id`, `sent_at`, `responded_at`, `organization_id`) men refereras ingenstans i `src/` eller `supabase/functions/` — bara i genererade `types.ts`. UI:t i `src/components/project/suppliers/` (AddSupplierDialog, SupplierCard, SupplierDetailSheet, ProjectSuppliersTab) visar e-post men skickar inget. Tabellen är alltså en färdig, oanvänd bärare för exakt det som efterfrågas.

**Organisationsupplösning som redan finns:**
- Frontend: `useOrganizationId()` / `getOrganizationId()` (`src/hooks/useOrganizationId.ts`) och `useCurrentOrg()` — båda läser `profiles.organization_id` för inloggad användare.
- DB: `get_user_organization_id(auth.uid())`, används i RLS.
- Backend: transportfunktionerna kör service-role och läser `organization_id` från raden (t.ex. `transport_assignments.organization_id`), inte från anroparen.

**Avsändarkonfiguration som redan finns:** `organization_email_senders` (`organization_id`, `display_name`, `sender_email`, `verified`, `enabled`, timestamps). Endast en rad finns: Frans August → `noreply@fransaugust.se`, `verified=true`, `enabled=true`. Ingen kod läser tabellen idag.

`organizations` har `id`, `name`, `slug` (t.ex. `frans-august`, `niklas-viking-production-ab`, `kocken-och-grisen`, `doomie`), `created_at`, `internal_lager_enabled`. Slugarna är alltså långa/organisationsnamnbaserade — inte de korta kunddomänerna (`viking`, `kockenochgrisen`) som workspace-standarden använder.

**Loggning:** `transport_email_log` (har `organization_id`, `booking_id`, `assignment_id`, `recipient_email`, `subject`, `email_type`).

## 2. Föreslagen minsta säkra implementation

### Avsändarmodell
`module@<org-mail-slug>.e-flow.se`, t.ex. `planning@viking.e-flow.se`, `planning@kockenochgrisen.e-flow.se`.

Modulen (`planning`, senare `lager`) är en konstant i koden per funktion. Domändelen får **aldrig** härledas från `organizations.slug` (den är namnbaserad och skulle ge `niklas-viking-production-ab.e-flow.se`) utan lagras explicit per organisation.

### Databas (en migration)
Utöka `organization_email_senders` istället för att skapa något nytt:
- `mail_domain text` — t.ex. `viking.e-flow.se`
- `domain_verified boolean default false` + `domain_verified_at timestamptz`
- `reply_domain text` — t.ex. `svar.viking.e-flow.se` (kan initialt vara samma som `mail_domain`)
- unik nyckel på `(organization_id)` samt unik på `mail_domain`
- GRANT: `select` till `authenticated`, `all` till `service_role`; RLS: läs endast egen org via `get_user_organization_id(auth.uid())`, skriv endast service_role/admin.

Ingen rad seedas för någon annan organisation än de som verkligen har en verifierad domän. Frans August behåller sin rad (`fransaugust.se` kan ligga kvar som `mail_domain` tills domänen flyttas).

### Delad, fail-closed resolver
Ny fil `supabase/functions/_shared/email/senderIdentity.ts`:

```
resolveSender(supabase, organizationId, module) →
  { from, replyTo, displayName } | throws SenderNotConfiguredError
```
Regler:
1. `organizationId` saknas/null → kasta direkt (ingen uppslagning).
2. Läs `organization_email_senders` för exakt den org-raden.
3. Kräv `enabled = true` **och** `domain_verified = true` **och** `mail_domain` ifylld — annars kasta.
4. Bygg `from = "<display_name> <module@mail_domain>"`.
5. Ingen default, ingen `||`-fallback, ingen global env-avsändare. Frans Augusts rad får aldrig läsas för annan org (uppslagning sker alltid med `.eq('organization_id', orgId)`).

Anropande funktion returnerar HTTP 422 med tydligt felmeddelande ("Organisationen saknar verifierad avsändardomän") och skickar inget mejl.

### Reply-To → rätt organisation + bokning
`replyTo = <thread-token>@<reply_domain>`, där tokenet är `supplier_request_threads.response_token` (finns redan) — t.ex. `r-<uuid>@svar.viking.e-flow.se`. Tokenet är den enda kopplingen som behövs: raden bär både `organization_id` och `booking_id`/`project_id`, precis som transporttokenet gör idag.

Inkommande svar hanteras av en ny funktion `supabase/functions/receive-supplier-reply/index.ts` (Resend inbound webhook, `verify_jwt = false` + delad webhook-signatur i secrets) som:
- parsar tokenet ur `to`-adressen,
- slår upp tråden, och **avvisar** om tråden saknas eller om avsändardomänens org inte matchar trådens `organization_id`,
- skriver `response_message`, `response_name`, `responded_at`, `status`.

För transportmejlen kan samma mönster användas mot `transport_assignments.partner_response_token` när det blir aktuellt; i minsta scope räcker det att transportfunktionerna byter avsändare via resolvern och sätter Reply-To till organisationens `planning@`-adress.

### Filer som ändras
- Ny: `supabase/functions/_shared/email/senderIdentity.ts`
- Ny: `supabase/functions/send-supplier-request/index.ts` (skriver `supplier_request_threads`, skickar via resolvern)
- Ny: `supabase/functions/receive-supplier-reply/index.ts`
- Ändras: `send-transport-request`, `send-transport-cancellation`, `handle-transport-response` — ta bort de tre hårdkodade `from:`-strängarna, ta bort "Frans August Logistik" ur rubrik/footer och logotyp-URL till förmån för `display_name`/org-logotyp, sätt Reply-To.
- Ändras: `supabase/config.toml` — `verify_jwt` för de två nya funktionerna.
- Frontend: knapp "Skicka förfrågan" i `src/components/project/suppliers/SupplierCard.tsx` / `SupplierDetailSheet.tsx` + ny hook `src/hooks/useSupplierRequests.ts`; org-id skickas inte från klienten utan härleds serverside från projektets/bokningens `organization_id`.

### Tester
- Kontraktstest som statiskt förbjuder litteralerna `fransaugust.se` och `Frans August Logistik` i `supabase/functions/**` (samma mönster som befintliga `*.static.test.ts`).
- Enhetstest av `resolveSender`: saknad org → kastar; `verified=false` → kastar; fel org → aldrig annans domän; korrekt rad → `planning@viking.e-flow.se`.
- Test av Reply-To-parsning och cross-org-avvisning i inbound-hanteraren.

### Förutsättning utanför koden
Domänen `viking.e-flow.se` (och `svar.`-subdomänen om separat) måste verifieras hos e-postleverantören med DNS-poster i Loopia innan raden får `domain_verified = true`. Ingen organisation kan skicka innan dess — det är avsett.

## 3. Öppna frågor
1. Ska `mail_domain` sättas manuellt per org (rekommenderas) eller härledas från en ny kort `organizations.mail_slug`?
2. Ska Reply-To gå till en token-adress (spårbart, kräver inbound-webhook) eller till en vanlig `planning@`-brevlåda i första steget?
3. Ska transportmejlen migreras i samma omgång eller ska bara det nya leverantörsflödet byggas på modellen först?
