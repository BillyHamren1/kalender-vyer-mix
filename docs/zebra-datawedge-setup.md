# Zebra DataWedge — Konfigurationsguide

## Obligatorisk profil-konfiguration

Följande inställningar **måste** vara aktiva på varje Zebra-enhet som kör EventFlow Scanner-appen.

| Inställning | Värde |
|---|---|
| **Intent Output** | `ON` |
| **Intent Action** | `se.eventflow.scanner.SCAN` |
| **Intent Delivery** | `Broadcast intent` |
| **Keystroke Output** | `OFF` |

> ⚠️ Om Keystroke Output är PÅ skickas scandata som tangentbordsinmatning istället för intent-broadcast, vilket gör att appen **inte** tar emot skanningar korrekt.

---

## Steg-för-steg: Konfigurera DataWedge-profil

### 1. Öppna DataWedge
- Gå till **Inställningar → DataWedge** (eller öppna DataWedge-appen direkt)

### 2. Skapa eller redigera profil
- Om en profil redan finns för `se.eventflow.scanner` — redigera den
- Annars: tryck **☰ → New profile**, namnge den t.ex. `EventFlow Scanner`

### 3. Koppla profilen till appen
- Under **Associated Apps**, tryck **+**
- Välj `se.eventflow.scanner` → Activity: `*`

### 4. Konfigurera Intent Output
- Scrolla till **Intent Output**
- Sätt **Enabled** = ✅
- **Intent action**: `se.eventflow.scanner.SCAN`
- **Intent category**: `android.intent.category.DEFAULT`
- **Intent delivery**: `Broadcast intent`

### 5. Stäng av Keystroke Output
- Scrolla till **Keystroke Output**
- Sätt **Enabled** = ❌

### 6. Verifiera
- Öppna EventFlow Scanner-appen
- Skanna en streckkod med hårdvaruknappen
- Scan-räknaren i appen ska öka och produkten markeras

---

## Teknisk referens

Dessa inställningar matchar intent-filtret i:
```
android/app/src/main/java/se/eventflow/scanner/DataWedgePlugin.java
```

Pluginet lyssnar på action `se.eventflow.scanner.SCAN` via `BroadcastReceiver` och vidarebefordrar skanningen till WebView som ett Capacitor-event (`datawedge_scan`).

---

## Felsökning

| Symptom | Trolig orsak |
|---|---|
| Scan-räknaren ökar inte | Keystroke Output är PÅ, eller Intent Output är AV |
| Textfält fylls automatiskt vid scan | Keystroke Output är PÅ — stäng av den |
| Appen tar emot scan men packlistan uppdateras inte | Kontrollera att rätt vy är aktiv (Packlista → Verifiering) |
| Ingen reaktion alls | Profilen är inte kopplad till rätt app-paket |
