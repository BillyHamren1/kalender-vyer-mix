# Ändringar från bokning → packlista med kvittens vid kort varsel

## Problemet idag

När en bokning ändras efter att packningen startat fryses packlistan helt: `sync-booking-to-packing` upptäcker avvikelsen, sätter bara `needs_packing_review = true` med orsaken "booking_changed_after_packing_started" och lämnar packraderna orörda. Kontrollen visar då bara "Artikel som inte längre finns i bokningen" utan att säga vilken artikel, och packlistan blir aldrig rätt. Det är exakt det scenariot i skärmbilden.

## Nytt flöde

Två spår, styrt av hur nära riggdagen ligger (gräns: 14 dagar).

```text
Bokning ändras
      |
      v
sync-booking-to-packing beräknar diff (nya rader / borttagna rader / ändrat antal)
      |
      +-- Packning i "Planering"  -> tillämpas direkt som idag (inget brus)
      |
      +-- Packning startad
             |
             +-- >= 14 dagar till rigg  -> ändringen köas som "vanlig", tillämpas
             |                              tyst nästa gång listan är i planering,
             |                              visas som liten notis. Blockerar inget.
             |
             +--  < 14 dagar till rigg  -> KORT VARSEL:
                    1. Varje ändring sparas som en rad med artikelnamn, SKU,
                       gammalt/nytt antal och typ (tillagd/borttagen/antal).
                    2. Packningen markeras blockerad: kontroll och signering
                       går inte att slutföra förrän ändringarna är kvitterade.
                    3. Lager ser en röd panel högst upp på packlistan med
                       varje ändring uppradad, inte en generisk text.
                    4. Lager klickar "Ta emot ändring" per rad (eller
                       "Ta emot alla"). Först DÅ skrivs ändringen in i
                       packlistan — rad läggs till, tas bort eller får nytt antal.
                    5. Kvittensen loggas med vem och när.
```

Kärnregeln: vid kort varsel ändras packlistan aldrig bakom ryggen på lagret, men den kan heller inte lämnas ofullständig — arbetet är blockerat tills lagret har tagit emot ändringen, och efter kvittens är listan garanterat i synk med bokningen.

## Vad lagret ser

Röd panel på packlistan (ersätter dagens intetsägande "1 blockerande avvikelse"):

```text
KORT VARSEL – 3 dagar till rigg. Bokningen har ändrats.
Packlistan uppdateras när du tagit emot ändringarna.

- Borttagen:  F10 - 10x5/300 (1 st)          [Ta emot]
- Tillagd:    F8 - 8x5/300 (1 st)            [Ta emot]
- Antal:      Uniflex 15x10  4 st -> 6 st    [Ta emot]

[Ta emot alla ändringar]
```

Samma ändringar syns även som en gul markering direkt på berörd rad i packlistan efter kvittens ("Ändrad idag"), så att den som packar ser vad som är nytt.

## Teknisk genomförande

**Databas (migration)**
- Ny tabell `packing_change_requests`: `packing_id`, `booking_id`, `booking_product_id`, `change_type` (`item_added` | `item_removed` | `quantity_changed`), `product_name`, `sku`, `old_quantity`, `new_quantity`, `urgency` (`short_notice` | `normal`), `days_until_rig`, `status` (`pending` | `applied` | `dismissed`), `acknowledged_by`, `acknowledged_at`, `organization_id`, tidsstämplar. GRANT till `authenticated` (läs/skriv) + `service_role`, RLS per `organization_id`, unik nyckel på (`packing_id`, `booking_product_id`, `change_type`, `status='pending'`) så samma ändring inte köas dubbelt.
- `packing_projects`: `blocked_by_short_notice_change boolean default false`.

**Edge function `sync-booking-to-packing`**
- I den frysta grenen: i stället för att bara sätta `needs_packing_review`, bygg diffen (`newItems`, `orphanedItems`, `quantityDrift`) till `packing_change_requests` med produktnamn/SKU hämtade från `booking_products`.
- Urgency beräknas mot `bookings.rigdaydate` (fallback `eventdate`) med samma 14-dagarsgräns; återanvänder mönstret i `src/lib/notifications/shortNoticeBooking.ts` (dagens `SHORT_NOTICE_DAYS = 7` lämnas orörd — packning får egen konstant 14).
- Vid `short_notice` sätts även `blocked_by_short_notice_change = true`.
- Idempotent: befintlig pending-rad uppdateras i stället för att dubbleras; om bokningen ändras tillbaka stängs raden som `dismissed`.

**Ny edge function `apply-packing-change-request`**
- Tar `change_request_id[]` + kvitterande användare, applicerar ändringen på `packing_list_items` med service role (insert / delete / uppdatera `quantity_to_pack`), sätter `status='applied'`, och rensar `blocked_by_short_notice_change` + `needs_packing_review` när inga pending short_notice-rader återstår.
- Skydd: en rad som redan är packad (`quantity_packed > 0`) tas inte bort tyst — den markeras "ska returneras till lager" i kvittensen och kräver bekräftelse.

**Frontend**
- Ny `src/components/packing/PackingChangeRequestsPanel.tsx` (röd panel + per-rad "Ta emot") som monteras överst i packlistvyn för `/warehouse/packing/:id`.
- Ny hook `src/hooks/usePackingChangeRequests.ts` med realtime på `packing_change_requests`.
- Kontroll-/signeringsknapparna disablas när `blocked_by_short_notice_change` är sant, med tydlig text om varför.
- Lageröversikten och "Kräver åtgärd"-listan (`PackingChangedList`) visar antal kort varsel-ändringar med röd markering före övriga.

**Test**
- Vitest-svit `src/__tests__/packingChangeRequests.test.ts`: diffberäkning, 14-dagarsgränsen (13 vs 15 dagar), idempotens, och att applicering ger packlista identisk med bokningens packbara rader.
