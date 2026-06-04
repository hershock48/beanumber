# Be A Number — Mobile App Build Brief

**Document version:** 0.1 (pre-build draft for founder review)
**Date:** June 4, 2026
**Author:** Kevin Hershock (founder), with technical detail by Claude (engineering partner)
**Status:** Awaiting sign-off. No code written against this yet.

---

## 0. Why this document exists

Be A Number, International (BAN) is moving its sponsor + donor experience from `www.beanumber.org` onto a real native app — iPhone and Android. This brief is the spec a senior engineer would need to ship that app end-to-end. It defines what we're building, why, the technical architecture, the brand mechanics that must be preserved, the business constraints (App Store rules, nonprofit IAP exemptions, accessibility), and the work plan.

The intended readers are: Kevin (founder, ownership), any engineering partner working on the build (currently Claude), and any future contractor, board member, or auditor who needs to understand what BAN is shipping and why.

This document is the source of truth for the build. If implementation drifts from this spec, either the spec gets updated or the implementation gets corrected — not both versions in circulation.

---

## 1. Context

### 1.1 Organizational

BAN is a U.S. 501(c)(3) nonprofit (EIN 93-1948872). It funds school, daily meals, on-site medical care, and mentorship for specific named children at the YDO Hope Bridge campus in Omoro District, Northern Uganda. Pre-launch as of this writing, with the website live and a real Donorbox + Stripe donor history (~100+ donors). Kevin Hershock runs operations solo from Marshall, Michigan; Wilobo Simon Peter runs YDO on the ground.

### 1.2 Brand mechanic

Every shirt sold has a unique number printed on the back. That number maps to a real child at the campus. The buyer "meets their kid" by typing the number into the app (currently the website). This number-to-name reveal — typing a number, watching a name and face appear — is the load-bearing user experience and the most distinctive thing about the org. **It must be preserved exactly in the app and treated as ceremony, not a form field.**

Sponsorship is $25 per month per child, billed through Stripe. Sponsors get monthly newsletters, periodic per-child updates with photos, and the option to reorder shirts that ship with their existing matched child's number.

### 1.3 Why an app, not a PWA

This decision was discussed and resolved. A PWA would ship faster but Kevin chose to build a real native app because:

- The deeper engagement loop (push notifications that consistently land, home-screen presence, native payment flows) is most reliable in real native apps, especially on iOS.
- App Store + Google Play presence is a discovery and trust signal for older donor demographics.
- The website's role changes post-launch: it becomes a marketing landing page that directs visitors to install the app. The deep sponsor experience moves to app-only.
- No half-measures. Once the decision is made, the cleanest path is React Native via Expo, which gives both platforms from one codebase.

### 1.4 What's not changing

- BAN's existing Next.js project at `https://www.beanumber.org` stays exactly where it is during the build. The website continues to operate as today. The mobile app calls the website's existing API endpoints — no backend rewrite. The website's role transforms only at app launch.
- The Airtable schema (`Donors`, `Donations`, `Sponsorships`, `Children`, `Newsletters`, etc.) stays as today. The app reads and writes through the same Stripe webhook + API routes the web already uses.
- The brand voice, color palette, typography, and operating model (pool funding, cycling shirt numbers, batch lock) all stay as documented in `docs/claude/voice.md`, `docs/claude/core_model.md`, `docs/claude/funding_model.md`, and `docs/claude/newsletter.md`.

---

## 2. Tech stack decision

### 2.1 Decision summary

| Layer | Choice | Rationale |
|---|---|---|
| Framework | React Native (Expo, managed workflow) | One codebase, both platforms, fastest credible path for solo founder + AI engineer |
| Language | TypeScript | Shared types with existing web codebase; type safety across API contract |
| Navigation | Expo Router | File-based routing mirrors Next.js patterns the web uses |
| State (server) | TanStack Query (React Query) | Standard for data fetching, caching, retry, pagination |
| State (local) | Zustand | Lightweight, no boilerplate; not Redux |
| Styling | NativeWind (Tailwind for RN) | Preserves design system from web; same color hex codes, same spacing scale |
| Auth storage | `expo-secure-store` | Keychain on iOS, EncryptedSharedPreferences on Android |
| Payments | `@stripe/stripe-react-native` | Stripe's official SDK; native Apple Pay + Google Pay |
| Push | Expo Push Notifications | Wraps APNs + FCM; single server endpoint, two platforms |
| Deep links | Universal Links (iOS) + App Links (Android) | Native deep link standard; same URLs as web |
| Crash reporting | Sentry (free tier) | Industry standard; supports source maps for RN |
| Backend | Existing Next.js project on Vercel | Reused as-is; mobile is a new client of the same API |
| Build / submit | EAS Build + EAS Submit | Expo's cloud builds for iOS + Android; handles signing |
| OTA updates | EAS Update | JS-only updates without store review |

### 2.2 Why React Native (Expo) over the alternatives

**Native Swift + native Kotlin.** Best platform fidelity, but doubles the development surface, requires two language proficiencies, and gives BAN no measurable benefit. The app's screens are forms, lists, photos, and a sponsor portal — nothing that demands deep platform-specific APIs.

