# Rätta produktlistan i Projektinfo

## Resultat
Projektvyn ska visa samma nivå som bokningen: huvudprodukter och verkliga tillbehör. Innehållet som packats upp ur ett paket ska inte visas i Planning.

## Ändringar
1. Skilj tydligt mellan:
   - **Paketmedlem**: rad markerad med `is_package_component`, `parent_package_id` eller paketprefixet `--`.
   - **Tillbehör**: kopplad rad med tillbehörsprefix som `↳`, `└` eller `L,`, även när den har `parent_product_id`.
2. Filtrera bort paketmedlemmar helt från Projektinfos renderlista, inklusive föräldralösa paketmedlemmar.
3. Behåll tillbehör synliga och indragna under rätt huvudprodukt.
4. Rendera ingen informationsbadge med texten **Paketdel**.
5. Låt summeringen använda samma synliga rader, utan att räkna dolda paketmedlemmar.

## Avgränsning
- Endast presentationen i Planning/Projektinfo ändras.
- Ingen databas-, import-, Booking-, Lager-, WMS-, scanner- eller packningslogik ändras.
- Inga rader raderas eller skrivs om.

## Tester och kontroll
- Uppdatera kontraktstester så att paketmedlemmar alltid döljs, medan `↳`/`└`/`L,`-tillbehör visas.
- Lås att texten **Paketdel** inte längre renderas.
- Kör riktade Vitest-tester och därefter projektets automatiska tester.
- Kontrollera Projektinfo visuellt i preview: huvudprodukt + tillbehör, inga uppackade paketdelar och ingen Paketdel-badge.
