

## Problem: Time-appen får Scanner-ikonen

### Orsak

Ditt byggflöde:
1. `npm run build:time` — bygger frontend (korrekt)
2. `npx cap sync ios` — synkar till iOS (korrekt)

Men **ikongenerering saknas**. Skriptet `generate-icons.js` körs aldrig, så vilken ikon som senast genererades (scanner) ligger kvar i `ios/App/App/Assets.xcassets/`.

### Lösning

Lägg till ett `build:ios:time`-skript i `package.json` som automatiskt genererar ikoner som del av byggflödet:

```json
"build:ios:time": "npm run build:time && npm run generate-icons:time && npx cap sync ios",
"build:ios:scanner": "npm run build:scanner && npm run generate-icons:scanner && npx cap sync ios"
```

Då räcker det att köra:
```
npm install
npm run build:ios:time
npx cap open ios
```

### Filer som ändras
- `package.json` — lägg till de två nya skripten

