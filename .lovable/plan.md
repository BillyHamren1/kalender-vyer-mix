

## Problem: Bekräftad bokning syns inte på /projects

### Orsak

När du bekräftar en bokning i `StatusChangeForm` invalideras bara dessa query-nycklar:
- `['booking', bookingId]`
- `['bookings']`

Men listan "Nya bokningar" på /projects-sidan använder query-nyckeln `['bookings-without-project']`, som **inte invalideras**. Därför visar den cachad gammal data och den nybekräftade bokningen dyker inte upp förrän cachen löper ut eller sidan laddas om helt.

### Fix

**En ändring i en fil:**

| Fil | Ändring |
|-----|---------|
| `src/components/booking/StatusChangeForm.tsx` | Lägg till `queryClient.invalidateQueries({ queryKey: ['bookings-without-project'] })` i `finally`-blocket (rad ~127) |

Detta säkerställer att "Nya bokningar"-listan på /projects uppdateras direkt efter statusändring, oavsett om det är bekräftelse, avbokning eller annat.

