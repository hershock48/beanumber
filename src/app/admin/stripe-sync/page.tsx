/**
 * Admin · Sync from Stripe.
 *
 * Two-button reconcile of Stripe → Postgres:
 *
 *   1. Every customer (shirt buyers included). Walks every Stripe
 *      charge, ensures the donor row exists for the email behind it.
 *      Use when the newsletter recipient count looks light.
 *
 *   2. Every subscription (sponsors only). Walks every Stripe sub,
 *      ensures Donor + Sponsorship + Subscription rows exist. Fixes
 *      subs that predated the webhook or that the webhook dropped
 *      due to a signature failure. Returns a per-row breakdown so
 *      Kevin can see exactly what was created / updated / left alone.
 *
 * Both endpoints are idempotent and safe to re-run.
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
          Stripe → Postgres
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
            Walks every successful Stripe charge and ensures Postgres
            has a Donor row for the email behind it. This fills in
            shirt buyers whose checkout completed but never made it
            into the local donors table &mdash; run this first when
            the newsletter recipient count looks too small.
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
            Pulls every Stripe subscription and ensures Postgres has a
            matching Donor + Sponsorship + Subscription row. Also
            surfaces past-due and paused subscribers so you can chase
            the card update. Safe to re-run &mdash; every write is
            idempotent.
          </p>
          <StripeSyncClient />
        </section>
      </div>
    </AdminShell>
  );
}
