# App Store Submission Checklist

The punch list Kevin runs when the mobile app is ready to ship. Follow top-to-bottom. Anything with `TODO` needs a real value before the corresponding step will succeed.

Last touched: 2026-07-07.

## 0. Prerequisites

The one-time stuff. Do these before touching a single command.

- Apple Developer Program membership — $99/yr. https://developer.apple.com/programs. Required to publish to the App Store; TestFlight also gated. Sign up with the same Apple ID used for kevin@beanumber.org so the paper trail matches BAN's other records.
- Google Play Console developer account — one-time $25. https://play.google.com/console. For the Android side. Same story on the account email.
- Nonprofit fee waiver: Apple waives the $99/yr for 501(c)(3)s if BAN applies via Apple's nonprofit portal (https://developer.apple.com/support/membership-fee-waiver/). Filing requires EIN 93-1948872 + a scan of the IRS determination letter. Filed at least three weeks before submitting, ideally sooner.
- `npm install -g eas-cli` — the Expo build tool.
- `eas login` — signs into expo.dev with the same account that owns the `mobile` slug.
- Two-factor set up on Apple ID with an app-specific password for EAS's automated submit flow (System Settings → Apple ID → Sign-In & Security → App-Specific Passwords).

## 1. Env vars — what needs to exist where

The app won't build or auth or accept push registrations without these.

### Vercel (production project)

Newly required for deep linking + Apple entitlement checks:

- `APPLE_TEAM_ID` — 10-character alphanumeric. Look in Apple Developer → Membership Details → Team ID.
- `APPLE_BUNDLE_ID` — `org.beanumber.app`. Already set in `mobile/app.json`; the AASA route reads this to build the `appID`.
- `ANDROID_PACKAGE_NAME` — `org.beanumber.app`.
- `ANDROID_APP_SHA256` — release SHA-256 fingerprint. Not the debug one. Get it after the first EAS production build: `eas credentials -p android` → "View credentials" → copy the SHA-256 under the Google Play upload keystore.

Already set (mobile auth flow):

- `MOBILE_JWT_SECRET` — 64+ char random string. Kevin generated this during the auth build.
- `APPLE_BUNDLE_IDS` — comma-separated allow-list for Sign in with Apple identity-token audience validation. Just `org.beanumber.app` for now.
- `GOOGLE_CLIENT_IDS` — comma-separated allow-list for Sign in with Google. The iOS and Android client IDs both go here.

Optional for scale:

- `EXPO_PUSH_ACCESS_TOKEN` — only if push volume exceeds the unauthenticated ceiling. Skip for launch; add when the daily fan-out crosses a few hundred receipts.

### expo.dev (project secrets)

Nothing right now — the app reads `EXPO_PUBLIC_API_BASE_URL` from `eas.json` at build time.

### Apple Developer Portal

- Register the App ID `org.beanumber.app` with these capabilities checked:
  - Push Notifications
  - Sign in with Apple
  - Associated Domains (this is what enables universal links)
- Add the domain `applinks:beanumber.org` and `applinks:www.beanumber.org` to the Associated Domains entitlement.
- Generate a push notification key (.p8) if EAS asks for one. Upload via `eas credentials -p ios`.

### Google Cloud Console (for Sign in with Google)

- Register an OAuth 2.0 client for iOS: `org.beanumber.app`. Copy the client ID → into `mobile/app.json` (or wherever the mobile client reads it) AND into `GOOGLE_CLIENT_IDS` in Vercel.
- Register a second OAuth 2.0 client for Android: package `org.beanumber.app`, SHA-1 fingerprint from the EAS release keystore. Copy that client ID into `GOOGLE_CLIENT_IDS` too (comma-separated).
- Register a Web client if the web experience will eventually use Google sign-in — not needed for launch.

## 2. First EAS build — get real credentials

```
cd mobile
eas build:configure   # if eas.json doesn't already have iOS + Android profiles — it does
eas credentials       # walks through creating a distribution cert + p8 push key
eas build --profile preview --platform ios       # ~15 min. TestFlight-compatible.
eas build --profile preview --platform android   # ~10 min. APK for internal testing.
```

`preview` produces internal-distribution artifacts. Install on Kevin's iPhone via the QR link EAS emits.

Once the preview build works end-to-end (auth, reveal, notes, push), promote to production:

```
eas build --profile production --platform ios
eas build --profile production --platform android
```

