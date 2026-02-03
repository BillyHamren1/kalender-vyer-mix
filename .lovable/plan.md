
# Plan: Expandera BookingProductsDialog

## Nuvarande begränsningar
- Dialog-bredd: `max-w-lg` (512px)
- Produktlista-höjd: `max-h-48` (192px)
- Behöver scrolla för att se produkter

## Ändringar

### BookingProductsDialog.tsx

| Rad | Nuvarande | Nytt |
|-----|-----------|------|
| 137 | `max-w-lg` | `max-w-3xl` (768px, 50% bredare) |
| 221 | `max-h-48` | `max-h-[400px]` (400px, mer än dubbel höjd) |

### Resultat
- **Bredare dialog**: Mer horisontellt utrymme för produktnamn och priser
- **Högre produktlista**: Visar fler produkter direkt utan att behöva scrolla
- Dialog centreras fortfarande på skärmen och förblir responsiv på mindre skärmar