**Flutter.** Excellent UI engine and good single-codebase story, but Dart pulls us out of the TypeScript + React ecosystem the web codebase is built on. Zero shared types with web. Smaller ecosystem for the specific integrations we need (Stripe RN SDK is more mature than Flutter's options).

**Expo bare workflow.** More control over native modules but requires native iOS + Android tooling on Kevin's machine. Expo managed workflow gives us 95% of what we need with none of the native build chain pain.

**React Native CLI (non-Expo).** Same as bare workflow. Expo is faster to set up, ships with the standard libraries pre-wired, and handles the production build pipeline. There's no benefit to going non-Expo for this scope.

### 2.3 What this stack does NOT do well

Honesty matters here. Things React Native + Expo handle adequately but not as gracefully as native:

- Complex gestures (pinch-zoom on photos, swipe-to-dismiss with parallax). RN supports these via `react-native-gesture-handler` + `react-native-reanimated` but they require careful work to feel native.
- Background services. Expo's background tasks are limited. If we need a long-running background process (we don't, today), this would be a constraint.
- Some platform-specific UI patterns. iOS context menus and Android Material 3 motion can feel slightly off if we use cross-platform components without platform-specific styling.

None of these are blockers for v1. They're noted so we don't oversell.

---

## 3. Repository structure

### 3.1 Monorepo layout

Convert the current `beanumber` repository to a monorepo using PNPM workspaces. New top-level layout:

```
beanumber/
├── apps/
│   ├── web/                    # current Next.js code, moved here intact
│   │   ├── src/
│   │   ├── public/
│   │   ├── next.config.mjs
│   │   ├── package.json
│   │   └── vercel.json
│   └── mobile/                 # new Expo project
│       ├── app/                # Expo Router screens
│       ├── components/
│       ├── lib/
│       ├── assets/
│       ├── app.json            # Expo config
│       ├── eas.json            # EAS build profiles
│       └── package.json
├── packages/
│   ├── shared/                 # types, Zod schemas, brand constants
│   │   ├── src/
│   │   │   ├── types/
│   │   │   ├── schemas/
│   │   │   ├── brand.ts        # colors, typography names, voice rules
│   │   │   └── constants.ts    # SPONSORSHIP_AMOUNT, etc.
│   │   └── package.json
│   └── api-client/             # typed fetch wrappers around /api routes
│       ├── src/
│       └── package.json
├── docs/                       # existing docs/claude/* moves here unchanged
├── CLAUDE.md                   # stays at root
├── pnpm-workspace.yaml
├── turbo.json                  # Turborepo for task orchestration
├── package.json
└── README.md
```

### 3.2 Workspace dependencies

- `apps/web` depends on `packages/shared` and `packages/api-client`.
- `apps/mobile` depends on `packages/shared` and `packages/api-client`.
- `packages/shared` and `packages/api-client` are pure TypeScript; no React, no React Native, no Next.js. They are runtime-agnostic.

When the web codebase changes a Donor type, the mobile build catches it at compile time. When the API contract changes a response shape, both clients update together or both flag the drift.

### 3.3 Deploy independence

Despite living in one repo, the apps deploy on independent pipelines:

- **`apps/web` deploys to Vercel.** Configure Vercel project root to `apps/web`. Deployment triggers only when `apps/web/**` or `packages/**` change.
- **`apps/mobile` builds via EAS.** EAS builds trigger manually or on tag push. Independent from web deploy.

This means: shipping a mobile-only change doesn't redeploy the website. A web fix doesn't trigger a new mobile build. They're decoupled at the build layer, coupled at the type layer.

### 3.4 If you reject the monorepo recommendation

If after reading this you still want separate repos, the alternative is:

- New repo `beanumber-mobile` for the Expo project.
- Publish `packages/shared` and `packages/api-client` as private GitHub packages or to a private npm registry.
- Both repos consume them as npm dependencies.
- API contract changes require: bump shared package version → publish → update both repos → test → ship.

The cost is higher operationally (more steps per change, slower iteration, more places for drift to hide). I'd only go this route if there's a specific reason — a different developer joining and owning mobile, or a compliance need to isolate the codebases. For a solo founder + AI partner, it adds friction without proportional benefit.

---

## 4. Surfaces — screen-by-screen specification

Every screen in the app, mapped against existing web surfaces where applicable. This is the implementation contract.

### 4.1 Public surfaces (no auth)

#### Number entry / home screen
- **Route:** `/` (default tab)
- **Visual:** Cream background. Centered serif headline: "Type your number." Single large numeric input below. "Go" button in gold. Recents row below input for users with prior session.
- **Behavior:** Numeric keypad opens by default. Validates against active batch range on submit. Routes to kid profile screen on success. Shake animation + "We don't have a #X yet" message on miss.
- **Animations:** Subtle haptic feedback on key press (iOS). On "Go": brief loader → fade out input → push transition to kid profile.

#### Kid profile screen
- **Route:** `/children/[shirtNumber]`
- **Sources:** Same API endpoint the web uses (`getChildByShirtNumber`).
- **Layout:**
  - Hero photo carousel (horizontal swipe, page indicators, pinch to zoom on tap).
  - Shirt number badge top-right of photo.
  - Kid name in Lora serif 600, name meaning below in italic.
  - Age + grade pill row.
  - Child quote pull-quote in serif italic if present.
  - Structured intake blocks: Home, Family, About — each with a gold label and prose.
  - Longer bio block ("More about [name]").
  - Teacher quote block, attributed.
  - Sponsor-only sections (gated by verified session): stats strip, latest update from this kid, report cards thumbnails, letters thumbnails.
  - Campus newsfeed below: featured newsletter expanded, archive collapsed.
  - Bottom CTA: "Sponsor [Name] — $25/month" for non-sponsors; "You're [Name]'s sponsor" acknowledgment for verified sponsors.
- **Reveal animation:** The first time a user opens a kid profile (tracked in `expo-secure-store`), the page animates in ceremonially — photo fades in, name types in character-by-character (300ms), bio expands beneath. Haptic feedback at the name reveal moment. This is the brand moment. Spec it carefully; do not let it feel like a generic page load.