Production builds are what get submitted to the stores. `autoIncrement: true` in `eas.json` bumps `ios.buildNumber` and `android.versionCode` automatically.

## 3. Store metadata — ready-to-paste copy

Everything below matches BAN voice guardrails from `docs/claude/voice.md`. Do NOT swap in generic nonprofit-speak.

### App name

`Be A Number`

### Subtitle (iOS only, 30 chars max)

`Meet a kid. Cover a month.`

### Promotional text (iOS only, editable without resubmit — 170 chars)

`Every shirt has a kid on the other end. Type the number, meet the kid, and if you want to keep going — $25 a month covers school, food, and everything else.`

### Description (4000 chars max)

Paste in exactly. No headers, no bullet points — this reads like a letter, because that's the voice.

```
Every Be A Number shirt is printed with a number between 1 and 63. Behind each number is a real kid at Hope Bridge Primary School in Northern Uganda — school fees paid, meals covered, mentor assigned, family reachable.

Here's how the app works. When your shirt arrives, you'll see your number on it. Open the app, type the number, hold your finger on the circle. The kid you're carrying is revealed. Their name, their age, their grade, the last update Simon posted from campus.

If you want to keep going, $25 a month covers everything that kid needs — school, meals, medical, mentorship. You can write them notes and they write back. Real letters, not templates. Updates land every month with a photo and a caption from Simon at the campus.

If you're already sponsoring a kid, this is where you keep up with them. Their timeline, their bio, the notes they've sent you, the newsletter from campus, and the whole roster if you're ready to meet another.

Be A Number is a US 501(c)(3), EIN 93-1948872. A person answers every email at kevin@beanumber.org.
```

### Keywords (100 chars max, comma-separated, no spaces after commas)

```
sponsor,uganda,school,children,nonprofit,donate,charity,mission,giving,kid,child,shirt
```

### Categories

