

# Flytta sidebar sub-menyer till vänster

## Problem
Sub-menyerna (som "Projekt", "Personal" under "Ekonomiöversikt") har för stor vänstermarginal (`ml-11` = 44px) vilket gör att de ser centrerade/indenterade ut istället för vänsterjusterade.

## Lösning
Minska margin-left på sub-items-containern från `ml-11` till `ml-6` (24px) för att texten ska hamna mer till vänster, men fortfarande visa att det är undermenyer.

## Teknisk ändring

**Fil:** `src/components/Sidebar3D.tsx`

**Rad 201:** Ändra från:
```tsx
<div className="ml-11 mt-1 space-y-1">
```

Till:
```tsx
<div className="ml-6 mt-1 space-y-1">
```

## Visuellt resultat
```text
Före:                          Efter:
📊 Ekonomiöversikt             📊 Ekonomiöversikt
         Projekt                   Projekt
         Personal                  Personal
         Personalekonomi           Personalekonomi
```

