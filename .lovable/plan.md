
## Öppna "Projektekonomi"-knappen i iframe-dialog

### Vad som ska göras

När användaren klickar på "Projektekonomi"-knappen i projektets ekonomiflik ska en modal/dialog öppnas med en inbäddad iframe som laddar:

```
https://eventflow-booking.lovable.app/embed-app/booking/{bookingId}/costs?token={jwt}
```

Där `{bookingId}` är projektets kopplade bokning och `{jwt}` är användarens aktuella Supabase-sessionstoken (för autentisering mot den externa appen).

### Var knappen finns

Knappen "Projektekonomi" i navigationen (`ProjectLayout.tsx`) är en **nav-länk**, inte en knapp. Det är troligen en annan "Projektekonomi"-knapp som visas inne i ekonomisidan. Baserat på skärmbilden är det en teal-färgad knapp — den finns troligen i `ProjectEconomyTab.tsx` eller i en sidebar/header på projektsidan.

Implementationen görs direkt i `ProjectEconomyTab.tsx` bredvid exportknappen, alternativt som en ny knapp i toppen av ekonomisidan.

### Teknisk implementation

**Fil att ändra:** `src/components/project/ProjectEconomyTab.tsx`

**Steg:**

1. **Hämta JWT-token** via `supabase.auth.getSession()` — returnerar `session.access_token` som är den JWT som skickas som `?token=`-param.

2. **Lägg till state** för om iframe-dialogen är öppen:
   ```tsx
   const [iframeOpen, setIframeOpen] = useState(false);
   const [jwt, setJwt] = useState<string | null>(null);
   ```

3. **Hämta token** när knappen klickas:
   ```tsx
   const handleOpenIframe = async () => {
     const { data } = await supabase.auth.getSession();
     setJwt(data.session?.access_token || null);
     setIframeOpen(true);
   };
   ```

4. **Bygg URL:en:**
   ```tsx
   const iframeUrl = bookingId && jwt
     ? `https://eventflow-booking.lovable.app/embed-app/booking/${bookingId}/costs?token=${jwt}`
     : null;
   ```

5. **Rendera en Dialog** (Radix UI, redan tillgänglig) med en iframe inuti:
   ```tsx
   <Dialog open={iframeOpen} onOpenChange={setIframeOpen}>
     <DialogContent className="max-w-5xl h-[85vh] p-0">
       {iframeUrl ? (
         <iframe
           src={iframeUrl}
           className="w-full h-full rounded-lg border-0"
           title="Projektekonomi"
         />
       ) : (
         <p>Saknar bokning eller session</p>
       )}
     </DialogContent>
   </Dialog>
   ```

6. **Knappen** läggs till bredvid exportknappen i toppen av `ProjectEconomyTab`:
   ```tsx
   <Button onClick={handleOpenIframe} className="...teal-stil...">
     <Wallet className="h-4 w-4 mr-2" />
     Projektekonomi
   </Button>
   ```

### Filer att ändra

| Fil | Ändring |
|-----|---------|
| `src/components/project/ProjectEconomyTab.tsx` | Lägg till knapp, JWT-hämtning och iframe-dialog |

Inga nya filer behöver skapas — Radix Dialog är redan installerat och Supabase-klienten finns redan importerad i projektet.