- Primary: Lifestyle
- Secondary: Reference (or Social Networking if Apple's reviewer objects to the letters-back mechanic being in Reference)

### Age rating

4+. No user-generated public content, no ads, no unmoderated messaging. Notes are moderated by the campus before delivery.

### Support URL

`https://beanumber.org/support` — create this page before submission if it doesn't exist. Minimum content: "Email kevin@beanumber.org. A person answers."

### Marketing URL (optional but recommended)

`https://beanumber.org`

### Privacy Policy URL (MANDATORY)

`https://beanumber.org/privacy` — MUST exist and MUST cover: what data is collected (email + name from Apple/Google, device push token, sponsor + note content), what's shared (nothing, unless legally compelled), retention (until account deletion), and the account-deletion path (email kevin@beanumber.org). Apple's reviewer WILL check this.

### Sign in with Apple compliance note

Apple requires that any app offering third-party sign-in (Google, Facebook, etc.) also offer Sign in with Apple, positioned at least as prominently. The mobile client already implements both — verify visually before submitting: on the sign-in screen, Apple button should be first / at least equal weight to Google.

### Account deletion path (MANDATORY as of 2022)

Apple requires that any app allowing account creation also allows account deletion IN-APP. The `me` tab has a sign-out; we need a "Delete my account" affordance below it that hits a to-be-built `/api/mobile/v1/account/delete` endpoint (soft-delete + Stripe subscription cancellation + push_devices revocation). Build this before submitting. See `docs/claude/known_gotchas.md` for the outstanding items.

### Content rights

- BAN owns the campus photos (Simon's monthly submissions come with implicit consent for BAN's marketing use).
- Kid names + first-names-only are BAN's discretion.
- Sponsor-authored note content is stored under BAN's terms of service — link the ToS from the composer or on first sign-in.

## 4. Screenshots — what to prepare

Required per Apple:
- iPhone 6.7" (1290x2796) — 3-10 screenshots. Latest Pro Max resolution.
- iPhone 6.5" (1284x2778) — required for older 6.5" and 6.7" pre-14 Pro. Same screens, scaled.
- iPhone 5.5" (1242x2208) — required legacy size, still shown on older devices.
- iPad Pro 12.9" (2048x2732) — if `supportsTablet: true` (it is). Same screens rendered on iPad simulator.

Kevin's shot list — the six screens in order that carry the pitch:

1. **Reveal moment mid-hold** — the ink circle, the number in gold Lora, halfway through the fill. Caption overlay in Apple's screenshot generator: "Every shirt has a kid on the other end."
2. **Just-revealed kid** — photo, name, "Third grade. He wants to be a teacher." Caption: "Meet the person you're carrying."
3. **Kid page with a letter** — the notes thread showing the kid's reply in a cream bubble. Caption: "Real letters. They write back."
4. **Sponsor home** — "Hey Kevin." + the horizontal kid strip + campus feed. Caption: "Come back to see what happened this month."
5. **Newsletter reader** — "June at the campus." Caption: "The whole campus, once a month."
6. **Notes tab** — the inbox-shaped row with an unread gold dot. Caption: "When they write, you'll know."

Generate from the simulator: run `mobile` in Expo Go, take screenshots via Cmd+S in Simulator. Post-process to add the caption bars in Apple's Screenshot Studio or Figma. Keep captions in Lora Regular white-on-ink at ~72pt so the App Store preview grid still reads them.

## 5. TestFlight — soft-launch before public

Before pressing "Submit for Review":

1. Upload the production build via `eas submit --platform ios --latest` — pushes to App Store Connect.
2. Enable TestFlight → Internal Testing group. Add Kevin's Apple ID as an internal tester. Internal builds are available in ~15 minutes with no beta review.
3. Add a small External Testing group — 3-5 early sponsors who agreed to try the app. External builds require Apple beta review, usually 24-48h. Include a testing note: "Sign in with your existing email if you already sponsor a kid. Tap the number on your shirt — meet the kid on the other end."
4. Iterate on real feedback for 1-2 weeks. Push updates via `eas build --profile production --platform ios --auto-submit`.
5. Once stable, promote the TestFlight build to production submission.

## 6. Apple review — what usually catches an app

Common rejection reasons and how BAN's app addresses them:

- **Missing Sign in with Apple** — already implemented. Verify it's at least as prominent as Google.
- **No account deletion in-app** — BUILD BEFORE SUBMITTING. See §3 above.
- **Push permission asked at onboarding** — never do this. The design brief §3.7 already enforces contextual asks. Verify no permission prompt fires on first launch.
- **Nonspecific Camera / Photo Library usage strings** — `Info.plist` strings already specify "used to scan shirt QR codes" and "save reveal moments" — reviewer wants to see the SPECIFIC use, not "for various features."
- **Payment outside Apple's IAP** — Sponsorships route to `beanumber.org` in a `SFSafariViewController` (via `expo-web-browser`), which is Apple-compliant for donations to registered nonprofits (Guideline 3.2.1(vi)). Do NOT process sponsorships through Apple IAP — donations to 501(c)(3)s are explicitly exempt.

## 7. Google Play — what's different

Google is less picky than Apple but has its own quirks:

- Data safety form — declare exactly what the app collects. Kevin fills this out in Play Console when the first build is uploaded.
- Content rating questionnaire — same content basis as iOS (4+ → likely PEGI 3 / ESRB Everyone).
- Target API level — Google Play requires apps target the latest Android API level after Aug 31 each year. Expo SDK 54 is compliant through 2026; monitor for SDK 55 upgrade requirement in 2027.
- App signing — Google Play App Signing is on by default (recommended). EAS handles the upload key; Google re-signs with their key for distribution.

## 8. Submission-day checklist

Fifteen minutes before hitting Submit:

- [ ] All env vars in Vercel + expo.dev populated (§1).
- [ ] AASA + assetlinks endpoints return 200 with real values (curl commands in `docs/claude/architecture.md`).
- [ ] Latest EAS production build passes on Kevin's own iPhone: install, sign in, meet a kid, send a note, verify push arrives.
- [ ] Screenshots uploaded in all four size classes.
- [ ] Privacy policy URL loads.
- [ ] Support URL loads.
- [ ] Account-deletion path in-app works end-to-end.
- [ ] TestFlight external testers unblocked and reporting no criticals.
- [ ] `docs/claude/project_state.md` updated to reflect submission state.

## 9. Post-submission

Apple review median is 24-48h. During review:

- Do NOT push new backend releases that break API compatibility. If a reviewer opens the app during review, it needs to work against the currently-shipped API surface. Additive-only changes are fine.
- Answer the reviewer's questions within 24h. Rejections that go unanswered auto-close after 7 days.

Once approved:

- Announce to existing sponsors + shirt buyers via a one-off email drip (repurpose the July newsletter template — see `docs/claude/newsletter.md`).
- Update the beanumber.org homepage with an "Available on the App Store" badge.
- The QR-code sticker on future shirt packaging can now include an App Store URL alongside the shirt-number URL.

That's the run. Ship it.
