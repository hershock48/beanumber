# Be A Number — Mobile App Design Brief

## 1.1 About this document

You are Fable 5. I'm dropping this brief in as the source of truth for a mobile app design session. Read it in full before generating anything. Every screen you produce should be traceable back to a principle or task defined here.

**How I want you to work through this:**

1. Read this brief end to end.
2. Confirm you understand it and can hold it as context for the whole session.
3. Turn Part 3 into a checklist you display to me — I want to see progress against it as we go.
4. Work through the checklist in the order given. Don't skip ahead unless I tell you to.
5. After each deliverable, ask me for feedback before moving to the next.

If I drift from this brief mid-session, remind me. If you drift, I'll remind you.

## 1.2 About Be A Number

Be A Number (BAN) is a US 501(c)(3) that funds education, meals, medical care, and mentorship for kids at Hope Bridge Primary School in Omoro District, Northern Uganda. 63 kids enrolled today. Founded by Kevin Hershock.

**How the model works:**

- Every t-shirt BAN sells has a unique number screen-printed on the back.
- That number corresponds to a real kid at the school (e.g., #48 is Ismail).
- The shirt buyer scans the QR code on the shirt → they "meet" the kid whose number they hold. This is the **reveal moment**.
- From there they can optionally become the kid's monthly sponsor for $25/mo — letters, updates, photos, personal correspondence.
- Every shirt sold is also a bearer instrument for a sponsorship. Whoever ends up holding the shirt and scanning the QR becomes the sponsor of record. This makes gifting native.

**Current state:** 24 active monthly sponsors, ~44 shirt holders (bought a shirt, haven't converted), several hundred legacy donors. Web-only today at beanumber.org.

**Comparable model:** **Fahlo** (myfahlo.com), the animal tracking bracelet company. Same shape as BAN — physical product → proprietary reveal → ongoing story → parasocial retention. Fahlo forced everyone through an app from day one and it worked. Design at that tier of care.

## 1.3 The app — why, when, what

**Why an app now:** the web version works, but has ceilings. No push notifications, no home-screen presence, no cross-device continuity, email deliverability risk on every magic link. The app closes all of that.

**What the app is for:**

- The reveal moment (the highest-stakes screen in the product).
- The ongoing relationship: kid's page, notes, photos, updates, campus feed.
- Push notifications: *"Ismail wrote you back," "New photo of Angel," "Konshens is Student of the Month."*
- A second, quieter surface for buyers (billing, purchase history, gift management).

**Two roles the app supports:**

- **Sponsor** — the person who scanned the QR and now has a relationship with a specific kid. Retention role. This is where 95% of the design attention goes.
- **Buyer** — the person whose card is on file. Sometimes the same person as the sponsor, sometimes different (when a shirt is gifted). Small settings-shaped surface.

**Audience:** mostly US, ages 25-55, church-adjacent but not exclusively, iPhone-first. Aesthetic touchstones: **A24, Wildsam, Frank & Oak, Aime Leon Dore, Airbnb pre-2018** — warm, direct, personal, quiet confidence. NOT charity fundraising toolkits, corporate CSR dashboards, Salesforce, Mailchimp.

## 1.4 Design system starting point

Treat these as a strong starting point, not a decree. Recommend refinements if you see a better fit, but recognize each of these was picked deliberately. The design system exists so every screen feels like it's from the same app — consistency is a hard requirement, not a nice-to-have.

### Colors

**Primary palette:**

- **Gold `#D4A843`** — the celebratory accent. Used sparingly. Reserved for: primary CTAs, active states, the shirt number badge, key highlight moments. Never used for body text or ambient UI chrome. If there are two gold elements above the fold, one is a mistake.
- **Near-black `#0d0d0d`** — primary text, dark surfaces, primary button backgrounds. Not pure black — softer, warmer.
- **Warm cream `#fafafa`** — default screen background. Warmer than flat white; sets the whole tone of the app as inviting, not sterile.

**Supporting neutrals:**

Recommend a 5-step neutral scale from warm off-white to warm charcoal for surfaces, dividers, secondary text, and disabled states. Warm, not cool — everything should feel golden-hour, not fluorescent-lit.

**Semantic colors:**

- **Success**: muted forest green, not saturated. Used only in confirmation moments (note sent, code redeemed).
- **Error**: muted terracotta / deep coral, not fire-engine red. Human, not alarming.
- **Info**: soft blue-grey. Used rarely — prefer neutrals for informational states.
- **Notification dot / unread indicator**: gold, matching the primary accent.

**Color usage rules:**

- Never use pure black (`#000000`) or pure white (`#FFFFFF`) anywhere in the app.
- Never use gold for large fills. It's an accent, not a background.
- Warm charcoal, not blue-grey, for muted text. Grey should feel like paper aging, not overcast sky.

### Typography

**Type pair:**

- **Lora** — display headings, kid names, hero moments. Serif with warmth; used for the emotional beats.
- **Inter** — body copy, buttons, labels, all UI chrome. Clean sans-serif, high legibility at small sizes.

If you propose alternatives, replacements should preserve the pair dynamic: a warm serif for display + a clean sans for body. Don't collapse everything into a single family — the contrast between the two is doing real work.

**Type scale (iOS point sizes; adjust for platform equivalents):**

- **Display XL** — 44pt Lora Regular. Used ONLY for the kid's name on the reveal moment landed state. Nowhere else in the app.
- **H1** — 32pt Lora Medium. Screen titles, kid names on their profile page.
- **H2** — 24pt Lora Regular. Section headers on sponsor home and kid page.
- **H3** — 20pt Inter Semibold. Sub-section headers.
- **Body** — 17pt Inter Regular. All standard reading copy.
- **Body Small** — 15pt Inter Regular. Secondary reading copy, metadata contexts.
- **Caption** — 13pt Inter Regular. Quiet metadata (dates, badges, timestamps).
- **Overline** — 11pt Inter Medium ALL CAPS. Used sparingly for tab bar labels or small section markers.

**Line height:**

- Display XL and H1: 1.15 (tight, hero-shaped, prevents wrapping from breaking the moment)
- H2 / H3: 1.3
- Body copy: 1.55 (generous — the app should read like a book, not like a dashboard)
- Caption: 1.4

**Letter spacing:**

- Overlines: +0.05em (breathing room, since ALL CAPS closes up otherwise)
- Everything else: default. Inter and Lora both ship with good defaults; don't fight them.

**Weight usage:**

- Lora: Regular for hero moments, Medium for section titles. Bold used rarely.
- Inter: Regular for body, Medium for labels and UI, Semibold for buttons and emphasis. Bold rarely.
- Never use ExtraBold or Black weights — over-heavy, wrong tone.

### Spacing scale

Base unit: **4pt**. Everything is a multiple of 4.

- 4 — inline padding, icon-to-text gap
- 8 — small element spacing, chip internal padding
- 12 — component internal padding (buttons, cards)
- 16 — default gap between related elements
- 24 — default gap between component groups
- 32 — section separation
- 48 — screen padding top/bottom, hero breathing room
- 64 — major zone breaks (rare)

Screens should feel loose. If it looks tight, add space. Compression is the enemy of the emotional target.

### Corner radius scale

- **4** — small chips, badges (the shirt number badge)
- **8** — small cards, list-item photos
- **12** — default card corner, button corner, hero photos, **text fields / inputs**
- **16** — larger cards (kid card on sponsor home)
- **24** — sheets, bottom modals (top corners only)
- **Pill (999)** — the reveal button, some primary CTAs, circle avatars

Photos are never square-cornered unless intentionally editorial. Everything rounds.

### Shadow / elevation

Shadows are quiet. No aggressive drop shadows. Warm-tinted, not pure grey.

- **Elevation 0** — no shadow. Default surface (screen backgrounds, inline elements).
- **Elevation 1** — `0px 2px 8px rgba(30, 20, 10, 0.04)`. Cards on the campus feed, kid cards on home.
- **Elevation 2** — `0px 4px 16px rgba(30, 20, 10, 0.06)`. Floating action buttons, tab bar.
- **Elevation 3** — `0px 8px 24px rgba(30, 20, 10, 0.08)`. Bottom sheets, modals.

The shadow color has a slight amber tint (that's the `30, 20, 10` RGB base) rather than pure black — matches the warm palette.

### Iconography

- **Style**: line, not filled. Weight ~1.5px stroke at 24pt icon size.
- **Corner treatment**: rounded ends and joins, not sharp corners. Soft, warm register.
- **Preferred set**: **SF Symbols** for iOS (native, adapts to Dynamic Type, matches system feel). Where SF Symbols doesn't cover a use case, custom line icons in the same weight and style.
- **Filled variants**: only for active tab bar states, and even then subtle.
- **Icon sizes**: 20pt inline, 24pt standard, 32pt for feature highlights, 48pt+ for hero moments (rare).

**Never use:**

- Cheesy nonprofit icons — globes with hearts, praying hands, doves, "helping hands" clip art.
- Animated icons (Lottie files jittering in a static interface).
- Emoji as UI. Emoji is fine in user-generated content — kid notes, campus feed captions, push notification previews — but never in system UI, empty states, or buttons.
- Gradient-filled icons.

### Motion

Motion should feel warm and unhurried. Nothing snaps or bounces aggressively.

**Easing:**

- Default: `cubic-bezier(0.4, 0.0, 0.2, 1)` — natural ease-out, feels good on deceleration.
- Spring on delightful moments (the reveal, notifications landing): tension 180, friction 22, mass 1. Soft, not bouncy.
- Never use linear ease. Never use aggressive back-out overshoots.

**Duration ranges:**

- **Micro** (state changes, taps, focus): 150-200ms.
- **Standard** (screen transitions, card expand/collapse): 300-400ms.
- **Emphasized** (reveal transition, notification arrivals, first-time onboarding): 600-1000ms.
- Never over 1200ms. Anything longer starts to feel sluggish.

**What motion is FOR:**

- Communicating state change (button pressed → button confirmed).
- Anchoring where the user is (screen transitions from left/right).
- Creating warmth in delight moments (the reveal, unread arriving).
- Signaling arrival (a new note lands with a gentle fade + slide).

**What motion is NOT for:**

- Parallax scrolling backgrounds.
- Animated backgrounds (moving gradients, floating shapes, aurora effects).
- Idle animations — a button that pulses when you're not tapping it, unless it's THE reveal button (which pulses at a heartbeat rhythm — see 3.2).
- Skeleton loaders that flash aggressively. Use a soft cream-to-off-cream shimmer at ~60 BPM.

**Reduced motion:**

- All non-essential motion disabled.
- Screen transitions crossfade instead of slide.
- The reveal moment still requires the hold (mechanic preserved), but the reveal transition cuts straight to the landed state.

### Photography treatment (in UI)

Photos are shown as-is. No stylizing. See 2.3 for the photo language itself; this is only about how photos render within the design system.

- **No grain.** Photos are phone-camera-native; adding grain fakes an aesthetic they don't have.
- **No color-correction filters.** Warm tone comes from source-side editing (upstream, before upload), not applied at render.
- **Rounded corners.** 12pt default, matching the card corner scale. Circle-cropped for avatar contexts (24-40pt sizes).
- **No drop shadow directly on photos.** Photos live INSIDE cards that may have elevation; the photo itself doesn't add its own shadow.
- **No black-and-white or duotone treatments.** Removes warmth.
- **No gradient overlays.** No scrims. If text has to sit near a photo, put the text on a card below the photo, not on top of it.
- **No motion on photos.** No auto-play, no Ken Burns effect, no parallax.

### Component library (minimum viable set)

Every screen references these. Consistency across screens is a hard requirement, not a preference.

**Buttons:**

- **Primary** — gold background (`#D4A843`), near-black text, 12pt radius (or pill on reveal moment), Inter Semibold. Never more than one primary button per screen.
- **Secondary** — near-black background (`#0d0d0d`), cream text. Used when the action is important but not the primary path.
- **Ghost** — transparent, near-black text, no border by default. Underline on focus for accessibility.
- **Disabled** — 40% opacity, no interaction, no color change.

**Inputs:**

- Text field: cream background, 1px near-black outline, 12pt radius, 14pt internal padding.
- Focused state: outline thickens to 2px, no color change.
- Placeholder text: warm-charcoal at 60% opacity.
- Never neon focus rings. Never blue.

**Cards:**

- Cream background, 12pt or 16pt radius, elevation 1.
- Internal padding: 16pt.
- Photos inside cards: full-bleed to card edges, corners inherit the card's radius.

**Modals / sheets:**

- Bottom sheet preferred over centered modal (feels iOS-native, warmer).
- Handle at top: 24pt wide, 4pt tall, centered, warm-charcoal at 30% opacity.
- 24pt radius on top corners, 0pt on bottom (attaches to screen edge).
- Backdrop: warm charcoal at 40% opacity, no blur unless the platform supports it cleanly.

**Tab bar:**

- 4 tabs max: **Home / Explore / Notes / Me**.
- iOS-native structure, not custom Android-style.
- Active state: filled icon variant + label in near-black.
- Inactive: line icon + label in warm-charcoal.
- Unread indicator: gold dot (`#D4A843`) at top-right of the icon, no number badge.

**List items:**

- 16pt internal padding.
- Photo left (if present), text right.
- Chevron right (line icon) for navigable rows.
- Divider: 1px, warm-charcoal at 10% opacity, indented to align with text (not full-width to the screen edge).

**Cards on sponsor home (Your Kids strip):**

- Portrait 3:4 photo aspect, 16pt radius, elevation 1.
- Kid first name below photo, 17pt Inter Medium.
- Shirt number badge in gold, top-right corner of photo, 4pt radius, small.
- Gold dot for new updates: top-left of card. (Resolution: unread signals across the whole app are gold, never red — one visual language.)

### Dark mode

Required. Never an afterthought.

- **Background**: `#1a1a1a` (deep warm charcoal, not pure black).
- **Primary text**: `#f5f5f5` (warm off-white).
- **Gold accent**: `#E5B858` (slightly brighter for contrast against dark background).
- **Cards**: `#252525` on dark background. Elevation shadows are less useful in dark mode — use subtle 1px warm-charcoal borders instead.
- **Photos**: unchanged. Never invert. Photos carry their own palette.
- **Semantic colors**: brightened by ~10% for adequate contrast.

Contrast requirements: WCAG AA at minimum for all text. AAA for body copy where possible.

### iOS-native patterns to prefer

- **Bottom sheets** over centered modals.
- **SF Symbols** where they exist.
- **Native Apple Sign In button** in Apple's mandated style (App Store requirement).
- **Native segmented controls** where a segmented control makes sense.
- **Native action sheets** for confirm/cancel decisions.
- **iOS haptic patterns** (see 3.2 for reveal-specific haptics).

Android should degrade cleanly but doesn't need to be Material-first. This is an iOS-first product.

## 2.1 Emotional target

Opening this app should feel like **receiving a handwritten letter from someone you care about**. Not tracking a package. Not checking Instagram. Not managing your Fidelity account. Personal. Specific. Unhurried.

If a screen you produce feels transactional, do it over.

## 2.2 Voice guardrails

The voice is the single easiest thing to get wrong on a charity app. Default AI-generated nonprofit copy sounds like a fundraising letter — generous / impact / empowering / your gift transforms lives. That whole register has to go. Below is the substitute.

### What the voice IS

- **Direct.** Says what happened, what someone did, what to do next. No throat-clearing.
- **Specific.** Names a kid, a class, a date, a subject, a number. Never "children" when it can be "Ismail." Never "recently" when it can be "June 19."
- **Personal.** Reads like a friend telling you something, not a nonprofit publishing a report.
- **Confident, not apologetic.** No "just," "simply," "we humbly ask." The ask is real; own it.
- **Warm, not sappy.** Warmth comes from specificity and rhythm, not from adjective-stacking.
- **Faith-rooted, not faith-forward.** Christian nonprofit. The app doesn't preach, quote scripture, or mention prayer. That register belongs on the founder page, not in-product.
- **Treats the reader as an adult.** Not a hero to be flattered. Not a stranger to be persuaded. A person who already showed up.

### What the voice IS NOT

- Not fundraising letter voice.
- Not "voice to the voiceless" savior register.
- Not corporate CSR (impact / transform / catalyze / leverage).
- Not urgency / scarcity (only 3 kids left! act now!).
- Not guilt-based (children are suffering without you).
- Not overly-friendly startup ("Hey there!! 👋 Great to see you back!!").

### Banned words and phrases

Never use these. Alternatives to their right.

| Banned | Why | Use instead |
|---|---|---|
| generous | Self-congratulatory; reader supplies the compliment | describe the specific thing they did |
| impact (as a verb) | Corporate CSR speak | affect, change, help, do |
| impactful | Same | meaningful, real, specific |
| empower / empowering | Implies kids need power granted to them | rewrite the sentence around what they actually did |
| give a voice to | Savior-y, condescending | rewrite (the kid already has a voice) |
| less fortunate | Othering | describe the specific circumstance |
| in need | Vague, needy-framing | describe the specific thing needed |
| Dear [Name] | Impersonal | Hey [FirstName] |
| just $25 | Minimizes the ask | $25/mo |
| just | Filler word | (delete) |
| simply | Filler word | (delete) |
| obviously | Condescending | (delete) |
| your child | Presumptuous ownership | [Kid's first name] |
| your sponsored child | Same, worse | [Kid's first name] |
| beautiful children | Objectifying, generic | describe what they're doing |
| God's precious children | Preachy | [Kid's first name] |
| Africa's children | Generalizing across a continent | kids at Hope Bridge |
| transformation | Vague, savior-tinged | describe the specific change |
| journey | Nonprofit clich&eacute; | (rewrite) |
| lasting difference | Vague | describe the specific difference |
| every dollar / every gift | Fundraising register | (rewrite) |
| we humbly ask | Apologetic | (delete the apology, keep the ask) |

### Voice per surface

**Button copy**
Active verbs, no "please," under 5 words. The button says what will happen.

- Good: "Send Ismail a note" / "Look around" / "Hold to meet" / "See more from the campus"
- Bad: "Click here to send" / "Please write to your child" / "Submit" / "Learn more"

**Headlines**
Concrete over abstract, specific over general, short over long.

- Good: "This is #48." / "Meet Ismail." / "June at the campus." / "Konshens picked math."
- Bad: "Discover Your Child" / "A Special Moment Awaits" / "The Impact of Your Sponsorship" / "Meet Your Sponsor Family"

**Body copy**
Short sentences. Vary rhythm. Read it out loud — if you'd never say it out loud, rewrite it.

- Good: "Ismail's in Primary 3. His favorite class is math. He asks the most questions in class."
- Bad: "Ismail is a sweet and generous 9-year-old boy from Northern Uganda who loves learning and dreams of a bright future through your continued support."

**Empty states**
Warm, specific, invitational. Never "no data."

- Good: "No notes yet &mdash; send Ismail one." / "Nothing from the campus yet. New updates land here."
- Bad: "No data" / "Come back later" / "Your journey is just beginning."

**Error states**
Human, not technical. No blame on the user.

- Good: "Note didn't send. Try again?" / "Not connected. We'll retry when you're back."
- Bad: "Error 500" / "Please check your input" / "An error has occurred."

**Push notifications**
Personal, specific, curiosity-generating. The kid's first name is doing 80% of the work.

- Good: "Ismail wrote you back." / "New photo of Angel." / "Konshens is Student of the Month."
- Bad: "You have a new message" / "Update available" / "Check your app!"

### Before / after examples (real patterns to copy)

**Reveal moment**

- BAD: "Congratulations! You just met your sponsored child, Ismail. Your generous support is transforming his life."
- GOOD: "This is Ismail. He's 9. His favorite subject is math."

**Send-a-note prompt**

- BAD: "Please write a message of encouragement to your child. Your words can make a lasting impact."
- GOOD: "Write Ismail. Tell him what you're up to. He'll write back."

**Sponsor conversion CTA**

- BAD: "Become a monthly sponsor for just $25 and make a lasting difference in the lives of children in need."
- GOOD: "$25/mo. Cancel anytime. Runs the whole campus."

**Newsletter intro on the sponsor home**

- BAD: "We are thrilled to share the incredible impact your generosity has made possible this month!"
- GOOD: "Here's what June looked like at the campus."

**Campus feed post**

- BAD: "The children were empowered and given a voice through the new PTA meeting!"
- GOOD: "PTA night, June 19. Parents packed the room. Simon called it the best turnout yet."

**Kid page bio**

- BAD: "Ismail is a beautiful child who has faced many hardships but remains hopeful and joyful. He is a testimony to God's grace."
- GOOD: "Ismail's in Primary 3. He asks the most questions in class. Wants to be a doctor."

**Push notification**

- BAD: "Your sponsored child has sent you an important message!"
- GOOD: "Ismail wrote you back."

**Empty inbox**

- BAD: "Your correspondence journey has yet to begin. Write your first message to your sponsored child today!"
- GOOD: "No notes yet. Send Ismail one."

**Error toast**

- BAD: "An error occurred while attempting to submit your message. Please try again later."
- GOOD: "Note didn't send. Try again?"

**Buyer home welcome line**

- BAD: "Thank you for your generous ongoing support of our mission to empower children in need!"
- GOOD: "Thanks for making this run."

**Post-reveal $25/mo prompt**

- BAD: "Now that you've met Ismail, will you commit to being his monthly sponsor and changing his life forever?"
- GOOD: "Keep going with Ismail? $25/mo, cancel anytime."

### Voice checklist

Run every piece of copy through this before shipping. If any answer trips it up, rewrite.

1. Does it name a specific kid, class, or date (never "children" when it can be a first name)?
2. Is it under 5 words for buttons, under 8 words for headlines, under 60 words for body copy?
3. Does it contain any banned word from the table above?
4. Would a friend actually text this to you? Or does it read like a nonprofit brochure?
5. Is there a real verb doing work, or is the sentence all abstractions?
6. Does it treat the reader as an adult they don't need flattering, not a hero being thanked?
7. Read it out loud. Does it sound like something a person would say?

## 2.3 Imagery guardrails

Every photo in this app should tell you it's from Hope Bridge — a specific school in Omoro District, with specific kids you'll see over and over. The photo language is a bigger part of the emotional payoff than the copy is. Get this wrong and the whole app reads as generic charity, no matter how well the type and layout land.

### Who takes the photos

Photos are taken by **Simon** (the campus lead) or by the kids' teachers, on a phone camera. Not by a Western photographer. Not by a hired videographer. Not by a drone. That constraint is a feature — the photos should feel personal and slightly informal, not campaign-quality glossy.

### What a "good" BAN photo shows

- **The kid is in context.** In a classroom, on the field, at the meal hall, in their school uniform, presenting to their class, walking home. Never isolated against a plain background.
- **The kid is engaged.** Looking at their teacher, working on their handwriting, laughing with a classmate, running with a soccer ball. Not staring blankly at the camera.
- **The kid is dignified.** Real, present, whole. Not sad. Not needy. Not "waiting to be saved."
- **The setting is visible but doesn't dominate.** You can tell it's Hope Bridge. You can see the chalkboards, the concrete floors, the uniforms, the outdoor light. But the kid is the subject, not "poverty tableau."

### What a "bad" BAN photo shows (do not design around these)

- Isolated on plain white background — reads as stock photography.
- Sad, tearful, or pleading expression — savior-photography aesthetic.
- Tattered clothes or dirt-smeared face used for pathos.
- Western volunteer visible in frame.
- Overly staged smile that doesn't reach the eyes.
- Kid asleep, injured, or hungry.
- Black-and-white treatment for gravitas.
- Kid alone in a dark room.

### Photo treatment (color, contrast, filters)

- **Warm tone.** Slight desaturation on the greens and blues so it doesn't read as tropical-postcard-oversaturation. Skin tones warm, never filtered pink or overexposed to look lighter.
- **Moderate contrast.** Don't crush shadows. Don't blow highlights. Natural late-afternoon light is ideal; mid-day sun with soft shadow works too.
- **No stylizing filters.** No sepia, no heavy grain, no VSCO A6, no vintage tint. Photos should look like they came off a phone, minimally edited.
- **No text overlays on photos.** Ever. No "SPONSOR TODAY" bars, no watermarks, no scripture captions layered over faces.

### Aspect ratios and crops

- **Kid page hero**: portrait 3:4 or 4:5. Environmental — kid visible chest-up or head-to-knee, classroom or campus behind them.
- **Kid profile card / list item**: square 1:1, tight crop, chest-up or face-only.
- **Notification thumbnail**: square 1:1, tight face crop, high-contrast enough to read at small size.
- **Campus feed post**: landscape 16:9 or 3:2. Environmental, wider view.
- **Newsletter hero embed**: landscape 16:9. Community feel — multiple kids or a wide campus scene.
- **Never crop out eyes.** Face crops are always chest-up or higher, never a floating head with no shoulders.

### Composition guidance

- Rule of thirds when it fits, but don't force it.
- Kid takes up roughly 50-70% of the frame vertically.
- Background not busy — often a plain wall, chalkboard, or uniform grass field. Focal plane on the kid, not the environment.
- Kid's gaze goes somewhere with purpose: toward the camera, toward a teacher, toward another kid, toward what they're doing. Never into the middle distance ("thoughtful sad look").

### Specific photo types the app will show

Real examples the design should account for:

- Kid at their desk writing.
- Kid at the chalkboard solving a math problem.
- Kid eating a meal with three or four classmates.
- Kid presenting to the class or the teacher.
- Kid running on the field during recess.
- Kid holding up their homework, a certificate, or a drawing they made.
- Group shot of a whole class facing the teacher.
- Wide shot of the campus building at golden hour.
- Kid at their home during a home visit, with family in the background.
- The nursery kids sitting on the floor eating together.

If you're designing a template card or feed post, make sure it handles all of these — a template that only looks good with tight portraits will fall apart on group shots and wide scenes.

### Reference material

**Structural inspiration (do this):**

- **Fahlo's marketing photos** — subject in context, warm lighting, dignity.
- **Charity: Water's post-2020 work** — they moved away from savior imagery; look at what they show now.
- **Humans of New York** — the informal, personal photo language.
- **National Geographic Kids features on specific classrooms** — a specific school in a specific place, dignified and specific.

**Do NOT reference these (this is what we're moving away from):**

- Older Save the Children campaigns (staged, tearful, savior-y).
- Compassion International's "before/after" child sponsorship photos.
- World Vision's map-of-Africa branding.
- Feed the Children's fundraising creative.
- Any stock photo tagged "African child."

### If you generate illustrations instead of photos

Same rules apply, adapted: specific named kids, dignified, in context, warm color palette. Illustration style should read as **warm editorial illustration** (Christoph Niemann, Malika Favre, Marta Monteiro) — not as **corporate charity infographic** (giant hearts, hand-drawn maps of Africa, cartoonish "diverse children" stock).

Where possible, prefer photo placeholders over illustration in the mockups, since the real product will be photo-first.

## 2.4 What this app IS NOT

Explicitly the following patterns should NOT appear in any screen you design:

- No donation platform. Payments happen on the website. The app never asks for money on the reveal screen — that comes after, framed as "keep going."
- No impact dashboard. No progress bars, no "meals served" counters, no "your gift bought…" widgets.
- No gamification. No streaks, no points, no leaderboards, no badges.
- No urgency copy. No "3 kids left!" No countdowns.
- No fundraising CTAs on the sponsor home. It's a retention surface.
- No corporate-nonprofit visual language: no globe icons, no dove logos, no water droplets.

## 3. Task list — deliverables

Work through these in order. After each, show me what you produced and wait for feedback before moving on.

### 3.1 Design system spec

Generate a single reference sheet: full color palette with usage rules, typography scale (H1 through caption), spacing scale, corner radius scale, shadow scale, and a component library — buttons (primary/secondary/ghost), input fields, cards, modals, list items, tab bar. iOS + dark mode. This becomes the source of truth every subsequent screen references.

### 3.2 Reveal moment (highest priority — spend disproportionate time here)

The single most important screen in the entire app. Everything downstream depends on whether this moment lands. If it feels flat, the app fails. If it lands, the sponsor tells a friend within an hour.

#### What the moment actually is

The person just opened a package. They pulled out a shirt. They looked at the number on the back — say #48. They already have the physical object; the number is already theirs. The app is not revealing WHAT they have. It's revealing WHO they have.

The emotional analog is not "unboxing." It's closer to:

- Meeting someone in person for the first time after months of hearing about them.
- Opening a letter you've been waiting for.
- The instant a photo develops on a Polaroid.
- The pause between hearing a friend's baby has been born and hearing the name.

Anticipation → suspension → recognition → warmth. Design every frame against that arc.

#### The mechanic (specific)

- **Hold duration**: 2.8 seconds. Long enough to be intentional. Short enough not to feel tedious.
- **Trigger**: user's finger lands on the button. Progress ring appears immediately around the button perimeter and begins filling clockwise.
- **Release-early behavior**: ring resets smoothly to zero over ~600ms. No failure state, no "you missed it" copy. Forgiving. They can try again immediately.
- **Completion**: ring completes → button vanishes into a soft gold glow → transition into reveal begins automatically. No second tap needed.
- **Network failure**: button greyed with copy "Reconnect to meet [#N]" and a retry link. Never crash into an error modal.
- **Reduced motion mode**: the mechanic is preserved (still requires the hold) but the transition cuts straight to the landed state instead of animating. Same emotional beat, less motion.

#### Haptic pattern (iOS specifics)

- **Touch**: single soft tap (`UIImpactFeedbackStyle.light`) when finger lands.
- **Filling**: continuous low-intensity rumble that increases in intensity as the ring fills. Not a buzz — a heartbeat-adjacent rhythm.
- **Milestones**: subtle discrete taps at 33% and 66% fill.
- **Completion**: single strong `notificationOccurred(.success)` haptic when the ring completes.
- **Reveal transition**: two soft taps as the kid's photo comes into frame.
- **Landed**: one gentle tap when the kid's page has fully settled.

Everything else can be muted; the haptic pattern must land regardless of sound settings.

#### Sound design

- **Pre-hold and during hold**: no sound.
- **Completion**: a single warm major-chord chime, ~800ms. Think Apple's chime when a check-in succeeds, not a synth game-win effect. Non-percussive.
- **Reveal transition**: silence. Let the visual do the work.
- **Landed**: no sound. Ambient app tone resumes.
- **Accessibility**: full experience must work with sound off. Sound is a light polish, not a load-bearing element.

#### Visual choreography (5-second total arc)

**Pre-hold state**

- Warm cream background (`#fafafa`).
- Centered: a large circular button, near-black (`#0d0d0d`), with the number they hold (e.g., "#48") in gold (`#D4A843`) at its center. Type: Lora display, large weight.
- Above the button, a headline in Lora: "This is #48."
- Below the button, a subhead in Inter: "Hold to meet them."
- No other chrome. No back button visible. No progress indicator anywhere else. Just this.
- Optional: a subtle warm ambient glow behind the button that pulses at ~60 BPM (calm resting heart rate) to build presence without pressure.

**Mid-hold (0 → 2.8s)**

- Ring appears around the button on touch, starts filling clockwise in gold.
- Button pulses very subtly — 10% scale variation at heartbeat rhythm.
- Number in the center stays visible the whole time.
- No text changes ("keep holding" etc.) — the ring is the feedback.

**Reveal transition (2.8 → 4.8s)**

- Ring completes. Fills entirely gold for a beat (~200ms).
- Ring dissolves outward as a soft gold glow that expands beyond the screen edges.
- Button and number crossfade out.
- The kid's face fades in from the center — starting small, slightly out of focus, then sharpening and scaling up to fill the top half of the screen over ~1.4s.
- Simultaneously, the kid's first name types on below the photo, one letter at a time, ~80ms per letter. Think old-school terminal typing but slower, warmer.
- The kid's age appears below the name after the name completes typing.
- Optional confetti accent (see anti-patterns section for constraints): gold-only, ~20-30 pieces, falls BEHIND the kid's photo, fades out before the name finishes typing. Silent. Should feel like a warm accent, not the main event.
- Total transition: ~2 seconds. Long enough to feel like a moment. Short enough that the person doesn't get impatient.

**Landed state (4.8s+)**

- Above the fold:
  - Kid's photo — portrait, warm, dignified, taken in context (school uniform, in class or on campus). Not isolated studio portrait.
  - Kid's first name in large Lora ("Ismail")
  - Age and grade in Inter, quiet ("9 years old · Primary 3")
  - Small gold badge with their shirt number ("#48")
- Immediately below:
  - A single warm line of intro. NOT a bio dump — one specific human detail. E.g., *"Ismail's favorite subject is math. His teacher says he asks the most questions in class."*
- Two CTAs at the bottom of the visible area:
  - Primary (gold, filled): **"Send Ismail a note"**
  - Secondary (ghost): **"Look around Ismail's page"**
- Below the fold (scrollable):
  - Full bio
  - First campus feed items about Ismail (any recent updates, photos)
  - "Meet more kids at the campus" — a small section, not dominant
- No monthly-sponsorship CTA on this screen. That comes ONE screen later, framed as "keep going." The reveal is not a moment to ask for money.

#### Copy for every state

- **Pre-hold headline**: "This is #48."
- **Pre-hold subhead**: "Hold to meet them."
- **Alternative pre-hold (test)**: "You hold shirt #48. Hold to meet the kid on the other end."
- **Mid-hold**: no text change. Ring does the work.
- **Release-early recovery**: no text change. The ring just resets. Silent forgiveness.
- **Landed headline**: kid's first name only, Lora display large.
- **Landed one-line intro**: one specific human detail about the kid. Written by Kevin per kid. Ex: *"Ismail's favorite subject is math."* / *"Angel wants to be a nurse."* / *"Konshens can name every capital in East Africa."*
- **Landed primary CTA**: "Send [Kid] a note"
- **Landed secondary CTA**: "Look around [Kid]'s page"
- **Landed footer** (small, quiet): "Kid #48 · Hope Bridge Primary · Omoro District, Uganda"

#### Anti-patterns (design will drift toward these by default — resist)

- **Confetti only if it's tasteful.** Small quantity (~20-30 pieces), gold-only, briefly (~2 seconds), falls BEHIND the kid's photo, fades before the name finishes typing. If it feels like a video-game "you won" moment, cut it. If it feels like a warm accent to the reveal, keep it.
- **No progress bar.** The ring is the progress; a separate bar is redundant and utilitarian.
- **No countdown timer.** Creates urgency; wrong emotional register.
- **No "3 seconds to meet [Kid]!" copy.** Childish.
- **No modal.** Ever. The reveal is an experience, not a dialog.
- **No skip button.** Defeats the point.
- **No "unlock" or "reveal" language on the button.** Too transactional. It's "meet," not "unlock."
- **No stock celebratory illustrations** (raised hands, stars, sparkle emoji). The kid's face is the celebration.
- **No fundraising ask on this screen.** That comes after.
- **No "meet your child" copy.** They're not YOUR child. They're a kid you're about to meet.
- **No cheesy loading spinner during the transition.** The transition IS the loading state.
- **No auto-playing video.** Photo only. Video is too much for this moment.

#### Accessibility

- **VoiceOver**: on landed state, screen reader announces kid's name, age, grade, and one-line intro in that order. Photo has meaningful alt text ("Ismail, 9, in his Primary 3 classroom").
- **Sound off**: full experience preserved via haptic + visual.
- **Reduced motion**: skip the reveal transition animation, cut straight to landed state after ring completion. Preserve the hold-to-meet mechanic.
- **Larger tap target**: button hit area extends ~20pt beyond the visible button on all sides.
- **Color-independent**: ring fill state is communicated by size/position, not just color. High contrast between ring and background.

#### References to look at (structural inspiration)

- **Fahlo reveal** — the mechanic, structurally.
- **Apple Watch: hold to power off** — the ring-fill hold interaction, rhythm.
- **Wordle: letter flip on submit** — the satisfaction of a reveal after tension.
- **Duolingo streak reveal** — the haptic + visual delight without being childish.
- **The moment a Polaroid develops** — the emotional arc: suspension → clarity.
- **Envelope opening in iOS Mail** — the transition metaphor: something closed becoming something open.
- **Cash App's boost activation** — the tactile "hold to confirm" pattern.

#### How you'll know this screen is done

Ask yourself these three questions:

1. If a friend held a shirt in front of me and told me to hold the button, would I actually do it? (If no, the pre-hold state isn't inviting enough.)
2. During the 2.8-second hold, do I feel like something is about to happen? (If no, the haptics + visual build aren't working.)
3. When the kid's face appears, do I want to tell someone? (If no, the reveal is flat.)

If you answer yes to all three, ship this frame. If any answer is no, iterate on that specific frame until it flips to yes.

### 3.3 Sponsor home

The main tab when a signed-in sponsor opens the app.

Sections (top to bottom):

- Warm greeting header with the sponsor's first name.
- **Your Kids** — horizontal strip of the kids they sponsor. Each card: photo, first name, shirt number badge, gold dot if there's a new update. Tap → kid page.
- **Campus feed** — chronological feed of updates from Hope Bridge: news, photos, SOTM winners, milestones. Reads more like Instagram than like Salesforce.
- **The latest letter** (section header; alt: "From Kevin") — the latest newsletter, embedded as an inline post with the hero photo and teaser. Keep the newsletter card's own title dated ("June at the campus") for chronology; the section header is the container, not the content.
- **Explore the campus** — a way to browse kids you don't yet sponsor, framed as "meet more of the campus."

Bottom tab bar: Home / Explore / Notes / Me.

**Notes tab for holders (majority audience):** shows the warm locked card per kid the viewer holds — *"[Kid] writes his sponsors back — real notes, in his own handwriting first, then typed up by his teacher."* + *"Keep going with [Kid]."* One card per held kid, stacked. Never an empty tab. Uses copy that already exists on the kid page (3.4), keeps the tab useful for the ~44 holders vs 24 sponsors population, and drives conversion honestly.

### 3.4 Kid page

The retention surface. After the reveal moment, this is where 80% of the sponsor's return visits go. If the reveal moment is what closes the deal, this page is what keeps the relationship alive month after month. Design it like a place a person actually wants to come back to.

Every section below should feel like a specific human detail about a specific kid, not a "profile view." Nothing on this page should feel like a nonprofit website.

#### Screen structure (top to bottom)

1. Hero
2. Latest update from the kid
3. Notes thread (correspondence engine)
4. Timeline (awards, promotions, milestones)
5. Bio (permanent facts)
6. Co-sponsors (if any, quiet)
7. Floating action button — Send [Kid] a note

The scroll rhythm matters. Hero is the top of the fold. Latest update ends the first screenful. Everything below is progressive scroll — the sponsor decides how deep they go.

#### Hero section

- Photo: portrait aspect 3:4, full-width, top of screen. Environmental photo (kid in class, on the field, at home) — not isolated portrait. No text overlay on the photo. No gradient scrim. Photo stays pristine — per the 2.3 imagery rule.
- Shirt number badge: top-right of photo, `#48` in gold on near-black, 4pt radius, small. This is the ONLY element sitting on the photo itself.
- Immediately below the photo, on warm-cream background:
  - Name: Lora H1 (32pt), kid's first name only, left-aligned with the screen padding.
  - Age + grade: Inter Body Small, one line beneath the name. "9 · Primary 3."
  - Optional line beneath (only if the viewer sponsors this kid): Inter Caption, warm-charcoal. "You've been Ismail's sponsor since March 2026." Quiet, not a badge.

No CTA in the hero itself. The floating "Send a note" button handles that job so the hero can stay clean.

This matches the reveal moment landed state in 3.2 — photo above, name below, no text on the photo. Consistency across screens is the point.

#### Latest update from the kid

The single most retention-driving section on the page. Sponsors come back to see this specifically.

- Header: "Latest from Ismail" (H2 Lora, 24pt).
- Photo: landscape 3:2 or square 1:1 depending on source. Inside a card with 16pt radius.
- Caption from the campus staff: 2-4 sentences, Inter Body. Reads like an Instagram caption, not a nonprofit newsletter. Sample: *"Ismail volunteered to lead the June debate team. His topic: should Primary 3 have longer recess? He argued yes. His team won."*
- Timestamp: relative, quiet. "3 days ago" not "June 22, 2026." Full date only appears on tap.
- Tap the photo: expand to full-screen with pinch-to-zoom. Tap the caption: no action (photo drives the tap).
- Share affordance: long-press the photo → iOS share sheet (Messages, Save Image, AirDrop).

Below this update: a small link, "See recent updates from Ismail →" that opens a chronological sub-view of all past updates about this kid.

**Empty state** (kid has no updates yet):
- No card. Just a small quiet line: *"No updates yet. Simon posts them monthly."*

**Access gate**: available to all signed-in viewers if they're a sponsor OR shirt holder of this kid. Anonymous or unrelated viewers see a locked state: *"Updates unlock when you sponsor Ismail."*

#### Notes thread (the correspondence engine)

Where the parasocial relationship lives. Design this section like a chat, but tender — not a Slack channel, not a support ticket.

- Header: "You and Ismail" (H2 Lora).
- Message bubbles, iMessage-shaped:
  - **Sponsor's messages**: right-aligned. Gold background (`#D4A843`), near-black text, 16pt radius, tail on the bottom-right corner.
  - **Kid's messages**: left-aligned. Cream background with 1px warm-charcoal outline, near-black text, 16pt radius, tail on the bottom-left corner.
- Under each message, a quiet status line in Caption:
  - Sponsor sent, kid hasn't read: *"Sent · June 22"*
  - Sponsor sent, kid read but hasn't replied: *"Ismail read this · June 25"*
  - Kid replied: *"June 30"* (date only, no status word)
- If the kid is currently drafting a reply, show a small cream card at the bottom of the thread: *"Ismail is writing back. Should arrive within 2 weeks."* This card should feel warm, not utilitarian — the anticipation is part of the experience.
- Long threads collapse: show the latest 3 message pairs (6 bubbles), then a link "See full conversation" that expands or opens a sub-view.

**Sample thread copy** (real patterns to design around):

Sponsor: *"Hey Ismail — it's Kevin. I saw your debate photo. That's amazing. What was the question again? Keep asking questions in class."*

Kid: *"Hi Kevin. Thank you for the shirt. I like math because I am good at counting. My friend Amos is on my team too. I hope to see you soon. From Ismail."*

Sponsor: *"You should hear my nephew argue about longer recess. He'd lose to you. Tell Amos I said hi."*

**Empty state** (never sent a note):
- Full-width cream card, no bubbles.
- Copy: *"Say hi. Ismail loves hearing from you."*
- Small CTA link inside the card: *"Write your first note →"* (opens the composer).

**Access gate** (this is the important one):
- **Monthly sponsor of Ismail** — sees the full thread. FAB visible.
- **Shirt holder of Ismail (not monthly)** — sees a locked section: *"Notes unlock when you sponsor Ismail for $25/mo. Cancel anytime."* Below that: a link to the conversion screen. No FAB visible on this page for holders.
- **Anonymous, non-holder, or unrelated sponsor** — the section is entirely hidden. They don't see there's a correspondence engine.

The gate is intentional. The correspondence engine is a monthly-sponsor perk; making that clear at the point of value is more honest than hiding the gate somewhere.

#### Timeline (awards, promotions, milestones)

Vertical, dated. Reverse-chronological (newest at top). Not a busy dashboard — quiet, filled in slowly over months.

- Header: "Ismail's year" (H2 Lora).
- Each entry: an icon or small illustration on the left, entry text right, date below.
- Entry types:
  - **Student of the Month**: small gold star icon. *"Student of the Month · Primary 3 · June 2026."*
  - **Grade promotion**: small arrow-up icon. *"Moved up to Primary 4 · December 2026."*
  - **Milestone**: small circle icon. *"Started English debate club · May 2026."* / *"First 100% on a spelling test · April 2026."* / *"Home visit with sponsor's family · September 2026."*
- Show the most recent 5 entries. Older entries collapse behind a "See earlier milestones →" link.
- Dates are the actual month + year, not relative. Milestones read as historical, not "3 days ago."

**Empty state** (kid has no timeline entries yet):
- Small quiet line: *"No milestones yet. Simon adds them when they happen."*
- No visual placeholder — silence is fine here.

**Access**: available to all sponsors and shirt holders of this kid. Not gated to monthly.

#### Bio (permanent facts)

Below the timeline. Quiet, factual, not a card. Reads like the back of a baseball card — just enough to make the kid feel real.

Layout: two-column list with label on the left, value on the right. All caption or body-small type. No cards, no photos in this section — the visual weight belongs to the sections above.

Sample content:

```
Full name       Ismail Ojok
Age             9
Grade           Primary 3
Favorite class  Math
Wants to be     A doctor
Family          Lives with his mom and two younger sisters
Home village    Odek
Since           Sponsored since March 2026
```

Some fields may be empty for newer kids (Simon fills them in as he learns them). Empty fields simply omit — don't show *"Not specified"* or *"—"*. If half the fields are empty, the section is short. That's fine.

**Access**: available to everyone (including anonymous viewers). No gate.

#### Co-sponsors (small, quiet, optional)

If more than one person sponsors this kid, show them subtly at the bottom of the page.

- Header: Inter Overline, all caps, quiet: "ALSO SPONSORED BY"
- List: first names only, comma-separated. "Karen and Meredith."
- No photos of other sponsors. No last names. Never public identity of a co-sponsor beyond a first name.
- If no other sponsors, this section is entirely hidden.

The point of this section is small warmth — knowing you're not alone in caring about this kid. It's not a leaderboard.

#### Floating action button: Send a note

- Position: bottom-right, 24pt from screen edges.
- Shape: pill, gold background, near-black text and icon.
- Icon: pencil (SF Symbols `pencil`).
- Copy: **"Write Ismail"** (uses the specific kid's first name).
- Behavior on scroll: pins in place, never scrolls with the page.
- Visible only for **monthly sponsors of this specific kid**. Hidden entirely for holders, anonymous viewers, or sponsors of other kids.

Tapping opens the composer sheet.

#### Send-a-note composer sheet

The bottom sheet that opens when the FAB is tapped.

- Slides up from the bottom, 24pt top radius, elevation 3.
- Header: "Write Ismail" (H3 Inter Semibold, left-aligned). Close button (SF Symbols `xmark`) top-right.
- Body: large text area, cream background, 12pt radius, 16pt padding. Plenty of vertical room (~200pt height minimum, grows with content).
- Placeholder: *"Tell Ismail what you're up to. He'll write back."*
- Character counter: shows only when the sponsor is within 100 characters of a soft limit (say 800 chars). Silent until that point.
- Attach photo: small icon at bottom-left of the sheet, opens camera or photo library. Photo attaches as a chip above the send button once selected.
- Send button: bottom-right, primary style, gold. Disabled until at least one character of text is entered. Copy: **"Send"**.
- After send: sheet dismisses with a downward slide, thread on the kid page updates with the new bubble sliding in from the bottom-right, subtle haptic (`.success`), no toast needed.

**Error state on send failure**:
- Sheet stays open, small warm-cream banner appears above the send button: *"Note didn't send. Try again?"* with a retry link.
- Text is preserved. Never lose the sponsor's writing.

#### Header behavior on scroll

- Default state (at top): no visible nav bar. The hero photo IS the header.
- On scroll past the hero: a sticky nav bar fades in over 200ms.
  - Back button on the left (chevron, SF Symbols).
  - Kid's first name centered (Inter Semibold, small).
  - "Send a note" icon on the right (pencil, only if viewer is monthly sponsor).
- Nav bar background: cream with subtle elevation-1 shadow at the bottom edge.
- Fades back out if user scrolls back up to the hero.

#### Empty photo state

If a kid has no photo yet (rare, but happens for new intakes), the hero shows:
- Warm cream background
- Kid's first name in large Lora display, centered
- Shirt number badge below, gold
- Small quiet line: *"Photo coming soon."*
- NEVER a silhouette icon or generic placeholder. The absence of a photo is a feature — Simon takes them personally.

#### Loading state

- Hero: cream shimmer at 60 BPM, 3:4 aspect placeholder.
- Bio: loads first (small payload), fills in immediately.
- Latest update: skeleton with cream shimmer for photo + 3 lines of shimmer for caption.
- Notes thread: shimmer bubbles (3 alternating left/right, cream).
- Timeline: shimmer text lines.

Everything shimmers in the same cream-to-off-cream palette. Never grey. Never blue.

#### How you'll know this screen is done

Ask yourself:

1. Would a sponsor come back to this page tomorrow just to reread the latest update? (If no, the update section isn't warm enough.)
2. Does the notes thread feel like a real conversation between two people, not a customer-support ticket? (If no, the bubbles or timing feel wrong.)
3. Does the page read as a specific kid — Ismail — or as a generic sponsored child profile? (If generic, the copy or photo language drifted.)
4. Would a holder who sees the locked notes section feel motivated to sponsor, not scolded for not sponsoring? (If scolded, the gate copy needs softening.)

Ship this screen when all four answers flip to yes.

### 3.5 Buyer home

The secondary role, for people whose card is on file. Settings-shaped, quiet.

Sections:

- "You're funding X sponsorships" — list of active subs, whose sponsor account is attached to each, and a "transfer billing" option.
- Purchase history — shirts, dates, amounts.
- Billing management — card on file, cancel, update.
- A small warmth line at the top ("Thanks for making this run"). Not dominant.

### 3.6 Onboarding + install flow

Four screens between QR scan and sponsor home:

1. QR scan → "Welcome — install the app to meet [Kid]." Shows the shirt in a hand, the kid teased but obscured.
2. After install, first open: sign in with Apple / Google.
3. Post sign-in: the reveal moment (from 3.2).
4. Post-reveal: "Keep going?" — the $25/mo conversion moment. Two options: "Yes, sponsor [Kid]" (primary) and "Not yet — meet him first" (secondary, no shame framing). Secondary swaps "him" for "her" per kid pronoun.

### 3.7 Push notifications

Design the lock screen and Notification Center presentation for:

- "Ismail wrote you back."
- "New update from Angel."
- "Konshens is Student of the Month."
- "July at the campus is live."
- "Kevin sent you something from the campus."

Rich notifications with kid photo thumbnails where relevant, not plain text.

### 3.8 Cross-screen consistency pass

After all seven above are drafted, do a review pass:

- Same components used across screens (buttons, cards, list items).
- Same spacing rhythm.
- Same type scale.
- Same tone in copy.
- Same photo treatment.

Flag any inconsistencies and fix them.

## 4.1 Sequence and dependencies

3.1 blocks everything. Do it first, get sign-off, then move on.

3.2 (reveal moment) is the highest-stakes screen. Spend disproportionate time here — as much as 3.3 through 3.6 combined if needed.

3.3 through 3.6 can be done in that order or in parallel — you decide.

3.7 (notifications) depends on the visual language being locked in.

3.8 (consistency pass) is always last.

## 4.2 Acceptance criteria per screen

For each screen, before I sign off:

1. It references the design system from 3.1 (no rogue colors, type, spacing).
2. It hits the emotional target from 2.1.
3. It respects the guardrails from 2.2, 2.3, 2.4.
4. It solves a specific need for a specific role (sponsor or buyer).
5. Nothing in it feels transactional, corporate, or generic-charity.

## 4.3 When to iterate vs move on

Iterate on a screen if:

- It feels flat, transactional, or generic.
- It violates any guardrail.
- The reveal moment doesn't make me want to hold the button.

Move on when:

- The screen feels like it belongs in the same app as the reveal moment.
- The emotional target is hit.
- I say "next."

## 4.4 What I need at the end

At the end of this session, I'll walk away with:

- The design system spec (3.1).
- Screenshots or Figma-ready frames of every screen from 3.2 through 3.7.
- The consistency pass notes (3.8).
- Any patterns you noticed BAN's brief getting wrong or right — I want to know so I can share it with the team building the app.

Let's start with 3.1.
