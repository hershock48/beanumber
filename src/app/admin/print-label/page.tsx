/**
 * Admin · Bag label printer.
 *
 * Kevin&rsquo;s shipping workflow: he packs each shirt into a poly bag,
 * sticks this label on the bag, then drops the bagged shirt into a
 * UPS box (or polymailer) that has the actual UPS shipping label.
 * The bag label is what the recipient sees first when they open
 * the outer package — &ldquo;ORDER # / Child Connected To / Size /
 * Color / Country: Uganda&rdquo; — a small brand beat before the shirt
 * itself.
 *
 * Uses Kevin&rsquo;s existing thermal label printer (the one he uses
 * for UPS labels), printed via the browser print dialog. CSS sizes
 * the printed area to a 4&rdquo;×6&rdquo; thermal label and hides everything
 * else (form, nav, buttons) when @media print fires.
 *
 * Manual fill for now: Kevin types the four fields per order and
 * hits print. Optional: pre-fill via URL params
 * (/admin/print-label?order=BAN-2026-914&child=Emmanuel&size=S&color=Pink)
 * so a future admin order-list view can deep-link to a pre-filled
 * label page per row.
 *
 * Admin only.
 */

import { redirect } from 'next/navigation';
import { getAdminRole } from '@/lib/admin-session';
import { PrintLabelClient } from './PrintLabelClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PrintLabelPage() {
  const role = (await getAdminRole()) || null;
  if (!role) {
    redirect('/admin');
  }

  return <PrintLabelClient />;
}
