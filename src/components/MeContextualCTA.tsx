import Link from 'next/link';

/**
 * MeContextualCTA — the single call-to-action block on /me.
 *
 * Replaces the old "Add another kid + Meet the campus" pair with a
 * state-driven CTA that changes based on what's actually waiting for
 * the sponsor:
 *
 *   1. A kid has a published update → "See what's new with {Kid}"
 *   2. Otherwise, a newsletter is out → "Read this month's letter"
 *   3. Otherwise, retention-adjacent → "Add another kid"
 *
 * Server component. The kid-update state is computed server-side
 * (latestUpdate is already on each SponsorshipRow), so the top-of-
 * chain state doesn't need client hydration. When the update or
 * newsletter is "unread" per this browser's localStorage, the
 * NEW-pill work upstream handles the visual freshness signal; the
 * CTA below just points at the RIGHT next action regardless of
 * seen-state, because pointing sponsors at a fresh kid update they've
 * already read is still a good use of their next click.
 */

export interface MeCTAState {
  kind: 'kid-update' | 'newsletter' | 'grow' | null;
  kidFirstName?: string;
  kidHref?: string;
  newsletterHref?: string;
}

export function MeContextualCTA({ state }: { state: MeCTAState }) {
  if (!state.kind) return null;

  if (state.kind === 'kid-update' && state.kidHref && state.kidFirstName) {
    return (
      <CTABlock
        kicker="Latest from the campus"
        headline={`See what’s new with ${state.kidFirstName}.`}
        // Copy has to work for BOTH sponsors and holders (shirt buyers).
        // "the kind you sponsor for" was voice-wrong to a holder — they
        // haven't sponsored yet. Neutral wording keeps the pull without
        // conflating the two populations (see CLAUDE.md non-negotiable
        // #2 — Sponsor ≠ Shirt buyer).
        body={`There’s a fresh update on ${state.kidFirstName}’s page.`}
        ctaHref={state.kidHref}
        ctaLabel={`Open ${state.kidFirstName}’s page`}
      />
    );
  }

  if (state.kind === 'newsletter' && state.newsletterHref) {
    return (
      <CTABlock
        kicker="This month at the campus"
        headline="Read this month’s letter."
        body="A note from Kevin and the team about what happened on the ground this month."
        ctaHref={state.newsletterHref}
        ctaLabel="Read the letter"
      />
    );
  }

  return (
    <CTABlock
      kicker="Grow your campus"
      headline="Add another kid."
      body="Every shirt carries a different number. Every number is a different kid. Nothing locks you to one."
      ctaHref="/shirts"
      ctaLabel="Shop another shirt"
    />
  );
}

function CTABlock({
  kicker,
  headline,
  body,
  ctaHref,
  ctaLabel,
}: {
  kicker: string;
  headline: string;
  body: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <section className="bg-[#1a1208] text-white px-6 md:px-10 py-8 md:py-10 mb-10 md:mb-14">
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-3">
        {kicker}
      </p>
      <h2
        className="text-2xl md:text-3xl mb-3 leading-tight"
        style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
      >
        {headline}
      </h2>
      <p className="text-[#d8cfc1] leading-relaxed max-w-xl mb-5">
        {body}
      </p>
      <Link
        href={ctaHref}
        className="inline-block bg-[#D4A843] hover:bg-[#c49a3a] text-[#0d0d0d] px-6 py-3 text-xs font-bold uppercase tracking-wider transition-colors"
      >
        {ctaLabel}
      </Link>
    </section>
  );
}
