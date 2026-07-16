# Be A Number — mobile app

Native iPhone + Android app for BAN shirt holders and sponsors, built with React Native via Expo (SDK 55, expo-router).

> **Design brief:** `docs/claude/app_build.md` in the repo root. Read it before changing anything.
> **Domain model:** `docs/claude/app_model.md` — the number as bearer instrument, buyer/sponsor split.
> **Status (2026-07-16):** feature-complete client against `/api/mobile/v1/*`. Sign in with Apple/Google, Hold-to-Meet reveal with in-app claim, kid pages with penpal threads (monthly-gated), campus feed + explore, newsletter, push notifications with contextual permission asks, deferred links (QR before install), email linking for purchases made under a different address, in-app account deletion. Store submission blockers are Kevin-side — see `docs/app-store-submission.md`.

---

## What you need on your Mac to run this locally

You only need these installed once. Skip anything you already have.

### 1. Node.js (you have it if `npm -v` works in Terminal)

If you don't:
- Go to https://nodejs.org and install the LTS version. Done.

### 2. pnpm (faster, smarter npm — what this repo uses)

```bash
npm install -g pnpm
```

### 3. Expo Go on your phone

This is what lets you see the app on your actual iPhone or Android phone while we develop. Free.

- **iPhone:** Search "Expo Go" in the App Store. Install.
- **Android:** Search "Expo Go" in the Play Store. Install.

You don't need Xcode or Android Studio for development. Expo Go handles all of that.

> Heads-up: Sign in with Apple doesn't run inside Expo Go. For dev
> preview, set `EXPO_PUBLIC_MOBILE_DEV_AUTH=1` locally (and
> `MOBILE_DEV_AUTH=1` on the server) to show the dev sign-in button.
> Both flags come out before store submission.

---

## How to run the app on your phone

Open Terminal. From the repo root:

```bash
cd mobile
pnpm install
pnpm start
```

This prints a QR code in your terminal.

- **iPhone:** Open the Camera app, point it at the QR code, tap the banner that appears. Expo Go opens with the app.
- **Android:** Open Expo Go directly, tap "Scan QR code," scan it.

The app loads on your phone. Edit any file, save, the app reloads in real time. This is the dev loop.

To stop the server, press `Ctrl+C` in Terminal.

---

## What's in the project

```
mobile/
├── app/                     # expo-router screens (file = route)
│   ├── (auth)/sign-in.tsx   #   Apple / Google sign-in
│   ├── (tabs)/              #   Home · Explore · Penpal · Me
│   ├── meet/[number].tsx    #   Hold-to-Meet reveal + "Keep #N" claim
│   ├── children/[number]/   #   kid page + updates
│   ├── keep-going/[number]  #   post-reveal $25/mo conversion (web handoff)
│   └── newsletter/[id].tsx
├── components/              # design system + screen sections
├── hooks/                   # useAuth, deep-link + push bridges
├── lib/                     # api client, auth, push, theme, deepLink
├── app.json                 # Expo config: identifiers, deep link domains
├── eas.json                 # EAS build profiles (API base URL lives here)
└── README.md                # This file
```

The `node_modules/` folder is local to the mobile project and not shared with the web. The web app at `/src/` is untouched — the app talks to it only through `/api/mobile/v1/*` plus the public kid endpoints.

---

## Don't change these without checking the spec first

- `app.json` — bundle identifier (`org.beanumber.app`) and deep link domains. These get registered with Apple and Google; changing them mid-build breaks Universal Links / App Links.
- `eas.json` — `EXPO_PUBLIC_API_BASE_URL` must stay on `https://www.beanumber.org` (the apex 307s to www, and redirects eat POST bodies).
- `lib/theme.ts` — brand colors + type scale. Source of truth is `voice.md` + the design brief.
- The reveal choreography in `components/reveal/` — timings come from the brief's 3.2 annotations, not taste.

---

## Shipping a build

Builds go through EAS (`eas build --profile production`), submissions through `eas submit`. The Kevin-side prerequisites (Apple Developer Program, Play Console, OAuth client IDs, server env vars) are tracked in `docs/app-store-submission.md`.

---

## Troubleshooting

**"command not found: pnpm"** — install it: `npm install -g pnpm`.

**"command not found: expo"** — you don't need it globally. Just `pnpm start` from the `mobile/` folder.

**App won't load on phone** — phone and computer need to be on the same Wi-Fi network. Some corporate Wi-Fi blocks the connection; switch to your home network or a phone hotspot.

**QR code doesn't work** — In the terminal where `pnpm start` is running, press `s` to switch to "tunnel" mode. That bypasses local network issues by routing through Expo's servers (slower but always works).

**Anything else** — open an issue or message Kevin/Claude.