#### Campus newsfeed
- **Route:** `/news`
- **Source:** Same API endpoint the web uses (`getRecentCampusNewsletters`).
- **Layout:** List of newsletters, most recent expanded with hero photo + full body, older months collapsed as cards with thumbnail + date + headline + teaser. Tap to expand inline.
- **Top of screen:** Small "Don't have your shirt yet? → Order" link.

#### Founder, governance, impact, contact
- **Routes:** `/about/founder`, `/about/governance`, `/about/impact`, `/about/contact`
- **Source:** Hardcoded content matching the web pages.

### 4.2 Authenticated sponsor surfaces

#### Sponsor portal / "My Kids"
- **Route:** `/me` (tab)
- **Source:** Existing `/sponsor/[code]` data model.
- **Layout:**
  - Header: "Hey [FirstName]" + total kids sponsored + total months active.
  - List of active sponsorships: kid photo + name + shirt # + monthly amount + "Open" button.
  - "Shop your number" button — reorder shirts with existing matched number.
  - "Sponsor another kid" button — fires sponsor-checkout flow.
  - Billing summary at bottom: next payment date, payment method.
  - Settings link in top right.

#### Settings screen
- **Route:** `/me/settings`
- **Sections:**
  - Push notification preferences (5 toggles: newsletter, kid updates, billing, student-of-month, payment alerts).
  - Text size (mirrors website toggle).
  - Email address on file (read-only; change via support).
  - Sign out.
  - About / Version / Privacy policy / Terms.

#### Sign-in flow
- **Entry point:** Any sponsor-gated action triggers sign-in if no session.
- **Flow:**
  1. Email input screen. "We'll send you a one-tap link."
  2. App calls `POST /api/sponsor/recover/send-link` with `{ email, source: 'mobile' }`.
  3. Confirmation screen: "Check [email]@[domain]. The link opens this app and signs you in. Expires in 30 minutes."
  4. User taps link in email → iOS/Android opens the BAN app via custom URL scheme.
  5. App's deep link handler reads the token, calls `POST /api/sponsor/recover/verify`, stores session.
  6. Routes to whatever screen they were trying to reach.

### 4.3 Conversion surfaces

#### Sponsorship signup
- **Entry point:** "Sponsor [Name]" button on kid profile (non-sponsor view), or "Sponsor another kid" in sponsor portal.
- **Flow:**
  1. Pre-fill kid info, show $25/month framing, three sentences on what the sponsorship does.
  2. Stripe SDK presents native payment sheet. Apple Pay default if available; card fallback.
  3. On success: brief loader → "You're now sponsoring [Name]." → routes to that kid's profile in sponsor mode.
  4. Subscription metadata mirrors the existing `/api/create-sponsor-checkout` route. Webhook handles record creation as today.

#### One-time donation
- **Route:** `/donate` (accessible from More tab and from sponsor portal).
- **Flow:** Three amount tiles ($25, $100, custom). Optional message. Native payment sheet. Existing `/api/create-checkout` handles server side.

### 4.4 Not in v1 (deferred)

