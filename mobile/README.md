# Be A Number — mobile app

Native iPhone + Android app for BAN sponsors, built with React Native via Expo.

> **Spec:** `docs/claude/app_build.md` in the repo root. Read it before changing anything.
> **Status:** v0.1 — scaffolding. Number entry screen exists with no API wiring yet.

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

## What you see at v0.1

A single screen — type your shirt number, tap "Meet your kid." The kid profile screen and API wiring land in Phase 1.

This is intentionally minimal. The goal of this commit is: project is set up, runs on a real device, brand colors are right, basic input flow works. We build on top of this incrementally.

---

## What's in the project

```
mobile/
├── App.tsx                  # Root component. Currently the number entry screen.
├── app.json                 # Expo config: name, identifiers, deep link domains.
├── assets/                  # Placeholder icons + splash (we replace these with BAN art).
├── index.ts                 # Expo entry point.
├── package.json
├── tsconfig.json
└── README.md                # This file.
```

The `node_modules/` folder is local to the mobile project and not shared with the web. The web app at `/src/` is untouched.

---

## Don't change these without checking the spec first

- `app.json` — bundle identifier (`org.beanumber.app`) and deep link domains. These get registered with Apple and Google; changing them mid-build breaks Universal Links / App Links.
- Brand colors in `App.tsx` (currently inlined; moving to a theme file in Phase 1). Source of truth is `voice.md` in the repo docs.

---

## What's coming next

Phase 0 is this scaffolding. Phase 1 (next) is:

- NativeWind (Tailwind for React Native) so we stop inlining styles
- Expo Router for navigation
- Real kid profile screen reading from the existing `/api` on beanumber.org
- Custom font loading (Lora serif)
- The reveal animation — the brand moment

See `docs/claude/app_build.md` Section 17 for the full phase breakdown.

---

## Troubleshooting

**"command not found: pnpm"** — install it: `npm install -g pnpm`.

**"command not found: expo"** — you don't need it globally. Just `pnpm start` from the `mobile/` folder.

**App won't load on phone** — phone and computer need to be on the same Wi-Fi network. Some corporate Wi-Fi blocks the connection; switch to your home network or a phone hotspot.

**QR code doesn't work** — In the terminal where `pnpm start` is running, press `s` to switch to "tunnel" mode. That bypasses local network issues by routing through Expo's servers (slower but always works).

**Anything else** — open an issue or message Kevin/Claude.
