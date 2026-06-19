/**
 * Admin · Bag label catalog.
 *
 * Index of all 20 label combinations (5 adult sizes × 4 colors).
 * Each tile deep-links to the existing single-label print page
 * (/admin/print-label?size=X&color=Y) with the params pre-filled.
 *
 * Workflow: Kevin lands on the catalog, picks the combo he needs
 * for the order he&rsquo;s packing, taps Print → arrives on the single-
 * label page with the values loaded → hits Print → ships through
 * his Flashlabel Pro thermal printer.
 *
 * Admin only.
 */

import { redirect } from 'next/navigation';
import { getAdminRole } from '@/lib/admin-session';
import { LabelCatalogClient } from './LabelCatalogClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PrintLabelCatalogPage() {
  const role = (await getAdminRole()) || null;
  if (!role) {
    redirect('/admin');
  }

  return <LabelCatalogClient />;
}
