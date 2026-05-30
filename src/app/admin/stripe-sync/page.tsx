/**
 * Admin · Sync from Stripe.
 *
 * One-button reconcile of Stripe subscriptions into Airtable. For
 * every active sub in Stripe, ensures there's a matching Donor and
 * Sponsorship row in Airtable. Returns a per-row breakdown so Kevin
 * can see exactly what was created / updated / left alone.
 *
 * Admin only.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '../_components/AdminShell';
import { getAdminRole } from '@/lib/admin-session';
import { StripeSyncClient } from './StripeSyncClient';
import { StripeCustomerSyncClient } from './StripeCustomerSyncClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function StripeSyncPage() {
  const role = (await getAdminRole()) || 'admin';
  if (role === 'simon') redirect('/admin/roster');

  return (
    <AdminShell activeTab="home" role={role}>
      <div className="max-w-3xl mx-auto px-5 py-6 md:py-10">
        <Link
          href="/admin"
          className="inline-flex items-center text-sm text-[#888] hover:text-[#0d0d0d] mb-6"
        >
          ← Back to admin
        </Link>

        <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-1">
          Stripe → Airtable
        </p>
        <h1
          className="text-3xl md:text-4xl text-[#0d0d0d] mb-3"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          Sync from Stripe.
        </h1>

        {/* ── Customer sync (every shirt buyer + sponsor) ─────────── */}
        <section className="mt-8 mb-12">
          <h2
            className="text-xl md:text-2xl text-[#0d0d0d] mb-2"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Every customer who&rsquo;s paid you.
          </h2>
          <p className="text-[#666] text-sm mb-5 leading-relaxed">
            Walks every successful Stripe charge and ensures Airtable
            has a Donor row for the email behind it. This is what fills
            in shirt buyers who never converted to monthly &mdash;
            their checkout completed but the webhook may have missed
            writing them to Airtable. Run this first when the
            newsletter recipient count looks too small.
          </p>
          <StripeCustomerSyncClient />
        </section>

        <hr className="border-[#e8e0d4] mb-12" />

        {/* ── Subscription sync (sponsors only) ───────────────────── */}
        <section>
          <h2
            className="text-xl md:text-2xl text-[#0d0d0d] mb-2"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Subscriptions.
          </h2>
          <p className="text-[#666] text-sm mb-5 leading-relaxed">
            Pulls every Stripe subscription and ensures Airtable has a
            matching Donor + Sponsorship row. Safe to re-run.
          </p>
          <StripeSyncClient />
        </section>
      </div>
    </AdminShell>
  );
}
