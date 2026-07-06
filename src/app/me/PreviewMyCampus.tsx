/**
 * PreviewMyCampus — the anon-visitor version of /me.
 *
 * Non-signed-in visitors click "My campus" in the top nav and land
 * here. Instead of redirecting them off to /signin (the old behavior,
 * which hid the whole surface behind auth), we show them what /me
 * looks like for a real sponsor and explicitly frame it as the
 * benefit of buying a shirt.
 *
 * Same visual language as the signed-in /me — same header, same kid
 * grid, same newsletter card — so the visitor sees exactly what they
 * get. Copy makes clear these aren't THEIR kids yet.
 *
 * Server component; pulls a small sample of real roster kids for the
 * preview grid and passes the already-fetched latest newsletter down.
 */

import Link from 'next/link';
import Image from 'next/image';
import { CampusAtmosphere } from '@/components/CampusAtmosphere';
import type { OmoroWeather } from '@/lib/omoro';

interface PreviewChild {
  recordId: string;
  firstName: string;
  displayName: string;
  photoUrl?: string;
  shirtNumber?: number | null;
}

interface PreviewNewsletter {
  title: string | null;
  subject: string | null;
  heroPhotoUrl: string | null;
  publishedAt: string | null;
}

export function PreviewMyCampus({
  sampleKids,
  latestNewsletter,
  campusNowIso,
  weather,
}: {
  sampleKids: PreviewChild[];
  latestNewsletter: PreviewNewsletter | null;
  campusNowIso: string;
  weather: OmoroWeather | null;
}) {
  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-5 py-10 md:py-16">
      {/* ── Header ──────────────────────────────────────────────
          Echoes the signed-in header structure so a visitor sees
          the same shape they'd land on after buying a shirt. */}
      <header className="mb-10 md:mb-14">
        <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#D4A843] mb-3">
          My campus &middot; Preview
        </p>
        {/* Live "postmark" — same widget as the signed-in header, so
            an anon visitor sees the campus reading as a real place
            with real time and weather right from the preview. */}
        <CampusAtmosphere
          initialCampusNow={campusNowIso}
          weather={weather}
        />
        <h1
          className="text-4xl md:text-6xl text-[#0d0d0d] mb-4 leading-[1.05]"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          My campus.
        </h1>
        <p className="text-base md:text-lg text-[#555] leading-relaxed max-w-2xl">
          This is where sponsors come back. Every shirt has a number.
          Every number is a kid at the campus in Northern Uganda. When
          you buy a shirt, this page becomes yours &mdash; updates,
          letters, the monthly newsletter, and the specific kid you got
          matched with, all in one place.
        </p>
      </header>

      {/* Contextual invite band — soft, warm, points at the two
          real entry points (sign in if you already have a shirt,
          shop if you don't). */}
      <section className="bg-[#f5efe4] border border-[#e8e0d4] px-6 md:px-8 py-6 md:py-7 mb-12 md:mb-14 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#0d0d0d] mb-1">
            Not signed in yet
          </p>
          <p className="text-[#555] leading-relaxed">
            Already own a Number?{' '}
            <Link
              href="/signin"
              className="font-bold text-[#0d0d0d] hover:text-[#D4A843] underline underline-offset-4"
            >
              Sign in
            </Link>{' '}
            to see your kids.
          </p>
        </div>
        <Link
          href="/shirts"
          className="inline-block bg-[#D4A843] hover:bg-[#c49a3a] text-[#0d0d0d] px-6 py-3 text-xs font-bold uppercase tracking-wider transition-colors text-center whitespace-nowrap"
        >
          Get a shirt &rarr;
        </Link>
      </section>

      {/* ── Preview kid grid ─────────────────────────────────────
          Real roster kids (not fake mockups) to give the visitor a
          feel for who's actually at the campus. Framed clearly as
          "any of these could be yours" — no ownership implied. */}
      {sampleKids.length > 0 && (
        <section className="mb-14">
          <div className="flex items-baseline justify-between mb-6">
            <h2
              className="text-2xl md:text-3xl text-[#0d0d0d] leading-none"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              Kids at the campus.
            </h2>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#888]">
              Preview
            </p>
          </div>
          <p className="text-[#666] leading-relaxed max-w-2xl mb-6">
            Every shirt has one of their numbers on the back. Buy a
            shirt, and one of them becomes the kid you meet, watch
            grow, and stay in the life of.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {sampleKids.slice(0, 3).map(kid => (
              <PreviewKidCard key={kid.recordId} kid={kid} />
            ))}
          </div>
        </section>
      )}

      {/* ── Newsletter card ─────────────────────────────────────
          Same card design as the signed-in view. Newsletter is
          already public — no gating needed. Reinforces that the
          campus is a live, dated, human thing. */}
      {latestNewsletter && (
        <section className="mb-14">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-4">
            This month at the campus
          </p>
          <Link
            href="/news"
            className="group block bg-[#1a1208] text-white overflow-hidden hover:ring-2 hover:ring-[#D4A843] transition"
          >
            <div className="flex flex-col md:flex-row">
              {latestNewsletter.heroPhotoUrl && (
                <div className="md:w-2/5 aspect-[16/10] md:aspect-auto relative bg-[#2a1f14]">
                  <Image
                    src={latestNewsletter.heroPhotoUrl}
                    alt={latestNewsletter.title || 'From the campus'}
                    fill
                    sizes="(max-width: 768px) 100vw, 40vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
              )}
              <div className="p-6 md:p-8 flex-1">
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843] mb-3">
                  From the campus
                  {latestNewsletter.publishedAt && (
                    <span className="text-[#d8cfc1] font-normal normal-case tracking-normal ml-2">
                      &middot;{' '}
                      {new Date(latestNewsletter.publishedAt).toLocaleDateString(
                        'en-US',
                        { month: 'long', year: 'numeric' }
                      )}
                    </span>
                  )}
                </p>
                <p
                  className="text-xl md:text-2xl leading-tight mb-3"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                >
                  {latestNewsletter.title ||
                    latestNewsletter.subject ||
                    'Latest from Uganda'}
                </p>
                <p className="text-xs uppercase tracking-wider text-[#D4A843] font-bold group-hover:underline">
                  Read this issue &rarr;
                </p>
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* ── What you get when you're in ─────────────────────────
          Concrete list of features — not "empowerment" fluff. Each
          line is a real thing on the signed-in surface. */}
      <section className="mb-14">
        <h2
          className="text-xl md:text-2xl text-[#0d0d0d] mb-6 leading-tight"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          What you get when you&rsquo;re in.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-5 text-[#333]">
          <FeatureRow>
            <strong className="text-[#0d0d0d]">The kid behind your number.</strong>{' '}
            The moment your shirt arrives, come here to meet them by
            name.
          </FeatureRow>
          <FeatureRow>
            <strong className="text-[#0d0d0d]">Personal updates from the campus.</strong>{' '}
            Photos, handwritten letters, report cards &mdash; landing
            on your kid&rsquo;s page whenever the team sends them.
          </FeatureRow>
          <FeatureRow>
            <strong className="text-[#0d0d0d]">The monthly newsletter.</strong>{' '}
            One letter a month from Kevin and the team &mdash; what
            actually moved on the ground.
          </FeatureRow>
          <FeatureRow>
            <strong className="text-[#0d0d0d]">Everything in one place.</strong>{' '}
            One kid or ten kids &mdash; every relationship you have
            with the campus lives on this page.
          </FeatureRow>
        </div>
      </section>

      {/* ── Bottom CTA ──────────────────────────────────────────
          Editorial black band matching the signed-in ContextualCTA
          styling, so a visitor who reads this all the way down gets
          the same conversion moment a sponsor would. */}
      <section className="bg-[#1a1208] text-white px-6 md:px-10 py-10 md:py-12 mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-4">
          Buy a shirt. Meet a kid.
        </p>
        <h2
          className="text-2xl md:text-4xl mb-4 leading-tight"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          Every shirt is a number. Every number is a name.
        </h2>
        <p className="text-[#d8cfc1] leading-relaxed max-w-2xl mb-6">
          $25 gets you a shirt with a number pressed on the back.
          That number is a real kid at our campus in Northern Uganda.
          The moment your shirt arrives, this page becomes theirs and
          yours.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/shirts"
            className="inline-block bg-[#D4A843] hover:bg-[#c49a3a] text-[#0d0d0d] px-6 py-3 text-xs font-bold uppercase tracking-wider transition-colors text-center"
          >
            Shop the shirts
          </Link>
          <Link
            href="/founder"
            className="inline-block border border-[#3a2f24] hover:border-[#D4A843] px-6 py-3 text-xs font-bold uppercase tracking-wider transition-colors text-center text-[#d8cfc1] hover:text-white"
          >
            The story behind it
          </Link>
        </div>
      </section>
    </main>
  );
}

