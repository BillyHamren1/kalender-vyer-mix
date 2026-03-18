

## Plan: Fix scanner app icon

### Problem
The web app always uses `public/app-icon-192.png` (a teal clock = Time icon) as favicon and PWA icon, regardless of whether the app is in scanner mode. The scanner should show its own icon (amber ScanLine).

### Solution
Generate a scanner-specific PWA icon from the existing source `assets/app-icons/eventflow-scanner-icon.png` and dynamically set the correct icon based on app mode.

### Changes

**1. Copy scanner icon to public/**
- Copy `assets/app-icons/eventflow-scanner-icon.png` to `public/app-icon-scanner-192.png` (resized/renamed for web use)
- Since we can't run sharp in the browser, we'll reference the source directly or create a pre-made 192px version

**2. Create `public/manifest-scanner.json`**
- Clone of `manifest.json` but with scanner branding:
  - `name`: "EventFlow Scanner"
  - `short_name`: "Scanner"
  - `start_url`: "/scanner/login"
  - `scope`: "/scanner/"
  - Icons pointing to the scanner icon

**3. Update `index.html` dynamically or use conditional logic in `src/main.tsx`**
- In `main.tsx`, detect `VITE_APP_MODE` and swap:
  - `<link rel="manifest">` href
  - `<link rel="icon">` href
  - `<link rel="apple-touch-icon">` href
  - `<meta name="apple-mobile-web-app-title">`

This ensures the scanner build/mode shows the correct amber ScanLine icon everywhere.

**4. Files changed:**
- `public/manifest-scanner.json` — new file
- `src/main.tsx` — add dynamic icon/manifest switching based on `VITE_APP_MODE`
- Copy/add scanner icon PNG to `public/`

