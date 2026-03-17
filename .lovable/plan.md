

# Separata logotyper för Time och Scanner

## Problem
Båda apparna använder generiska Lucide-ikoner (Zap respektive ScanLine) som "logga" på login-skärmen och i laddningsvyer. Det finns ingen tydlig visuell skillnad som säger "det här är Time-appen" vs "det här är Scanner-appen".

## Berörd kod
- **`src/pages/mobile/MobileLogin.tsx`** — Time login: visar `Zap`-ikon i en teal-färgad ruta + texten "EventFlow"
- **`src/pages/scanner/ScannerLogin.tsx`** — Scanner login: visar `ScanLine`-ikon + texten "Scanner"
- **`src/shells/shared/ShellLoadingState.tsx`** — Loading-vy: väljer `Clock` eller `ScanLine` baserat på mode

## Plan

### 1. Skapa en delad `AppLogo`-komponent
En komponent `src/components/shared/AppLogo.tsx` som baserat på `mode` (från `useShell` eller prop) renderar rätt branding:

| App | Ikon | Färg | Titel | Undertitel |
|-----|------|------|-------|------------|
| **Time** | `Clock` (i cirkel) | Teal/primary | EventFlow **Time** | Tidrapportering |
| **Scanner** | `ScanLine` (i cirkel) | Orange/amber | EventFlow **Scanner** | Packlista & skanning |

Olika bakgrundsfärg på ikon-rutan (teal vs orange) ger omedelbar visuell skillnad. Storleken styrs via en `size`-prop (`sm`, `md`, `lg`).

### 2. Uppdatera login-sidorna
- **MobileLogin.tsx**: Byt ut `Zap`-ikonen och hårdkodad text mot `<AppLogo mode="time" size="lg" />`
- **ScannerLogin.tsx**: Byt ut `ScanLine`-ikonen och hårdkodad text mot `<AppLogo mode="scanner" size="lg" />`

### 3. Uppdatera ShellLoadingState
Byt ut den nuvarande ikon-logiken mot `<AppLogo size="md" />` (läser mode från `useShell`).

### Filer som ändras
- **Ny:** `src/components/shared/AppLogo.tsx`
- **Redigeras:** `src/pages/mobile/MobileLogin.tsx`, `src/pages/scanner/ScannerLogin.tsx`, `src/shells/shared/ShellLoadingState.tsx`

