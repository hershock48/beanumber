# Christmas at the campus, 2026

Built 2026-10-21. Kevin set the gift, cost and dates on 2026-10-22 without a round trip to Simon. Simon gets told what's coming when the fund is sent, not asked. Everything configurable lives in `src/lib/christmas.ts`.

## How it works

- One pooled fund. Every kid at Hope Bridge gets the same gift. No per-number amounts (see the comment at the top of `src/lib/christmas.ts` for why).
- The card sits on every live kid's page (`/children/[N]`) while the campaign is open. Three buttons: $15 (one kid), $45 (three), $90 (six).
- Checkout: `POST /api/create-christmas-checkout`, Stripe `order_type: christmas_gift`. The kid's number rides along in metadata for the receipt and Kevin's notification only.
- Webhook records it as a one-time donation with source `Christmas 2026`. No sponsorship change, no drip enrollment, no restriction on the funds.
- Success page: `/christmas/success`.
- Campaign closes at the end of 7 December, Uganda time, or when `enabled` is set to false.
- `/christmas/preview` renders the card without a database for local eyeballing. 404s in production.

## Settings (edit in `src/lib/christmas.ts`)

| Field | Value |
|---|---|
| Gift | school bag with notebooks, pens and a set of clothes, plus a Christmas meal with classmates |
| Cost per kid | $15 |
| Kids on campus | 90 (YDO Q3 report) |
| Last day for gifts | 7 December |
| Photos | one of every kid with their gift, posted to that kid's page |

## Kevin's checklist before going live

- [ ] Commit and deploy once the foundation-release work on the webhook file has landed
- [ ] One $15 test gift in Stripe test mode, then check the donation row, the receipt and the admin email
- [ ] Own email around 1 November announcing it (not a line in the October newsletter)
- [ ] 8 December: wire the fund to YDO with the gift list and the photo ask (one photo per kid, phone camera is fine)
- [ ] After Christmas: post each kid's photo as a personal update on their page
