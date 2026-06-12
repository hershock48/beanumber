/**
 * /sponsorship — DEPRECATED. Belt-and-suspenders redirect to
 * /shirts. The primary redirect happens at the next.config.ts
 * level (301 before page resolution) — this file is the fallback
 * in case that config redirect is ever removed or misconfigured.
 *
 * Renaming history: /sponsorship → /campus → /shirts. The original
 * /sponsorship page was a kid-picker checkout. When we gutted the
 * picker per core_model.md §0b it became an explore page (renamed
 * to /campus). When /campus itself went sign-in gated (the public
 * directory undermined the shirt-first mechanic), the legacy URL
 * was pointed at /shirts so cold visitors land on the brand
 * mechanic instead of a redirect chain.
 */

import { redirect } from 'next/navigation';

export default function SponsorshipRedirect() {
  redirect('/shirts');
}
