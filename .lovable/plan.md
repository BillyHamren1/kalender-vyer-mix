

# Fix: Loggan syns inte i mejlen

## Problem
Logotypen visas inte i mejlen trots att filen finns i Supabase Storage. Tre saker har identifierats:

1. **Fallback-texten ar gomd** -- Den text som lades till som "fallback" har `display:none; max-height:0; overflow:hidden` och syns ALDRIG. Den ar helt vardeloss som backup.
2. **Logofilen kan vara feluppladdad** -- Filen finns i bucketen (131KB, PNG) men vi vet inte om det faktiskt ar ratt bild eller om den laddades upp korrekt.
3. **Ingen synlig ersattning** -- Om bilden inte laddar ser anvandaren bara en tom vit yta.

## Losning

### Steg 1: Ladda upp loggan pa nytt
Filen `public/images/fransaugust-logo.png` finns i projektet. Den ska laddas upp till email-assets-bucketen pa nytt for att sakerstalla att ratt fil ligger dar.

### Steg 2: Ersatt gomd fallback med synlig text
Istallet for den gommda div:en, lagg till en synlig textbaserad fallback som visas BREDVID (eller ISTALLET FOR) bilden. Tekniken anvander `alt`-text med styling + en VML-fallback (for Outlook) och en synlig `<span>` som backup.

### Steg 3: Gor loggan till en synlig text-fallback
Om bilden inte laddas ska det sta "Frans August" i mork text, tydligt och lika stort som loggan.

## Tekniska detaljer

### Ny logo-HTML (ersatter nuvarande i alla 3 filer)

Nuvarande (trasig):
```html
<img src="...fransaugust-logo.png" alt="Frans August" width="150" height="36"
     style="height:36px;width:150px;display:block;border:0;" />
<!--[if !mso]><!-->
<div style="font-size:0;line-height:0;display:none;max-height:0;overflow:hidden;">
  Frans August Logistik
</div>
<!--<![endif]-->
```

Ny (fungerar alltid):
```html
<img src="...fransaugust-logo.png" alt="Frans August"
     width="150" style="max-width:150px;display:block;border:0;"
     onerror="this.style.display='none';this.nextElementSibling.style.display='block';" />
<p style="display:none;margin:0;font-size:18px;font-weight:700;color:#1a3a3c;letter-spacing:-0.5px;">
  Frans August
</p>
```

Forandringarna:
- Tar bort `height="36"` och `height:36px` -- lat bilden skala naturligt
- Tar bort den gommda `div`-fallbacken helt
- Lagger till `onerror`-handler som gommer bilden och visar texten
- Lagger till en text-fallback `<p>` med `display:none` som visas av onerror

### Filer som andras
- `supabase/functions/send-transport-request/index.ts` -- Ny logo-HTML
- `supabase/functions/send-transport-cancellation/index.ts` -- Ny logo-HTML
- `supabase/functions/handle-transport-response/index.ts` -- Ny logo-HTML (LOGO_URL konstant + alla mallar)

### Ovrigt
- Ladda upp `public/images/fransaugust-logo.png` till email-assets bucket pa nytt
- Deploya alla tre edge functions

