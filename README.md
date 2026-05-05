# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/d42a96b9-4d25-4701-b40a-d3fe594418b5

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/d42a96b9-4d25-4701-b40a-d3fe594418b5) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/d42a96b9-4d25-4701-b40a-d3fe594418b5) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)

## Android builds — Scanner vs Time

This repo ships two Android apps from one codebase:

- **EventFlow Time** — `se.eventflow.time` (config: `capacitor.time.config.ts`)
- **EventFlow Scanner** — `se.eventflow.scanner` (config: `capacitor.scanner.config.ts`)

⚠️ **Do NOT run plain `npx cap sync android`.** It uses whatever is currently
in `capacitor.config.ts` and will produce the wrong appId/appName.

Always use the wrapper scripts, which copy the correct mode-specific
Capacitor config into place before syncing:

```bash
npm run android:scanner       # full build + sync for Scanner
npm run android:scanner:sync  # patch + sync only (skip frontend build)
npm run android:time          # full build + sync for Time
npm run android:time:sync     # patch + sync only
```

### Zebra RFID SDK (Scanner only)

`ZebraRfidPlugin.java` imports `com.zebra.rfid.api3.*`. The required
Zebra API3 `.aar` is **not** committed to this repo. Drop it into
`android/app/libs/` (e.g. `API3_LIB-RELEASE-*.aar`) before building the
Scanner Android app, otherwise the native RFID plugin will not compile.
The build script prints a warning when the AAR is missing.
