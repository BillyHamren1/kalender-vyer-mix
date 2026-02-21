

# Plan: Uppdatera Edge Functions + Testa Multi-Tenant

## Oversikt

Alla databastabeller har nu `organization_id`, men flera edge functions och 11 tabeller saknar fortfarande stod. Har ar de prompter du behover skicka for att slutfora och verifiera implementationen.

---

## Prompt A -- Lagg till organization_id pa resterande tabeller

Foljande 11 tabeller saknar `organization_id`:

- `time_reports`
- `transport_assignments`
- `transport_email_log`
- `vehicles`
- `vehicle_gps_history`
- `warehouse_calendar_events`
- `webhook_subscriptions`
- `sync_state`
- `task_comments`
- `user_roles` (special -- kopplade till auth, kan behova annorlunda hantering)
- `confirmed_bookings` (enkel tabell med bara `id`)

**Prompt att skicka:**

> Lagg till kolumnen organization_id (uuid, REFERENCES organizations(id)) pa foljande tabeller: time_reports, transport_assignments, transport_email_log, vehicles, vehicle_gps_history, warehouse_calendar_events, webhook_subscriptions, sync_state, task_comments. Populera befintliga rader med Frans August-organisationens ID, satt NOT NULL, och skriv RLS-policies som filtrerar pa organization_id. For tabellerna user_roles och confirmed_bookings -- analysera om de behover organization_id eller inte och motivera.

---

## Prompt B -- Uppdatera edge functions med explicit organization_id

Foljande edge functions anvander service_role_key och gor INSERT utan att satta organization_id explicit:

| Edge Function | INSERT-tabeller som paverkas |
|---|---|
| `mobile-app-api` | time_reports, project_purchases, project_comments, project_files |
| `receive-invoice` | project_invoices, packing_invoices |
| `save-map-snapshot` | booking_attachments |
| `staff-management` | staff_members, staff_assignments, booking_staff_assignments |
| `time-reports` | time_reports |
| `handle-transport-response` | transport_email_log |
| `receive-user-sync` | user_roles (via service_role) |
| `verify-sso-token` | user_roles (via service_role) |
| `track-vehicle-gps` | vehicle_gps_history, transport_assignments (UPDATE) |

**Prompt att skicka:**

> Uppdatera foljande edge functions sa att alla INSERT-operationer sattar organization_id explicit. Anvand samma monster som import-bookings (resolveOrganizationId). Edge functions att uppdatera: mobile-app-api, receive-invoice, save-map-snapshot, staff-management, time-reports, handle-transport-response, track-vehicle-gps. For mobile-app-api: lagg till resolveOrganizationId och anvand det i handleCreateTimeReport, handleCreatePurchase, handleCreateComment, handleUploadFile. For receive-invoice: satt organization_id vid insert i project_invoices och packing_invoices. For save-map-snapshot: satt organization_id vid insert i booking_attachments. For staff-management: satt organization_id i alla insert-operationer for staff_members, staff_assignments och booking_staff_assignments. For time-reports: satt organization_id vid insert/update av time_reports.

---

## Prompt C -- Verifiera allt end-to-end

> Gor en fullstandig verifiering av multi-tenant-implementationen:
> 1. Kora en SQL-fraga som listar alla tabeller i public-schemat och visar vilka som har/saknar organization_id
> 2. Kontrollera att RLS ar aktiverat pa ALLA tabeller med organization_id  
> 3. Kontrollera att set_org_id-triggern finns pa alla relevanta tabeller
> 4. Testa att mobile-app-api login-flodet fungerar (anropa edge function med curl)
> 5. Testa att import-bookings fungerar med organization_id (anropa edge function)
> 6. Kontrollera att inga edge functions gor INSERT utan organization_id mot tabeller som kraver det
> 7. Kor database linter och rapportera resultatet

---

## Sammanfattning av ordning

1. **Prompt A** -- Schema: Lagg till organization_id pa de 9-11 aterstaende tabellerna
2. **Prompt B** -- Kod: Uppdatera alla edge functions med explicit organization_id
3. **Prompt C** -- Test: Verifiera hela implementationen end-to-end

