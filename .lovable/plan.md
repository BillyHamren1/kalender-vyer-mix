

## Plan: En aktivitet per urval (inte per produkt)

### Problem
Nu skapas en separat aktivitet per vald produkt. Användaren vill att alla valda produkter slås ihop till **en enda aktivitet**.

### Ändring

**Fil: `src/components/project/ActivityPlannerSheet.tsx`** — Ändra `handleBatchCreate` (rad 178-216):

- Istället för att loopa och skapa en task per produkt, skapa **en enda task** med en sammanfattad titel av alla valda produkter (t.ex. "K 3x3, K Ben x4, K Takduk 3x3, ...").
- Alla valda produkters ID:n sparas som `source_product_id` — men eftersom fältet bara tar ett värde, lagra det första produktens ID och sätt alla som "planerade" i UI:t.
- Alternativt: titeln blir en kommaseparerad lista, och varje vald produkts ID markeras som planerad lokalt.

**Konkret:**
- Samla alla valda produktnamn till en titel-sträng.
- Anropa `createEstablishmentTask` **en gång**.
- Markera alla valda produkter som planerade efteråt.
- Uppdatera knapp-texten: "Skapa aktivitet" (singular, utan antal).

