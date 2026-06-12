/**
 * /sponsorship — DEPRECATED. The campus exploration page lives at
 * /campus now. This file remains as a server-side redirect so old
 * links from emails, social posts, search results, and bookmarks
 * keep resolving.
 *
 * The primary redirect happens at the next.config.ts level (301
 * before page resolution) — this file is a belt-and-suspenders
 * fallback in case that config redirect is ever removed or
 * misconfigured.
 *
 * Renaming history: the original /sponsorship page was a kid-picker
 * checkout. When we gutted the picker (per core_model.md §0b) it
 * became an explore page, and the URL "sponsorship" no longer
 * matched the content. Renamed to /campus to match the brand voice
 * ("Meet the kids at the campus", "From the campus", etc.).
 */

import { redirect } from 'next/navigation';

export default function SponsorshipRedirect() {
  redirect('/campus');
}
