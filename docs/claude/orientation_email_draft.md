# Orientation email — draft

> Use this to reset every sponsor/holder/recent-shirt-buyer on how to access their kid under the new model. Triggered by Christina Downer's note about the deprecated portal code. Voice-doc compliant: direct, specific, personal, no banned phrases.

## Audience

Send to every Donor in Airtable where any of these are true:
- Has at least one Sponsorship with `Status` in (Active, Holder)
- Bought a shirt in the last 90 days (DripPipeline was/is shirt_nurture or shirt_sponsor)
- Made a recurring donation in the last 90 days (DripPipeline was/is monthly_donor)

Don't send to:
- Lapsed sponsors with no recent activity
- Unsubscribed emails (check `Unsubscribed` field if present)
- Donors who only made a one-time gift over 90 days ago

## Subject line

> How to find your kid's page

Alternates if you want a less direct angle:
- A quick reset on how to keep up with your kid
- Your Shirt, your Number, your kid's page

## Pre-header (the preview text Gmail shows next to the subject)

> Enter your Number at beanumber.org — that's your kid's page.

## Body (paste into Gmail / your mass send tool)

---

Hey {{firstName}},

Quick note. We rebuilt how you find your kid on the site, and a few of you have written in confused. Totally fair — I wasn't clear enough about what changed.

Here's how it works now:

Your Shirt has a Number printed on the back. That Number is yours, and it's a real kid at the YDO campus. Go to **beanumber.org**, enter your Number in the box on the homepage, and you'll land on your kid's page.

That page is your account. Updates from the campus, photos, letters, your year-end report card — all of it lands there. Your browser remembers you on this device, so there's no password to keep track of. If you ever switch devices or your browser forgets, enter the email you used at checkout and we'll send you a one-click link to sign back in.

There's no separate sponsor portal anymore. If a past email of mine mentioned a code or a portal login, that was the old system. The Number on your Shirt is the new code, and your kid's page is the new portal.

If you can't find your Number, hit reply on this email and I'll dig it up. Same if anything else feels off — just write me.

Thanks for the patience while we got this sorted.

Kevin
Be A Number, International

---

## Notes on what to do before sending

1. **Build the recipient list** — a CSV pulled from Airtable Donors table filtered by the audience criteria above. Should be ~50–100 emails right now (pre-launch scale).

2. **Personalize {{firstName}}** — Gmail mail merge, BCC blast with a script, or just send via Lavender/Apollo/whatever you use for batch personal sends. Don't BCC a single send with `{{firstName}}` in it — that ships the literal token.

3. **From address** should be `Kevin@beanumber.org` so replies thread back to you. The body invites them to reply if confused — expect 5-10% to actually reply with "I can't find my Number" or similar. Budget an afternoon to handle those.

4. **Subject A/B isn't worth it at this volume** — pick one of the three subjects and send.

5. **Don't send during the next 24h** — your six newly-migrated sponsors (Brenda, Samantha, Terry, Amanda, Regan, Darlene) are scheduled to get their first sponsor_onboard email on 2026-06-16. Send this orientation note BEFORE that or AFTER, not in the same window.

## Notes for me (Claude)

When you (Kevin) say "go," I can:

- Build a one-off `/api/admin/send-orientation` route that takes the recipient list and personalizes + sends through the existing `sendEmail()` abstraction (Gmail OAuth). Drains over a few minutes to stay under Gmail's bulk send threshold.
- Or just run a one-off script against the Airtable Donors list and the same email infra.
- Or write the CSV out for you to send manually via whatever you already use.

If you want a small admin button instead of a CLI tool, say so. The button is more durable but takes ~30 min to build and review; the CSV is 5 min.
