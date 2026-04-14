

## Plan: Gör scanner-appen redo för lokal iOS-build

### Problem
`capacitor.scanner.config.ts` innehåller ett `server`-block som pekar på Lovable preview-URL:en. Det gör att appen försöker ladda från internet istället för den lokalt byggda `dist/`-mappen.

### Åtgärd

**Ta bort `server`-blocket från `capacitor.scanner.config.ts`** (rad 14-17):

```typescript
// TA BORT dessa rader:
server: {
  url: 'https://d42a96b9-4d25-4701-b40a-d3fe594418b5.lovableproject.com?forceHideBadge=true',
  cleartext: true,
},
```

Det är den enda ändringen som behövs. Allt annat är redan korrekt:
- `MainViewController.swift` — korrekt med `isInspectable`
- `Main.storyboard` — pekar på `MainViewController`
- `Info.plist` — Scanner-branding överallt
- Build-script (`scripts/build-ios.js`) — fungerar redan
- `.env.scanner` — korrekt

### Efter godkännande — din build-process

```bash
git pull
npm install
npm run ios:scanner
# Öppna sedan Xcode: npx cap open ios
```

