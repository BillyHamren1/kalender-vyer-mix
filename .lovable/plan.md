
# Fix: Logga saknas och vitt mellanrum i mejlhuvudet

## Problem
1. **Loggan visas inte** -- Mejlet laddar loggan fran `https://kalender-vyer-mix.lovable.app/images/fransaugust-logo.png`. Denna URL fungerar bara om appen ar publicerad med den senaste koden. Loggan laddades aldrig upp till `email-assets`-bucketen i Supabase Storage, sa den ar beroende av att hela webbappen publiceras forst.
2. **Stort vitt mellanrum** -- Mellan referensraden (overst) och halsningstexten ("Hej ...") finns det for mycket padding. Teal-headern har `padding:20px 40px` och halsningstexten har `padding:16px 40px 0`, men sammanlagt med border och spacing blir det ovantat mycket tom yta.

## Losning

### 1. Ladda upp loggan till Supabase Storage
Ladda upp `public/images/fransaugust-logo.png` till `email-assets`-bucketen i Supabase Storage. Detta ger en permanent publik URL som alltid fungerar, oberoende av om appen publiceras eller ej.

Ny URL-format:
```
https://<project-ref>.supabase.co/storage/v1/object/public/email-assets/fransaugust-logo.png?v=1
```

### 2. Uppdatera bada mejlmallar med ny logo-URL
Byt logo-URL:en i bade `send-transport-request` och `send-transport-cancellation` fran den publika app-URL:en till Supabase Storage-URL:en.

### 3. Minska vitt utrymme
- Minska padding pa teal-headern fran `20px 40px` till `16px 40px`
- Minska padding pa halsningsraden fran `16px 40px 0` till `12px 40px 0`
- Minska margin pa halsningsradstexten

## Tekniska detaljer

### Filer som andras
- `supabase/functions/send-transport-request/index.ts` -- ny logo-URL + padding-justeringar
- `supabase/functions/send-transport-cancellation/index.ts` -- ny logo-URL + padding-justeringar

### Logo-upload
Anvander storage-upload-verktyget for att ladda upp `public/images/fransaugust-logo.png` till bucketen `email-assets`.

### HTML-andringar (bada mallar)

**Logo-rad (rad ~335 i request, ~81 i cancellation):**
```html
<!-- Fran -->
<img src="https://kalender-vyer-mix.lovable.app/images/fransaugust-logo.png" ... />

<!-- Till -->
<img src="https://<project-ref>.supabase.co/storage/v1/object/public/email-assets/fransaugust-logo.png?v=1" ... />
```

**Header-padding:**
```html
<!-- Fran -->
<td style="background:...;padding:20px 40px;">

<!-- Till -->
<td style="background:...;padding:16px 40px;">
```

**Halsnings-padding:**
```html
<!-- Fran -->
<td style="padding:16px 40px 0;">

<!-- Till -->
<td style="padding:12px 40px 0;">
```

### Edge Functions som deployas
- `send-transport-request`
- `send-transport-cancellation`
