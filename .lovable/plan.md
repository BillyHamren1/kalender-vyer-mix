

## Root cause analysis

### Issue 1: "Lager" appears twice in the header

The `MobileBackHeader` on `MobileLocationDetail.tsx` is rendered with:
- `title={location.name}` — which is something like **"Lager Stockholm"** (or just "Lager")
- `subtitle="Lager"` — hard-coded string

So the header visually shows the word "Lager" twice stacked:
```
[← ] Lager Stockholm   [▶]
     Lager
```

This is not a duplicate-header bug; it's redundant labeling. The other mobile detail pages (`MobileJobDetail`) use the **booking number** as subtitle, not the project type — so they don't have this issue.

### Issue 2: Tapping phone/email on team members does nothing

`LagerTeamSection.tsx` uses `<a href="tel:...">` and `<a href="mailto:...">`. In the iOS Capacitor WKWebView these schemes are silently ignored unless:
1. The schemes are whitelisted in `Info.plist` under `LSApplicationQueriesSchemes`, AND
2. The link is opened via the system handler (`window.open(url, '_system')` or Capacitor's `App.openUrl`) — plain `<a>` clicks inside a WKWebView often don't trigger the URL scheme handler on iOS.

Confirmed: `ios/App/App/Info.plist` does **not** contain `LSApplicationQueriesSchemes`. The existing `JobTeamTab` has the same `<a href="tel:">` pattern and likely shares the bug.

## Fix

### 1. Header subtitle (`src/pages/mobile/MobileLocationDetail.tsx`)
- Change `subtitle="Lager"` to a useful subtitle like the address (or omit it entirely if the location name already contains "Lager"). Use `subtitle={location.address || undefined}` so we get info parity with `MobileJobDetail` (which puts secondary identifying info there).

### 2. Tel/mail links work in iOS WKWebView

Two parts:

**A. Add `LSApplicationQueriesSchemes` to `ios/App/App/Info.plist`** with `tel`, `telprompt`, `mailto`, `sms`, `maps`. This lets iOS know we intend to query/launch these.

**B. Replace `<a href="tel:">` with click handlers that use the system browser** in `LagerTeamSection.tsx`:
```tsx
const openExternal = (url: string) => {
  // Capacitor: opens in system handler (Phone app, Mail app, etc.)
  window.open(url, '_system') || (window.location.href = url);
};
// ...
<button onClick={() => openExternal(`tel:${m.phone}`)}>...</button>
```
Switch the `<a>` elements to `<button>` so React handlers run reliably inside WKWebView.

While we're at it, apply the same fix to `JobTeamTab.tsx` for consistency (same bug).

### 3. Native sync required

Info.plist changes only take effect after `npx cap sync ios` and rebuild in Xcode.

## Files to edit

- `src/pages/mobile/MobileLocationDetail.tsx` — replace hard-coded `subtitle="Lager"` with the address (or remove)
- `src/components/mobile-app/lager/LagerTeamSection.tsx` — replace `<a href="tel|mailto:">` with `<button>` + `window.open(..., '_system')`
- `src/components/mobile-app/job-tabs/JobTeamTab.tsx` — same fix for parity
- `ios/App/App/Info.plist` — add `LSApplicationQueriesSchemes` array

## Verification

- `git pull` → `npx cap sync ios` → rebuild via Xcode
- Open Lager in the Time app on iPhone:
  - Header should show only one "Lager"-related line (name + address as subtitle)
  - Tapping the phone icon on a team member should open the iOS Phone app
  - Tapping the mail icon should open the iOS Mail composer

