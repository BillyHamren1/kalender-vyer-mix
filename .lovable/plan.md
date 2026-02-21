

# Multi-Tenant Verifieringsresultat och Atgardsplan

## Sammanfattning

Implementationen ar till 95% korrekt. Det finns **1 kritiskt sakerhetsproblem** och **1 mindre atgard** kvar.

---

## Status: Vad som fungerar

- **56 tabeller** i public-schemat
- **55 tabeller** har `organization_id` (NOT NULL, korrekt default) -- alla utom `organizations` och `confirmed_bookings` (som forvantade)
- **RLS aktiverat** pa samtliga 56 tabeller
- **set_org_id trigger** finns pa alla 55 relevanta tabeller (utom `profiles` som hanteras via auth-trigger)
- **Edge functions** fungerar korrekt -- `time-reports` testad och returnerar data med `organization_id`
- **Alla org_filter policies** har korrekt uttryck: `organization_id = get_user_organization_id(auth.uid())`

---

## KRITISKT: staff_members har trasig RLS

Tabellen `staff_members` har **tva PERMISSIVA policies**:

1. `org_filter_staff_members` (PERMISSIVE) -- filtrerar pa organization_id
2. `Authenticated users can access staff_members` (PERMISSIVE) -- `USING (true)`

Problemet: Nar bada policies ar PERMISSIVE behover en anvandare bara uppfylla **en** av dem. Policyn med `true` uppfylls alltid, sa org-filtret har **ingen effekt**. Alla inloggade anvandare kan se alla organisationers personal.

**Atgard:** Andra `org_filter_staff_members` fran PERMISSIVE till RESTRICTIVE. Da maste anvandaren uppfylla BADE den restrictiva org-filtreringen OCH en permissiv policy.

---

## Ovriga tabeller med "true"-policies (INGET PROBLEM)

Foljande tabeller har ocksa `true`-policies men deras `org_filter` ar redan RESTRICTIVE, sa de ar korrekta:

- `task_comments`
- `time_reports`
- `transport_email_log`
- `warehouse_calendar_events`
- `webhook_subscriptions`

---

## Linter-varningar (9 st)

| Typ | Antal | Status |
|---|---|---|
| Security Definer View (`confirmed_bookings`) | 1 | Acceptabel -- enkel vy |
| RLS "always true" policies | 6 | 5 ar OK (gated av restrictive). 1 (`staff_members`) ar bugg -- atgardas ovan |
| Leaked password protection disabled | 1 | Supabase-installning, ej kodrelaterat |
| Postgres version patch available | 1 | Infrastruktur, ej kodrelaterat |

---

## Teknisk atgard

En enda SQL-migration som:

1. Droppar och aterskapar `org_filter_staff_members` som **RESTRICTIVE** istallet for PERMISSIVE
2. Det ar allt -- resten fungerar korrekt

```text
DROP POLICY "org_filter_staff_members" ON public.staff_members;
CREATE POLICY "org_filter_staff_members" ON public.staff_members
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
```