function PreviewKidCard({ kid }: { kid: PreviewChild }) {
  // Preview cards don't route to /children/[N] because that's the
  // reveal surface — visitors haven't earned it yet. Instead they
  // point at /shirts (the way to actually meet a kid) so a curious
  // click still moves them down the funnel.
  return (
    <Link
      href="/shirts"
      className="block bg-white border border-[#e8e0d4] hover:border-[#D4A843] transition-colors"
    >
      <div className="aspect-[4/5] bg-[#f5f0e8] overflow-hidden relative">
        {kid.photoUrl ? (
          <Image
            src={kid.photoUrl}
            alt={kid.firstName}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl opacity-25">
            👤
          </div>
        )}
      </div>
      <div className="p-4">
        <p
          className="text-lg md:text-xl text-[#0d0d0d] mb-1 leading-tight"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          {kid.firstName}
        </p>
        <p className="text-xs text-[#888] leading-snug">
          At the campus &middot; Northern Uganda
        </p>
        <p className="text-xs font-bold uppercase tracking-wider text-[#0d0d0d] hover:text-[#D4A843] transition-colors mt-3">
          Meet a kid like {kid.firstName} &rarr;
        </p>
      </div>
    </Link>
  );
}

function FeatureRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 leading-relaxed">
      <span
        className="mt-1.5 inline-block w-2 h-2 bg-[#D4A843] flex-shrink-0"
        aria-hidden="true"
      />
      <p>{children}</p>
    </div>
  );
}
