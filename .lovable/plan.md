

# Plan: Lägg till möjlighet att sätta eget lösenord

## Sammanfattning
Lägger till funktionalitet så att administratörer kan sätta ett eget lösenord för personalkonton, istället för att bara generera ett slumpmässigt.

---

## Ändringar

### 1. Uppdatera `StaffAccountCard.tsx`
- **Lägg till ny knapp** "Ändra lösenord" bredvid "Återställ lösenord"
- **Ny dialog** för att mata in eget lösenord med:
  - Lösenordsfält (med möjlighet att visa/dölja)
  - Bekräfta lösenord-fält
  - Bekräfta-knapp
  - Validering att lösenorden matchar och är minst 6 tecken
- **Ny mutation** `setCustomPassword` som uppdaterar lösenordet till det valda värdet

### 2. UI-flöde

```text
┌─────────────────────────────────────────────────────┐
│  Inloggningskonto                                   │
├─────────────────────────────────────────────────────┤
│  ✓ Konto aktivt                                     │
│    Användarnamn: billy.hamren                       │
│                                                     │
│  [Ändra lösenord] [Återställ lösenord] [Ta bort]   │
└─────────────────────────────────────────────────────┘
```

När "Ändra lösenord" klickas öppnas en dialog:

```text
┌──────────────────────────────────────┐
│  Ändra lösenord                      │
├──────────────────────────────────────┤
│  Nytt lösenord:                      │
│  [________________] [👁]             │
│                                      │
│  Bekräfta lösenord:                  │
│  [________________] [👁]             │
│                                      │
│  [Avbryt]           [Spara lösenord] │
└──────────────────────────────────────┘
```

---

## Tekniska detaljer

### Validering
- Minst 6 tecken
- Lösenorden måste matcha
- Visa felmeddelande om validering misslyckas

### Säkerhet
- Lösenordet lagras som Base64-hash (samma som nuvarande implementation)
- Ingen loggning av lösenord till konsolen

### Kod-ändringar i `StaffAccountCard.tsx`
1. Lägg till state för dialog: `showPasswordDialog`
2. Lägg till state för formulär: `newPassword`, `confirmPassword`, `showNewPassword`
3. Ny mutation `setCustomPasswordMutation` som tar emot lösenordet och uppdaterar `password_hash`
4. Ny `Dialog`-komponent med lösenordsfälten och validering

