# EventFlow gemensam designstandard — beslutad 2026-10-18

Status: BINDANDE för ALLA EventFlow-produktens interna moduler och appytor — Sales, Operations/Planning, WMS, Inventory, Finance, Catering, HUB, Time, Scanner och Brain webb/native-app (utrullning uttryckligen godkänd av Billy 2026-10-18). Gäller inte kundhemsidor eller separata produkter (NEXXTSHIFT/SamFam). Detta dokument ersätter äldre modulspecifika UI-standarder (docs/ui/PLANNING_UI_STANDARD.md, docs/ui/WAREHOUSE_UI_STANDARD.md) där de strider mot denna standard.

## Färger

- EN gemensam accent i alla moduler: teal `#1F747A` (`hsl(183.956 59.4771% 30%)`); djup teal `#156065` (`hsl(183.75 65.5738% 23.9216%)`) för mörkare tillstånd och diskret primärknappsgradient.
- Sales blå och Operations lila är inte längre egna modulaccenter. Modulidentifiering sker med namn, enkla konsekventa linjeikoner och aktiv navigationsmarkering.
- Rubriker och huvudtext: neutralt nära svart `#202223` (`hsl(200 4.4776% 13.1373%)`). Sekundärtext/metadata: mörkgrå `#62666A` (`hsl(210 3.9216% 40%)`). Ljusare grå endast för placeholder/inaktivt innehåll med bibehållen läsbarhet. Teal är accent, aldrig generell textfärg.
- Sval ljus bakgrund (canvas): `#EDF1F3`. Vita arbetsytor: `#FFFFFF`.
- Primäråtgärd: `--action` = `#1F747A`, `--action-end` = `#156065`, subtil vertikal gradient endast på huvudåtgärd. Ingen glow, ingen leksakslik 3D, inga kraftiga skuggor eller metalliska effekter.
- Statusfärger (fel/varning/klart) hålls semantiskt åtskilda från accenten och konsekventa över moduler. Meningsbärande diagramserier och kalenderfärger (fas-/status-/resursfärger) bevaras — inga blinda färgersättningar.

## Sidebar

- Exakt vit `#FFFFFF`, text/ikoner `#202223`, tunn neutral kant mot innehållet, diskret/ingen skugga.
- 240 px utfälld / 64 px kollapsad på desktop, menyrader 44 px. Integrerad kollapsknapp ("Dölj meny"/"Visa meny") i botten.
- Aktiv sida: svagt tealfärgad bakgrund (ca 7 %), tydligare text och smal tealmarkering till vänster.
- Samma typografi, indrag, ikonstorlek, placering och beteende i alla moduler. Undermenyer under huvudpunkt med tydligt indrag. Tillgängliga etiketter och tooltips bevaras vid kollaps.
- Modulernas startsida benämns "Översikt" i navigationen, utan ändrade URL:er eller affärsflöden.

## Formulär

- Skrivfält och formulärytor i ljust läge är helt vita `#FFFFFF`: textfält, textarea, sökfält, numeriska inmatningar, redigerbara tabellceller och select-triggers. Redigerings-/formulärpaneler är vita, inte gråtonade.
- Skilj dem från canvas `#EDF1F3` med diskret kant; behåll tydlig teal fokusmarkering.
- Bevara semantiska statusmarkeringar, validering samt läsbara disabled/read-only- och dark-mode-tillstånd.

## Mobila barer (Time, Scanner, WMS-mobil, Brain-appen)

- Topp- och bottenbarer i mobila skal är samma svarta bar som HUB:s globala modulbar: solid nära-svart `hsl(210 6% 8%)`, ingen gradient, ingen blur, ingen egen teal-topp.
- Aktiva etiketter: vitt `#FFFFFF`. Aktiv ikon och indikator: ljusare teal `#4DC3CB` (`hsl(184 55% 55%)`, HUB `--ef-teal-bright` / `--module-bright`) — bastealen `#1F747A` når bara ≈3,8:1 på svart och försvinner; den ljusare varianten når ≈9:1 (HUB-rättning abab70a). Teal används endast som grafik/indikator på svart, aldrig liten text. Inaktiva: krispigt nära-vitt `hsl(210 10% 88%)` (HUB `--ef-topbar-muted`, ≈14:1 på svart).
- Ljusa ytor påverkas inte: primärknappar och element på ljus canvas behåller bastealen `#1F747A` / `#156065` och formulärfälten förblir helvita `#FFFFFF`.
- Innehåll och formulärfält förblir vita; varnings-/statusfärger (t.ex. oläst-badge) och dark mode bevaras.
- Delade tokens: `src/lib/layout/mobileBars.ts` (`MOBILE_BAR`, `mobileTopBarStyle`, `mobileBottomBarStyle`) — låst av `src/__tests__/mobileBars.test.ts`.

## Typografi

- Sammanfattningsetiketter cirka 12–13 px, normal bokstavstäthet; huvudvärden cirka 22–24 px semibold. Sidrubrik cirka 26–28 px; vanlig information cirka 14–16 px.
- Etikett ovanför värde; saknade värden normalviktiga och mindre framträdande (diskret "—", aldrig knallrött eller fabricerad nolla).

## Implementation

- Samma delade tokens genom alla CSS-lager: `src/index.css` (bas), `src/styles/module-accents.css` (ruttscoped accent via `html[data-module]`), `src/styles/planning.css` (`.theme-purple`-ytor), `src/styles/operations-surfaces.css` (arbetsytor).
- Modulpaletten låses i `src/lib/layout/moduleAccents.ts` och testas av `src/__tests__/moduleAccents.test.ts`.
- Projektdokument och komponenter får inte återinföra gamla modulpaletter.
- Stiländringar får aldrig ändra skarp data, statusägarskap, priser, bemanning, WMS/Booking-kontrakt, auth eller rollkontroll.

## Utrullning

Billy har uttryckligen godkänt utrullning i alla interna EventFlow-moduler, inklusive Time, Scanner och Brain-appen. Implementera gemensamma tokens och komponenter i respektive kanoniskt Git-repo. Lovable behövs endast för preview eller publicering när det är relevant. En webbpublicering uppdaterar inte en redan installerad app med bundlad webbversion; den kräver ett nytt native-bygge. Ändra inte Time-produktionsappens aktivering eller datakälla i en designbatch.
