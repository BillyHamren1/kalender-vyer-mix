

## Fix: Saknade platsbehörighetsnycklar i Info.plist

Apple kräver `NSLocationWhenInUseUsageDescription` och `NSLocationAlwaysAndWhenInUseUsageDescription` eftersom appen använder `@capacitor/geolocation`. Dessa saknas i båda Capacitor-konfigurationerna.

### Åtgärd

Lägg till de två nycklarna i `ios.infoPlist` i:
- `capacitor.scanner.config.ts`
- `capacitor.time.config.ts`

Samt i `ios/App/App/Info.plist` (för redan genererad iOS-projekt).

Texterna förklarar varför appen behöver GPS — krävs av App Store Review.

