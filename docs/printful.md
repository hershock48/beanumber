# Printful: the dropship line

Tees stay in house. Seasonal pieces (long sleeve, hoodie) are printed and shipped by Printful. Built 2026-09-14.

## What happens on an order

1. A buyer adds a seasonal piece on `/shirts` (the "fall drop" section, which only renders for products marked `available: true` in `src/lib/products.ts`) and pays through the normal cart checkout.
2. The Stripe webhook inserts a fulfillment row with `fulfillment_source = 'printful'`, then calls `submitPrintfulOrder` (`src/lib/printful/orders.ts`).
3. That assigns the shirt number: lowest free number in the Active batch, skipping numbers on other fulfillment rows, numbers claimed on sponsorships, numbers in the stocked list, and reserved canonical numbers. It runs inside a transaction under an advisory lock so two orders never get the same number.
4. It posts the order to Printful with two print files by URL: `/print/front/globe.png?ink=white` and `/print/back/47.png?ink=white`. Printful fetches each URL once and caches it. The row gets `printful_order_id` and `printful_status`.
5. With `PRINTFUL_AUTO_CONFIRM` unset the order is a **draft**: it appears in the Printful dashboard, Kevin looks at the mockup and confirms (which is when Printful charges the card on file). With it set to `true`, orders go straight to production.
6. Printful calls `/api/webhooks/printful?key=...` as the order moves. On `package_shipped` the row flips to Shipped with tracking, the buyer gets a shipped email with the tracking link, and the drip clock starts at ship plus 3 days (same as the in-house ship button). On failed, canceled, or on-hold, Kevin gets an alert email and the row shows the reason in the admin Printful tab with a Retry.

If the submit fails (Printful down, bad address, no active batch), nothing is lost: Stripe has the money, the row sits in the Printful tab with the error and a Retry button, and Kevin gets an email.

## Setup (once)

1. Apply `drizzle/0019_printful_fulfillment.sql` in the Supabase SQL editor.
2. In Printful: create a store of type **API** (Settings > Stores > Add > API), then Settings > API > create a private token scoped to that store.
3. Vercel env (then redeploy):
   - `PRINTFUL_API_KEY` the token
   - `PRINTFUL_STORE_ID` only if the token can see more than one store
   - `PRINTFUL_WEBHOOK_SECRET` any long random string
   - `PRINTFUL_AUTO_CONFIRM` leave unset for drafts
   - `NEXT_PUBLIC_SITE_URL` must be `https://www.beanumber.org` (the print-file URLs are built from it)
4. Register the webhook: `POST /api/admin/printful/setup-webhook` (sign in to the admin first, then open it in the browser's console or use the X-Admin-Token header). `GET` on the same path shows what Printful has registered.
5. Enter the stocked numbers: admin > Fulfillment > Printful tab > Edit stocked numbers. Every number ever pressed on a tee, sold or not.
6. Open a batch as Active on `/admin/batches` if none is (the assigner refuses to issue numbers otherwise).
7. Place a test order: admin > Fulfillment > Printful tab > "Place a test order" (`/api/admin/printful/test-order`). It runs the real path to any address and lands as a draft. Confirm it in Printful to get one real piece in hand.
8. When the piece looks right: set prices, colors, and `available: true` in `src/lib/products.ts`, and decide on `PRINTFUL_AUTO_CONFIRM`.

## The print files

Rendered by `src/lib/printful/print-files.ts` with resvg from the SVGs in `public/shirt-designs`, on a 12 x 16 inch canvas at 300 DPI (3600 x 4800 px), the DTG front and back area on both garments. Fonts are the two OFL files in `src/lib/printful/fonts` (Courier Prime Bold for the number); system fonts are never used so the render is identical on Vercel.

Look at them before shipping anything:

```bash
npx tsx scripts/print-preview.ts 47
```

writes the full files and 600px previews on a shirt-colored ground to `out/print-preview/`.

Layout constants (art width, top offset, number size) are at the top of `print-files.ts` and are flagged PLACEHOLDER for Kevin. After changing any of them bump `PRINT_VERSION`, because Printful caches by URL.

## Variant ids

`src/lib/printful/catalog-variants.ts` is generated from the public catalog API. To add a color, fetch `https://api.printful.com/products/356` (long sleeve) or `/146` (hoodie), find the variant ids for the color across S to 2XL, add them to that file, then add the color to the product in `products.ts` with its ink (white on dark, black on light).

## Costs at build time

Long sleeve (Bella+Canvas 3501): base $18.66, back placement $5.25, US shipping $3.99, about $28 landed. Hoodie (Gildan 18500): base $22.63, back placement $5.25, shipping $7.19, about $35 landed. Suggested retail $38 to $40 and $50. The number on the back neck label instead of a full back placement would drop the placement cost to roughly $2.20 to $3.95; that is a `type` change on the back file in `orders.ts` plus a smaller canvas.
