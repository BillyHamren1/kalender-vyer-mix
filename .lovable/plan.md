

## Plan: Fullskärms aktivitetsplanerare

### Vad byggs

Ersätter den lilla `AddEstablishmentTaskDialog` med en fullskärms-dialog ("sheet") som ger komplett översikt och stegvis arbetsflöde:

1. **Vänster panel** — Produktlista med parent/child-hierarki (tillbehör grupperade under sin förälder). Checkboxar för flerval. Redan planerade produkter visas överstrukna.
2. **Höger panel** — Inställningar: datum, tid, personal, kategori, prioritet. Gäller alla valda produkter.
3. **"Skapa aktiviteter"**-knapp skapar en task per vald produkt, markerar dem som planerade, och listan uppdateras med överstrykning.

```text
┌──────────────────────────────────────────────────────────┐
│  Planera aktiviteter                              [Stäng]│
├─────────────────────────────┬────────────────────────────┤
│  Produktlista               │  Inställningar             │
│                             │                            │
│  ☐ Tält 10x20        x1    │  Startdatum  [2026-04-01]  │
│    ☐ Vägg 10m        x4    │  Slutdatum   [2026-04-01]  │
│    ☐ Golv 10x20      x1    │  Starttid    [08:00]       │
│  ☑̶ ̶P̶o̶d̶i̶u̶m̶ ̶2̶x̶3̶  (planerad)│  Sluttid     [16:00]       │
│  ☐ Belysningspaket   x1    │  Kategori    [Installation]│
│    ☐ Spotlight       x10   │  Prioritet   [Medium]      │
│                             │  Personal    [Välj...]     │
│                             │                            │
│                             │  [Skapa 2 aktiviteter]     │
├─────────────────────────────┴────────────────────────────┤
│  + Lägg till manuell aktivitet (fritext)                 │
└──────────────────────────────────────────────────────────┘
```

### Tekniska ändringar

**Fil: `src/components/project/AddEstablishmentTaskDialog.tsx`** — Komplett omskrivning:

- Byt `Dialog` mot `Sheet` (side="bottom" eller custom fullscreen dialog) med `max-w-5xl w-full h-[90vh]`.
- Hämta redan skapade tasks (via `source_product_id`) för att avgöra vilka produkter som redan planerats (överstrukna).
- Produktlistan renderas hierarkiskt: huvudprodukter med sina `isPackageComponent`/`parentPackageId`-barn indenterade under. Checkbox per rad.
- State: `selectedProductIds: Set<string>`, gemensamma datum/tid/personal/kategori/prioritet.
- Vid "Skapa": loopa igenom valda produkter, anropa `createEstablishmentTask` per produkt, uppdatera "planerade"-listan.
- Behåll manuell fritext-sektion längst ned.

**Fil: `src/components/project/EstablishmentGanttChart.tsx`** — Inga strukturella ändringar, propsen är redan korrekta.

**Ingen databasändring krävs** — `establishment_tasks` har redan `source_product_id` för att spåra planerade produkter.

