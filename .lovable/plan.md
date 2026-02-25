

## Personlig bekräftelsefråga med inloggad användares förnamn

### Vad ändras

Bekräftelsedialogen ska visa: **"Har du [Förnamn] säkerställt att allt i listan är packat?"**

### Teknisk approach

I `ManualChecklistView.tsx`:

1. **Importera `useAuth`** och hämta `user` för att komma åt e-postadressen.
2. **Hämta staff-namn från `staff_members`-tabellen** via en enkel query (`select name where email = user.email`). Extrahera förnamnet (första ordet i `name`).
3. **Uppdatera `description`-texten** i `ConfirmationDialog` till:
   ```
   `Har du ${firstName} säkerställt att allt i listan är packat?`
   ```

Fallback om namn saknas: visa bara "Har du säkerställt..." som idag.

### Ändring

```tsx
// Nytt state + effect
const { user } = useAuth();
const [staffFirstName, setStaffFirstName] = useState<string>('');

useEffect(() => {
  if (!user?.email) return;
  supabase.from('staff_members').select('name').eq('email', user.email).maybeSingle()
    .then(({ data }) => {
      if (data?.name) setStaffFirstName(data.name.split(' ')[0]);
    });
}, [user?.email]);

// I dialogen (rad 480)
description={`Har du ${staffFirstName} säkerställt att allt i listan är packat?`}
```

