
# Plan: Enkel hantering av personalinloggningar

## Sammanfattning
Bygga ut systemet så att administratörer enkelt kan se vilka personalmedlemmar som har konto och snabbt skapa konton - antingen enskilt eller för alla på en gång.

## Nuläge
- Tabellen `staff_accounts` finns redan med kolumnerna: `id`, `staff_id`, `username`, `password_hash`, `created_at`, `updated_at`
- Komponenten `CreateStaffAccountCard` finns på Staff Management-sidan (höger kolumn)
- Idag måste man välja en person i taget från en dropdown och fylla i användarnamn + lösenord manuellt
- Det finns ingen indikation på vilka som redan har konto
- Ingen personal har konto ännu (9 aktiva medlemmar)

## Planerade förbättringar

### 1. Visa kontostatus i personalslistan
Lägg till en visuell indikator på varje personalrad som visar om personen har ett konto eller inte.

**Ändringar i `StaffList.tsx`:**
- Lägg till en ikon (Key/Lock) som visar kontostatus
- Grön check om konto finns, grå/röd om konto saknas

### 2. Förbättra CreateStaffAccountCard
Uppdatera kortet för att visa en lista över personal utan konto och ge möjlighet till:
- Snabbskapa konto med automatiskt genererat användarnamn/lösenord
- Bulk-skapa konton för alla utan konto

**Ändringar i `CreateStaffAccountCard.tsx`:**
- Hämta existerande konton för att filtrera bort personal som redan har konto
- Visa en lista med personal utan konto med "Skapa konto"-knapp bredvid varje
- Lägg till en "Skapa konton för alla"-knapp
- Auto-generera användarnamn baserat på personalens namn (förnamn.efternamn)
- Auto-generera ett säkert temporärt lösenord

### 3. Visa kontolista och hantering
Lägg till en ny sektion som visar alla existerande konton med möjlighet att:
- Se användarnamn
- Återställa lösenord
- Ta bort konto

### 4. Kontosektion på StaffDetail-sidan
Lägg till ett nytt kort på personaldetaljsidan där man kan:
- Se om personen har konto
- Skapa konto direkt
- Återställa lösenord
- Ta bort konto

---

## Tekniska detaljer

### Dataflöde
```text
+----------------------+     +------------------+     +-------------------+
| staff_members        | --> | staff_accounts   | --> | Tidrapporteringsappen |
| (9 aktiva)           |     | (0 konton idag)  |     | (extern app)       |
+----------------------+     +------------------+     +-------------------+
         |                           |
         v                           v
   StaffList.tsx              CreateStaffAccountCard.tsx
   (visa kontostatus)         (skapa konton enkelt)
```

### Nya komponenter/ändringar

**1. `src/components/staff/StaffAccountsPanel.tsx` (NY)**
```
- Lista alla personal med/utan konto
- Snabbknappar för att skapa enskilda konton
- Bulk-knapp: "Skapa konton för alla"
- Visa existerande konton med hanteringsalternativ
```

**2. `src/components/staff/StaffAccountCard.tsx` (NY)**
Kort för StaffDetail-sidan med:
- Kontostatus
- Skapa/hantera konto-funktioner

**3. Uppdateringar i `StaffList.tsx`**
- Hämta `staff_accounts` data
- Visa Key-ikon med status (grön/grå)

**4. Uppdateringar i `StaffDetail.tsx`**
- Lägg till StaffAccountCard i Staff Info-vyn

### Generering av inloggningsuppgifter

**Användarnamn-logik:**
```typescript
// "Billy Hamrén" -> "billy.hamren"
const generateUsername = (name: string) => {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // Ta bort accenter
    .replace(/\s+/g, '.')              // Mellanslag -> punkt
    .replace(/[^a-z.]/g, '');          // Behåll bara a-z och punkt
};
```

**Lösenord-logik:**
```typescript
// Generera 8-teckens säkert lösenord
const generatePassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 8 }, () => 
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
};
```

### Bulk-skapande av konton
```typescript
const createAccountsForAll = async (staffWithoutAccounts: StaffMember[]) => {
  const results = [];
  for (const staff of staffWithoutAccounts) {
    const username = generateUsername(staff.name);
    const password = generatePassword();
    // Skapa konto...
    results.push({ staff: staff.name, username, password });
  }
  // Visa/ladda ner lista med inloggningsuppgifter
  return results;
};
```

### Export av inloggningsuppgifter
När bulk-konton skapas visas en dialog med möjlighet att:
- Kopiera alla inloggningsuppgifter
- Ladda ner som CSV/TXT
- Viktig varning: "Spara dessa uppgifter - lösenorden kan inte visas igen!"

---

## Filer som påverkas

| Fil | Ändring |
|-----|---------|
| `src/components/staff/StaffAccountsPanel.tsx` | NY - Huvudpanel för kontohantering |
| `src/components/staff/StaffAccountCard.tsx` | NY - Kontokort för StaffDetail |
| `src/components/staff/StaffList.tsx` | UPPDATERA - Lägg till kontostatus-ikon |
| `src/pages/StaffDetail.tsx` | UPPDATERA - Lägg till StaffAccountCard |
| `src/pages/StaffManagement.tsx` | UPPDATERA - Ersätt CreateStaffAccountCard med StaffAccountsPanel |
| `src/components/staff/CreateStaffAccountCard.tsx` | ERSÄTTS av StaffAccountsPanel |

---

## Säkerhetsnotering
- Lösenord hashas med Base64 (befintlig implementation) 
- **Rekommendation för framtiden**: Byt till bcrypt via edge function för säkrare hashning
- Genererade lösenord visas endast en gång vid skapande