- Direct messaging between sponsors and the campus (not on web either).
- In-app photo upload from sponsor to kid.
- Video content.
- Multi-language UI (English only at launch; if Ugandan team uses the app, that's a separate spec).
- Sponsor-to-sponsor visibility or social features.
- Admin tools (Kevin keeps using web for back-office).
- Camera-based shirt scanning (number typing is the ritual; we don't replace it).
- Apple Watch / wearable companions.

---

## 5. Backend additions

The existing Next.js project is reused as the API server. Specific additions for mobile:

### 5.1 New endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/mobile/push/register` | POST | Stores Expo push token against Donor record |
| `/api/mobile/push/unregister` | POST | Clears push token |
| `/api/mobile/push/preferences` | PUT | Updates per-channel push prefs on Donor |
| `/api/sponsor/recover/send-link` | POST (modified) | Existing endpoint, accepts `source: 'mobile'` for custom-scheme link |
| `/api/sponsor/recover/verify` | POST (new) | Exchanges signed token for session JSON (instead of cookie redirect) |
| `/api/mobile/session` | GET | Returns current sponsor session info (replaces cookie reads) |
| `/api/mobile/health` | GET | Version + status; mobile checks for "please update" |

### 5.2 New Airtable fields on Donors

| Field | Type | Purpose |
|---|---|---|
| `Expo Push Token` | singleLineText | Stored device token, single device per donor for v1 |
| `Push Notification Preferences` | multipleSelects | newsletter, kid_updates, billing, sotm, payment_alerts |
| `Mobile App Version` | singleLineText | Last reported app version; used for backwards compat |
| `Mobile First Opened At` | dateTime | Tracking when sponsor first installed |

### 5.3 New server-side modules

- `apps/web/lib/push.ts` — Expo Push API wrapper. Exports `sendPushToDonor(email, payload)`, `sendPushToAllSponsors(payload)`, `sendPushToKidSponsors(childRecordId, payload)`.
- Push trigger integrations:
  - `send-campus-newsletter.ts` adds push to sponsors with newsletter prefs.
  - Child update publish path adds push to that kid's sponsors with kid_updates prefs.
  - Stripe webhook on `invoice.payment_succeeded` adds optional billing push.
  - Stripe webhook on `invoice.payment_failed` adds high-priority push.
  - Admin Student-of-Month approval adds push to that kid's sponsors with sotm prefs.

### 5.4 API versioning

All `/api/*` requests from mobile include an `X-Client-Version` header. The server logs the version on every request and can switch response shapes per version. Forward compatibility: new fields can be added freely; old fields cannot be removed without bumping the API version. Old app versions in the wild keep working.

If a hard breaking change ships, `/api/mobile/health` returns a "please update" flag and the app gates further use behind an update prompt.

---

## 6. Authentication architecture

### 6.1 Identity model

Same identity model as web. A sponsor is identified by their email. A session is a signed JWT-style token containing `{ sponsorCode, email, expiry }`, HMAC-signed with `CRON_SECRET`. Sessions live 30 days.

Web stores the session in an httpOnly cookie. Mobile stores it in `expo-secure-store` (Keychain / EncryptedSharedPreferences) and sends it as an `Authorization: Bearer <token>` header on every API call.

The existing `/api/sponsor/recover/callback` endpoint already mints these tokens for the web magic-link flow. We extend it to accept a `mobile` flag and return the token in JSON (not as a redirect with cookie set).

### 6.2 Token lifecycle

1. User signs in with email → server emails a custom-scheme deep link (`beanumber://sponsor/auth?t=<signed-token>`).
2. User taps link → OS opens app → app's deep link handler extracts token.
3. App calls `POST /api/sponsor/recover/verify` with `{ token }`.
4. Server validates HMAC + expiry, returns `{ session: { sponsorCode, email, expiry }, sessionToken: '...' }`.
5. App stores `sessionToken` in `expo-secure-store`.
6. Subsequent API calls send `Authorization: Bearer <sessionToken>`.
7. App refreshes session by calling `/api/mobile/session` periodically; if expired, prompts re-sign-in.

### 6.3 Multi-device handling

Default: each device gets its own session. Signing in on a new device does not invalidate the old one. This is intentional — sponsors with both an iPhone and an iPad use both.

Sign-out only clears the local device's session. To revoke all sessions for an email, contact support (manual until v2).

### 6.4 Security posture

- Tokens never logged. `console.log` calls in production builds stripped via Expo's production config.
- No SSL pinning in v1 (overkill for this org; revisit if compliance requires).
- Jailbroken / rooted device detection: not in v1. Decision: BAN's threat model doesn't justify the false-positive cost.
- Token rotation on suspicious activity (e.g. rapid location change): not in v1.

---

## 7. Payments — Stripe + Apple/Google review rules

### 7.1 Stripe SDK integration

`@stripe/stripe-react-native` for both platforms. Wraps Stripe Checkout in a native payment sheet. Apple Pay and Google Pay are first-class options.

The app calls existing endpoints (`/api/create-sponsor-checkout`, `/api/create-checkout`, `/api/sponsor/portal-purchase`) to create the Stripe Checkout Session, then opens it in-app. The user completes payment in the Stripe-hosted view, returns to the app via deep link on success.

### 7.2 App Store + Play Store payment rules — CRITICAL

This is the highest-risk compliance item for the project. Apple's App Store Review Guideline 3.1.1 generally requires in-app purchases to use Apple's IAP system, with Apple taking ~30%. The same is true for Google Play's Payments policy.

**However:** Both stores explicitly exempt registered nonprofit donations from this requirement. See:

- **Apple guideline 3.1.3(c)** (Reader / Other Approved Apps): "Approved nonprofits may fundraise within their own dedicated app, provided the donation feature is accessible only by users in approved locales and adheres to all applicable laws."
- **Apple guideline 3.2.1(vi)**: Nonprofit apps may use external donation systems for fundraising if registered.
- **Google Play Payments policy**: Allows external payment processors for "donations to non-profit organizations."

To qualify, BAN must:

1. Submit proof of 501(c)(3) status to Apple via the Nonprofit Status form before app review. This is a one-time process. The IRS determination letter is what Apple wants.
2. Clearly indicate in the app and in the App Store metadata that contributions are donations to BAN as a registered nonprofit.
3. Issue tax receipts as a nonprofit organization (already happening via Stripe webhook).
4. Not use the donations to unlock app features or digital goods inside the app. Sponsorship gets the donor a relationship with a kid, not an "unlocked" piece of digital content.

**The nuance:** the $25 monthly sponsorship is on the edge. It's a recurring contribution to a 501(c)(3) — that's a donation. But because it unlocks the sponsor portal (with photos, letters, report cards), Apple could argue it's a digital subscription. The mitigation is to be careful with framing: the portal content is *additional sponsor stewardship* (relationship updates from the kid), not paywalled premium content. The portal is sponsor-only because it's *about that sponsor's relationship*, not because the content is being sold.

We submit Apple's nonprofit form, label all flows as "donate" / "sponsor monthly" (not "subscribe"), and frame the portal correctly. If Apple pushes back, we have a sound argument and can clarify.

Google Play is more permissive on this point but the same care applies.

### 7.3 Receipt handling

Existing Stripe webhook continues to be the single source of truth for receipts. Email receipts (via existing `email.ts`) include the language Apple's reviewers will want to see: "Be A Number, International, a U.S. 501(c)(3) registered nonprofit, EIN 93-1948872. Your contribution is tax-deductible..."

### 7.4 Cancellation

The app must include "Manage subscription" inside the sponsor portal that lets a sponsor cancel at any time. This is both Apple's requirement (3.1.2(a)) and ours (we want no churn friction). The existing `/api/sponsorship/cancel` endpoint backs this.

---

## 8. Push notifications

### 8.1 Architecture

App registers for push at first launch (after a polite explainer screen, not at app start). On grant, app calls `POST /api/mobile/push/register` with the Expo Push Token. Server stores token + preferences on the Donor record.

Server-side, the app uses `expo-server-sdk` to send messages to Expo's push service. Expo routes to APNs (iOS) or FCM (Android). Each push payload includes a deep link to the relevant in-app screen.

### 8.2 Push trigger inventory

| Event | Recipients | Title | Body | Deep link |
|---|---|---|---|---|
| New monthly newsletter | All sponsors with `newsletter` pref | "From the campus" | Newsletter subject | `/news` |
| New child update on a specific kid | That kid's sponsors with `kid_updates` pref | "[FirstName] has an update" | First line of update | `/children/[N]` |
| Subscription payment succeeded | Sponsor with `billing` pref | "Your sponsorship of [FirstName] renewed" | $25 to BAN | `/me` |
| Subscription payment failed | Sponsor (always) | "Heads up — payment didn't go through" | Card needs updating | `/me/billing` |
| Kid wins Student of the Month | That kid's sponsors with `sotm` pref | "[FirstName] is Student of the Month" | Reason text | `/children/[N]` |
| Kid's birthday | That kid's sponsors with `kid_updates` pref | "[FirstName] turns [age] today" | Brief warm note | `/children/[N]` |

### 8.3 Voice rules for push copy

All push notification copy follows `docs/claude/voice.md`. No "generous." No "impact" as verb. No "Dear Friend." No em-dashes for drama. Direct, specific, personal. Title under 40 chars; body under 120.

### 8.4 Quiet hours

User's local time zone is respected. Push notifications are not sent between 9:00 PM and 8:00 AM. This is configurable in settings.

---

## 9. Brand + visual design

### 9.1 Palette (carried from web)

| Token | Hex | Use |
|---|---|---|
| Cream | `#FFF8F0` | Backgrounds (light surfaces) |
| Near-black | `#0d0d0d` | Body text, headlines, dark surfaces |
| Gold | `#D4A843` | Accent, CTA, hover states, labels |
| Sand | `#e8e0d4` | Borders, dividers |
| Mid-gray | `#777` | Secondary text |
| Light-gray | `#999`, `#aaa`, `#bbb` | Tertiary text, placeholders |

### 9.2 Typography

| Family | Use |
|---|---|
| Lora (serif, weight 600) | Headlines, kid names, blockquotes |
| System sans (`-apple-system`, `Roboto`) | Body, UI labels, buttons |
| Georgia | Email-style transactional content inside the app (sparingly) |

Dynamic Type / Font Scale supported. The app respects the user's system text size preference for body text. Headings have a maximum scale cap so they don't break layouts at the extremes.

### 9.3 Voice

Mandatory reading: `docs/claude/voice.md`. Every line of user-facing copy goes through that filter. Banned phrases enforced at the lint level via a custom rule in CI.

### 9.4 App icon + splash

- **App icon:** The `#` mark from the existing logo, gold on cream square, with subtle shadow at the 1024×1024 source. Specific variants generated for iOS (180, 167, 152, 120, etc.) and Android adaptive icon (foreground + background).
- **Splash screen:** Cream background, centered `#` mark in gold, no text. Brief — fades to home screen within 800ms on warm starts.

### 9.5 Dark mode

**Out of v1.** Decision: the brand palette is cream + gold + near-black, which is intentionally warm. A dark mode variant would require a designed dark palette that doesn't exist yet. We ship light mode only. Users on dark mode at the system level see light-mode app. Revisit in v2.

---

## 10. Brand mechanics that must be preserved exactly

Non-negotiable. Read the source documents in full before implementing anything that touches these:

- **Pool funding model** (`docs/claude/core_model.md`, `docs/claude/funding_model.md`)
  - Sponsor dollars go into one pool that funds the whole campus.
  - A sponsor is *assigned to* a kid as a relationship, not as that kid's funder.
  - App copy must not say "your $25 funds Marvin." It says "your $25 funds the campus where Marvin learns" or "$25 a month keeps the campus running for Marvin and 64 other kids."
  - No per-kid sponsor counts in any UI. Multiple sponsors per kid is fine and expected.

- **Cycle / batch model** (`docs/claude/core_model.md`)
  - Shirt numbers cycle through kids inside locked batches.
  - Same kid is the face of many shirt numbers.
  - The mobile app calls the existing resolver (`src/lib/cycle.ts`) via API. It does not reimplement the cycle math.

- **Number reveal ritual**
  - Typing the number is THE moment. Do not replace with QR scanning, OCR, or automatic detection.
  - The reveal animation on first-visit-per-kid is the brand moment. Spec it carefully (Section 4.1).

- **Public vs sponsor-gated content**
  - Public: kid profile, bio, photos, name, age, grade, campus newsletter.
  - Sponsor-only: report cards, letters from this specific kid, monthly stats strip, billing details.

- **Voice** (`docs/claude/voice.md`)
  - Banned phrases enforced.
  - Email-style copy uses BAN voice not nonprofit-default voice.

- **Faith posture**
  - BAN is Christian. The app does not lead with faith.
  - Faith appears where natural (founder story, board governance, occasional in-context references).
  - No "blessed by your support," no "God bless," no preachy CTAs.

---

## 11. Accessibility

### 11.1 Standards

Target: WCAG 2.1 Level AA for the in-app experience. This is what the App Store accessibility review looks for and it's a real requirement given BAN's older sponsor demographic.

### 11.2 Specific commitments

- **Dynamic Type / Font Scale**: All body text scales with the user's system preference. Headings cap at +30% to avoid layout break. Tested at iOS Dynamic Type levels XS through XXXL.
- **VoiceOver / TalkBack labels**: Every interactive element has an accessibility label. Images of kids include alt text. Photo carousel announces "Photo 2 of 4."
- **Contrast**: Body text (`#0d0d0d` on `#FFF8F0`) is 18:1 contrast ratio — far exceeds the 4.5:1 AA minimum. CTA gold on near-black is 8:1 — passes. Gold on cream (CTA labels) is 3.1:1 — passes for large text only; we use it only for buttons, not body.
- **Tap targets**: 44pt minimum (Apple HIG) / 48dp minimum (Material). No tap target smaller anywhere in the app.
- **No color-only state**: Buttons don't rely on color alone for enabled/disabled. Icons accompany.
- **Reduce Motion respected**: The reveal animation respects the user's "Reduce Motion" setting. If on, content cross-fades instead of typing in.
- **VoiceOver focus order**: Logical top-to-bottom, photo first then kid name then bio.

### 11.3 Testing

- Manual VoiceOver pass on every screen before each release.
- Dynamic Type pass at the largest setting before each release.
- Accessibility Inspector (Xcode) on every screen.

---

## 12. Privacy + data handling

### 12.1 Data we collect on the app side

- Email (entered by the user).
- Push notification token (after explicit grant).
- Device type + OS version (for crash reporting and bug triage).
- App version.
- Crash logs (Sentry — scrubbed of PII).
- Optional anonymous usage analytics — see 12.4.

### 12.2 Data we explicitly do NOT collect

- Location.
- Contacts.
- Photos beyond what the user actively uploads (currently nothing).
- Browsing history outside the app.
- Health, financial (beyond what Stripe needs), or biometric data.

### 12.3 Apple Privacy Nutrition Label

For App Store Connect's privacy questionnaire, the answer for each category:

| Category | Data | Used for tracking? | Linked to user? |
|---|---|---|---|
| Contact info | Email address | No | Yes |
| Identifiers | Device ID, User ID | No | Yes |
| Usage data | Product interaction (anonymous) | No | No |
| Diagnostics | Crash data, performance | No | No |

The app is not used for tracking and contains no third-party tracking SDKs.

### 12.4 Analytics

**Decision:** No third-party analytics in v1. No Mixpanel, no Amplitude, no Google Analytics, no Facebook SDK.

Rationale: BAN's brand promise is honesty and respect for the donor. Loading a tracking SDK contradicts that. The analytics value at v1 scale (low hundreds of users) is near zero. We log key events server-side (signups, subscription starts, sign-ins) which gives Kevin the metrics he needs without harvesting the user's device.

If a real analytics need emerges in v2, we revisit with a privacy-first option (PostHog self-hosted, Plausible, or simple server logs).

### 12.5 GDPR + CCPA

- Privacy policy hosted at `beanumber.org/privacy`, linked from the app footer, App Store listing, and Play Store listing.
- "Delete my account" pathway: in-app sign-out + an email-to-support request that triggers manual data deletion. Automated self-serve delete is in v2.
- Sponsor data export available on request (email Kevin).

---

## 13. Observability

### 13.1 Crash reporting

- **Sentry (free tier).** Source maps uploaded on every EAS build.
- Crash logs scrubbed for PII (email addresses, tokens) before send via Sentry's beforeSend hook.
- Slack webhook on new high-severity crashes (or email if no Slack — TBD).

### 13.2 Server-side logging

- Existing structured logger in `apps/web/lib/logger.ts` continues.
- New mobile-originated requests tagged with `X-Client-Version` so Kevin can filter logs by app version.

### 13.3 Health checks

- `/api/health` polled by Vercel and external uptime monitor (UptimeRobot or similar).
- Mobile health: `/api/mobile/health` returns API version, recommended app version, and current banner message (if any). App can show a banner like "Scheduled maintenance: 2 AM UTC" pushed via this endpoint.

---

## 14. Performance budget

| Metric | Target | Reasoning |
|---|---|---|
| Cold start to home screen | < 2.0s on iPhone 11 / Pixel 4 | Older devices in the realistic sponsor demographic |
| Kid profile screen render | < 1.5s after API resolves | Photo loading is the long pole |
| List scroll | 60fps sustained | Native baseline |
| Photo carousel swipe | 60fps, no jank | Use FlatList + image caching |
| Cold install size | < 80MB | App Store warns above 200MB; under 80 keeps it lean |
| Bundle JS | < 4MB gzipped | Reasonable RN baseline |
| Memory | < 200MB sustained | Mid-range Android floor |
| Battery | < 1% per active hour | No background polling, push-only updates |

Performance regressions caught in PR via Lighthouse equivalent for RN (e.g., `@react-native-community/cli` perf tests on a baseline device).

---

## 15. Build, ship, update pipeline

### 15.1 Dev workflow

- Local: `pnpm dev` in `apps/mobile` opens Expo dev server. Hot reload on simulator + physical device with development build.
- Development build (one-time per native config change): `eas build --profile development --platform ios` (or `android`) — produces an installable build with native modules and dev tools.

### 15.2 Internal testing

- `staging` git branch.
- On merge to staging, EAS Build runs internal-profile builds for iOS + Android.
- iOS: TestFlight internal group (Kevin + 5-10 trusted sponsors).
- Android: Google Play internal test track.
- Bugs filed in GitHub Issues; fixes shipped as OTA updates where possible.

### 15.3 Production releases

- `main` git branch.
- New version requires a version bump in `app.json` (and matching `package.json`).
- EAS Build production profile produces signed binaries.
- EAS Submit pushes to App Store Connect + Google Play Console.
- Apple review: typically 24-48 hours for subsequent releases, longer for first.
- Google review: typically 12-24 hours.

### 15.4 OTA updates

- JS-only changes (copy edits, layout, business logic) can ship via `eas update --branch production` and land on user devices within seconds — no store review.
- Anything that requires a new native module, a new permission, or a native config change needs a real binary release.

### 15.5 Versioning policy

- Semantic versioning: `MAJOR.MINOR.PATCH`.
- `PATCH` for bug fixes (OTA-eligible).
- `MINOR` for new features (binary release for new native deps, OTA otherwise).
- `MAJOR` for breaking API contract changes.
- `app.json` version visible in settings screen for sponsor reports + support triage.

---

## 16. Accounts + costs

| Item | Cost | Owner | Status |
|---|---|---|---|
| Apple Developer Program | $99/year | Kevin (organization signer) | Not yet set up |
| Google Play Console | $25 one-time | Kevin | Not yet set up |
| Expo (EAS) | $29/month (Production tier recommended) | Kevin | Free tier exists; upgrade at staging |
| Firebase project (for FCM) | Free tier | Kevin | Not yet set up |
| Sentry | Free tier (5K errors/month) | Kevin | Not yet set up |
| Domain (`beanumber.org`) | Already owned | Kevin | Done |
| Apple nonprofit verification | Free, ~5 business days | Kevin | Submit at Phase 5 |
| Universal Links / App Links DNS configuration | No cost | Kevin / Claude | Phase 0 |

Total at launch: $99/year Apple + $29/month Expo + $25 one-time Google = ~$465 first year.

Kevin sets up Apple, Google, and Firebase accounts under his name and BAN's organizational details. Claude can guide the steps but cannot create these accounts.

---

## 17. Milestones

### Phase 0 — Setup (week 1)
- Convert repo to monorepo (PNPM workspaces + Turborepo).
- Initialize Expo app in `apps/mobile`.
- Move existing Next.js code into `apps/web/`.
- Set up `packages/shared` + `packages/api-client`.
- Verify web still deploys to Vercel from new path.
- Set up Apple Developer Program account.
- Set up Google Play Console.
- Set up EAS account.
- Configure Universal Links + App Links DNS on `beanumber.org`.
- Wire Sentry.

### Phase 1 — Foundation (weeks 2-3)
- Brand system in NativeWind (colors, typography, components: Button, Card, Heading, etc.).
- Navigation skeleton with Expo Router.
- Number-entry home screen.
- Kid profile screen (read-only, no auth gate yet).
- Reveal animation (the brand moment).
- Campus newsfeed screen.
- About / Founder / Governance / Contact static screens.

### Phase 2 — Auth + sponsor portal (week 3)
- Magic-link send flow with custom-scheme deep link.
- Server endpoint changes for `mobile` source.
- `expo-secure-store` session storage.
- Sign-in / sign-out flow.
- Sponsor portal screen (active sponsorships, "Shop your number," billing summary).
- Sponsor-gated content rendering on kid profile.

### Phase 3 — Payments (week 4)
- Stripe SDK integration.
- Sponsorship signup flow with native payment sheet.
- One-time donation flow.
- Apple Pay + Google Pay configuration.
- Success deep-link back into app.
- Apple Nonprofit verification submission.

### Phase 4 — Push notifications (week 5)
- Push token registration + storage.
- Notification preferences screen.
- Server-side push helpers in `apps/web`.
- First test push tied to next campus newsletter.
- Background notification handling (tap → deep link → screen).

### Phase 5 — Internal testing (week 6)
- TestFlight + internal Play track distribution.
- Kevin + 5-10 trusted sponsors test all flows.
- Bug fixes via OTA updates where possible.
- Performance + accessibility audit.
- Privacy nutrition label / data safety form prep.

### Phase 6 — Submission + launch (week 7)
- App Store Connect submission with nonprofit verification.
- Google Play Console submission with data safety form.
- Marketing site changes: `beanumber.org` updates with App Store + Play Store badges, sponsor-facing redirects.
- Email blast to existing sponsors with install links.
- Public launch.

**Total estimated build time:** 6-7 weeks of focused work. Aggressive but realistic with weekly sessions and clear scope discipline.

---

## 18. The website during the build — DO NOT TOUCH

**Decision (June 4, 2026):** The website at `www.beanumber.org` is not touched during the app build. Customers continue using the website normally. The app build is treated as a fully separate project that happens in parallel.

This is by design:

- Reduces risk during app development. No web regressions, no double-changes to coordinate.
- Cleaner mental model. One product at a time.
- If the app launch slips by a month, the website doesn't degrade.
- The web codebase is read by mobile (for shared types and to call the API), but never written to during the build.

### What this means concretely

- All Phase 0–6 work happens against `apps/mobile/`. Web files in `apps/web/` are not modified.
- The only exception: Section 5 lists a handful of new backend endpoints for mobile (`/api/mobile/*`, the new `Expo Push Token` field on Donors, etc.). These are additive — they don't change any existing web behavior. They're added in `apps/web/` because that's where the API lives, but the existing web routes are untouched.
- The brief's Section 5 work is sequenced with care: additive endpoints get added in Phase 2 and Phase 4 only as the mobile app needs them. No premature backend changes.

### Website transition happens as a separate, post-launch project

Once the app is live in both stores and a meaningful sponsor cohort has installed it (target: 50%+ of active sponsors), we open a new initiative to evolve the website's role. That project gets its own brief, its own milestones, and runs only when the app is stable in production.

The website transition project — when it eventually happens — will likely cover:

- Updating `/` to feature App Store + Google Play install badges prominently.
- Adding "Install the app for the full experience" banners on sponsor-facing pages.
- Deciding on the public-vs-gated question for `/children/[N]` (preserve current SEO value, or gate to drive app installs).
- Updating `/sponsor/*` routes to handle both sponsor-on-app and sponsor-on-web cases gracefully.

These are good decisions to make later, with real install data, not now in advance.

### What stays the same on web for the duration of the build

- Every public route (`/`, `/shirts`, `/sponsorship`, `/children/[N]`, `/news`, `/donate`, etc.)
- Every sponsor route (`/sponsor/login`, `/sponsor/[code]`)
- Every admin route (`/admin/*`) — Kevin keeps using web for back-office throughout the build
- Every existing API endpoint
- The Stripe webhook
- Email send flows
- All existing copy
- Brand visuals

---

## 19. Risk register

Risks ranked by impact + likelihood. Each has a mitigation plan.

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Apple rejects nonprofit IAP exemption claim | High — blocks launch | Low | Submit nonprofit verification early in Phase 5. Have Stripe-as-donation framing rock-solid. |
| EAS Update breaks an active app version | High — broken app in users' hands | Low | Staged rollout (10% → 50% → 100%). Always test on real device before publish. Rollback procedure documented. |
| iOS push notification delivery unreliable | Medium — degraded experience | Medium | Don't make push the only channel. Email backup for critical notifications (billing, newsletter). |
| Reveal animation feels bad in practice | High — brand-critical | Medium | Prototype the animation in Week 1 of Phase 1. Validate with Kevin before locking. Iterate if needed. |
| Stripe SDK update breaks the payment flow | High — blocks new sponsorships | Low | Pin Stripe SDK version. Test payment flow in staging before each release. Manual sign-off on Stripe-touching releases. |
| Sponsor signs in on multiple devices, gets confused which is "the real one" | Low | Medium | All devices stay valid. Settings screen shows "Signed in on [N] devices, manage at beanumber.org/sponsor/devices." (Defer the manage UI to v2.) |
| The brand voice slips during build | High — brand-critical | Medium | Add `voice.md` lint rule. Pair every user-facing copy commit with Kevin's review. |
| App Store review process delays launch | Medium — schedule risk | High | Submit early. Plan for at least 2 review cycles. Build in 1-2 weeks of slack. |
| Backend API drifts from app's expected contract | High | Medium | Monorepo shared types catch this at build. CI runs type check on both apps. |

---

## 20. Decision log

A short, append-only record of decisions taken during the build. This becomes the institutional memory. Started here:

| Date | Decision | Why | Made by |
|---|---|---|---|
| 2026-06-04 | React Native (Expo managed) over native Swift+Kotlin or Flutter | Fastest credible path, shared TS with web, mature ecosystem | Kevin + Claude |
| 2026-06-04 | Monorepo over separate repos | Shared types, coordinated changes, prevents API contract drift | Kevin (after pushback) + Claude |
| 2026-06-04 | No dark mode in v1 | Brand palette is intentionally warm; dark variant would require design work that doesn't exist | Claude (Kevin to confirm) |
| 2026-06-04 | No third-party analytics in v1 | Brand-honesty rationale; server logs sufficient at v1 scale | Claude (Kevin to confirm) |
| 2026-06-04 | Number entry over QR scanning | Brand mechanic; typing is the ritual | Kevin |
| 2026-06-04 | Stripe SDK in-app (qualifying for nonprofit IAP exemption) | Apple + Google explicitly allow nonprofit external payments | Kevin + Claude |
| 2026-06-04 | Website is not touched during the app build | Two separate builds. Reduces risk, cleaner mental model, web stays usable throughout | Kevin |
| 2026-06-04 | Apply for Stripe Nonprofit Pricing (2.2% + $0.30 vs 2.9% + $0.30) | Saves ~$0.17 per $25 sponsorship, applies to web and app | Kevin (to action) |

Every subsequent meaningful decision gets logged here with date + rationale + signer. Future engineers and partners can read this and understand why we're where we are.

---

## 21. Open questions requiring Kevin's decision

These are flagged inline above; collected here for review:

1. **Tab bar layout for the app — confirm proposed 4-tab structure** (Home / Newsfeed / My Kids / More) or different?
2. **Initial roster of 5-10 test sponsors for Phase 5** — names + emails.
3. **App icon — confirm the `#` mark as the source asset**, or do you want to revisit?
4. **Dark mode in v1 — confirm we skip** (current recommendation) or push to include.
5. **Third-party analytics in v1 — confirm we skip** (current recommendation) or add.
6. **Quiet hours for push notifications — confirm 9 PM–8 AM local** or different default.
7. **App Store listing's screenshots — Kevin's photos from YDO or stock?**

Note: the website transition decisions (public-vs-gated kid profiles, etc.) deferred to the post-launch website transition project — not in scope for the app build.

---

## 22. Out of scope, written down

Things I explicitly will not build in v1, written here so we don't drift:

- Camera-based shirt number scanning.
- Sponsor-to-sponsor social or community features.
- In-app video.
- Apple Watch / wearable companion.
- iPad-optimized UI (the iOS app will work on iPad but won't have iPad-specific layouts).
- Tablet-optimized Android layouts.
- Multi-language UI (English-only at launch).
- Admin tools in-app (Kevin uses web on desktop).
- AR features.
- Group sponsorship (multiple people sharing one $25 sub).
- Gift sponsorships from inside the app (web flow continues).

---

## 23. Document maintenance

This document is the source of truth for the build. Maintenance rules:

- Lives at `docs/claude/app_build.md` in the monorepo root.
- Version stamp at top updates on every meaningful edit (e.g., `0.2 — added FAQ section, June 11`).
- The Decision log (Section 20) is append-only.
- The Risk register (Section 19) gets reviewed at the start of each phase.
- The Open questions (Section 21) get resolved before the relevant phase starts; resolved questions move to the Decision log.
- Implementation drift from this spec triggers either a spec update or a code correction — never two versions in circulation.

If we hire a contractor or onboard a developer for any portion of the build, this document is what they read first.
