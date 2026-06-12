/**
 * /meet/[childId] — numberless kid profile page.
 *
 * The exploration counterpart to /children/[number]. Same kid, same
 * underlying data, but the framing is fundamentally different:
 *
 *   /children/[N] is "the kid behind shirt number N" — the SHIRT
 *     NUMBER is the headline. Used by people entering via their own
 *     shirt: they want to know who they got. The reveal ritual fires
 *     ("hold to meet → SARA"), the number is prominent, the sponsor
 *     CTA reads as "stay with your kid."
 *
 *   /meet/[childId] is "this kid as themselves." Used by people
 *     exploring the campus — they're not claiming a number, they
 *     just want to meet someone. Shirt numbers don't appear anywhere.
 *     No reveal ritual (you didn't earn a number-to-name reveal —
 *     you came here by name). Sponsor CTA reads as "sponsor Sara."
 *
 * This is what Kevin asked for: when a sponsor on /[1] scrolls to
 * "Other kids at the campus" and clicks Prisca, they should NOT be
 * shown #4 prominently — Prisca isn't "#4," she's Prisca. They
 * don't need a number to sponsor her.
 *
 * The kid record IS the source of truth; the page renders a tight
 * profile (photo, name, bio, structured intake, kid quote, teacher
 * quote, sponsor CTA) without any shirt-number framing.
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { MeetSponsorButton } from './MeetSponsorButton';
import { YourKidsStrip } from '@/components/YourKidsStrip';
import {
  getViewerEmail,
  getViewerSponsorshipForChild,
} from '@/lib/sponsor-relationship';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';
import { RecentKidsStrip } from '@/components/RecentKidsStrip';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface AirtableChildRecord {
  id: string;
  fields: {
    ChildID?: string;
    DisplayName?: string;
    FirstName?: string;
    LastInitial?: string;
    DateOfBirth?: string;
    GradeClass?: string;
    ProfilePhoto?: Array<{ url: string; filename: string }>;
    Notes?: string;
    Loves?: string;
    ChildQuote?: string;
    FamilyContext?: string;
    HomeVillage?: string;
    NameMeaning?: string;
    TeacherName?: string;
    TeacherQuote?: string;
    Status?: string;
    DepartedAt?: string;
    DepartureNote?: string;
    ReservedForAuction?: boolean;
  };
}

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || '';
const CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';

async function fetchChild(childId: string): Promise<AirtableChildRecord | null> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return null;
  if (!childId || !childId.startsWith('rec')) return null;
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        CHILDREN_TABLE
      )}/${childId}`,
      {
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
        cache: 'no-store',
      }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function computeAge(dob?: string): string | undefined {
  if (!dob) return undefined;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return undefined;
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    years -= 1;
  }
  return years >= 0 ? String(years) : undefined;
}

export default async function MeetKidPage({
  params,
  searchParams,
}: {
  params: Promise<{ childId: string }>;
  searchParams?: Promise<{ from?: string; fromname?: string }>;
}) {
  const { childId } = await params;
  const record = await fetchChild(childId);
  if (!record) notFound();

  // Back-link context. When the user lands here from another kid's
  // page (via OtherKidsAtCampus), the source shirt number + first
  // name come in as ?from=N&fromname=Marvin so we can offer a return
  // path. Without them, we fall back to "Back to home."
  const sp = searchParams ? await searchParams : undefined;
  const fromShirt = sp?.from && /^\d+$/.test(sp.from) ? sp.from : null;
  const fromName =
    sp?.fromname && sp.fromname.length > 0 && sp.fromname.length < 80
      ? sp.fromname.replace(/[<>]/g, '')
      : null;

  const f = record.fields;
  const firstName = f.FirstName || f.DisplayName?.split(' ')[0] || 'Them';
  const displayName = f.DisplayName || firstName;
  const photo = f.ProfilePhoto?.[0]?.url;
  const age = computeAge(f.DateOfBirth);
  const isDeparted = !!f.DepartedAt;

  // Check whether the signed-in viewer (if any) already sponsors or
  // holds this kid. If so, /meet renders a relationship-acknowledging
  // card instead of a cold "Sponsor [name]" CTA. Same recognition
  // path /[N] uses; lives in src/lib/sponsor-relationship.ts.
  //
  // Also fetch the raw viewer email so we can distinguish a
  // signed-in user who happens to not sponsor this specific kid
  // (the user-driven discovery path — Mary on her second
  // relationship) from a cold visitor with no session at all.
  // Per the Number-is-identity model: only signed-in users get the
  // Sponsor button on /meet/[id]; cold visitors get pushed to
  // /shirts to get a Number first. Every sponsorship traces back
  // to a Number.
  const [viewerRel, viewerEmail] = await Promise.all([
    getViewerSponsorshipForChild(f.ChildID || ''),
    getViewerEmail(),
  ]);
  const isSignedIn = !!viewerEmail;

  return (
    <div className="bg-[#FFF8F0] min-h-screen flex flex-col">
      <BANNavigation />
      <YourKidsStrip />
      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-5 py-8 md:py-14">
          {fromShirt ? (
            <Link
              href={`/children/${fromShirt}`}
              className="inline-flex items-center gap-2 text-xs text-[#888] hover:text-[#0d0d0d] uppercase tracking-[0.15em] font-bold mb-6"
            >
              &larr; Back to {fromName ? fromName : `#${fromShirt}`}
            </Link>
          ) : (
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-xs text-[#888] hover:text-[#0d0d0d] uppercase tracking-[0.15em] font-bold mb-6"
            >
              &larr; Back to home
            </Link>
          )}

          {/* Hero: photo + name + facts */}
          <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-start">
            <div className="aspect-[4/5] bg-[#f5f0e8] overflow-hidden relative">
              {photo ? (
                <Image
                  src={photo}
                  alt={displayName}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover"
                  priority
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-7xl opacity-25">
                  👤
                </div>
              )}
            </div>

            <div className="flex flex-col py-2 md:py-6">
              {isDeparted && (
                <div className="mb-4 p-4 border border-[#888] bg-[#f5f0e8]">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#666] mb-1">
                    No longer at the campus
                  </p>
                  {f.DepartureNote && (
                    <p
                      className="text-sm text-[#444] leading-relaxed"
                      style={{ fontFamily: 'var(--font-lora), serif' }}
                    >
                      {f.DepartureNote}
                    </p>
                  )}
                </div>
              )}

              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-3">
                Meet
              </p>
              <h1
                className="text-4xl md:text-5xl text-[#0d0d0d] mb-3 leading-tight"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                {displayName}
              </h1>

              {f.NameMeaning && (
                <p
                  className="text-base text-[#666] italic leading-relaxed mb-4"
                  style={{ fontFamily: 'var(--font-lora), serif' }}
                >
                  {f.NameMeaning}
                </p>
              )}

              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-[#666] mb-6">
                {age && (
                  <span>
                    <span className="font-bold text-[#0d0d0d]">{age}</span> years old
                  </span>
                )}
                {f.GradeClass && (
                  <span>
                    <span className="font-bold text-[#0d0d0d]">{f.GradeClass}</span>
                  </span>
                )}
                {f.HomeVillage && (
                  <span>From <span className="font-bold text-[#0d0d0d]">{f.HomeVillage}</span></span>
                )}
              </div>

              {f.ChildQuote && (
                <blockquote
                  className="border-l-3 border-[#D4A843] pl-5 mb-6 text-lg md:text-xl text-[#333] italic leading-relaxed"
                  style={{ fontFamily: 'var(--font-lora), serif' }}
                >
                  &ldquo;{f.ChildQuote}&rdquo;
                  <footer className="text-xs text-[#888] font-normal not-italic mt-2 uppercase tracking-wider">
                    — {firstName}
                  </footer>
                </blockquote>
              )}

              {!isDeparted && viewerRel?.kind === 'sponsor' && (
                <div className="mt-2 bg-white border-2 border-[#D4A843]/30 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843] mb-2">
                    You sponsor {firstName}
                  </p>
                  <p
                    className="text-xl text-[#0d0d0d] mb-2"
                    style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                  >
                    Through your ${viewerRel.monthlyAmount}/month, {firstName} is
                    in school, fed, and seen by a doctor.
                  </p>
                  <p className="text-xs text-[#888]">
                    Manage your subscription or download a giving
                    statement from{' '}
                    <Link href="/me" className="text-[#D4A843] hover:underline font-bold">
                      Your kids
                    </Link>{' '}
                    in the nav.
                  </p>
                </div>
              )}
              {!isDeparted && viewerRel?.kind === 'holder' && (
                <div className="mt-2 bg-white border-2 border-[#D4A843]/30 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843] mb-2">
                    {firstName} is yours
                  </p>
                  <p
                    className="text-sm text-[#555] leading-relaxed mb-4"
                  >
                    You hold {firstName}&rsquo;s number. Whenever you&rsquo;re
                    ready, $25/month keeps {firstName} in school, fed,
                    and seen by a doctor. No pressure to decide today.
                  </p>
                  <MeetSponsorButton
                    childRecordId={record.id}
                    childId={f.ChildID || ''}
                    childDisplayName={displayName}
                    firstName={firstName}
                  />
                </div>
              )}
              {!isDeparted && !viewerRel && isSignedIn && (
                <div className="mt-2 bg-[#FFF8F0] border-2 border-[#D4A843] p-5">
                  <p
                    className="text-xl text-[#0d0d0d] mb-2"
                    style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                  >
                    Sponsor {firstName}.
                  </p>
                  <p className="text-sm text-[#555] leading-relaxed mb-4">
                    $25/month keeps {firstName} in school, fed, and seen
                    by a doctor. Cancel anytime. {firstName} gets
                    added to your Number.
                  </p>
                  <MeetSponsorButton
                    childRecordId={record.id}
                    childId={f.ChildID || ''}
                    childDisplayName={displayName}
                    firstName={firstName}
                  />
                </div>
              )}
              {!isDeparted && !viewerRel && !isSignedIn && (
                <div className="mt-2 bg-[#FFF8F0] border-2 border-[#D4A843] p-5">
                  <p
                    className="text-xl text-[#0d0d0d] mb-2"
                    style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                  >
                    Meet {firstName}.
                  </p>
                  <p className="text-sm text-[#555] leading-relaxed mb-4">
                    Every relationship at the campus starts with a
                    Shirt. Get one — yours comes with a Number,
                    your Number is a Child, and you can add {firstName}{' '}
                    once you&rsquo;re on the campus.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Link
                      href="/shirts"
                      className="inline-block text-center w-full sm:w-auto px-5 py-3 bg-[#D4A843] hover:bg-[#c49a3a] text-[#0d0d0d] font-bold text-xs uppercase tracking-wider transition-colors"
                    >
                      Get a Shirt
                    </Link>
                    <Link
                      href="/"
                      className="inline-block text-center w-full sm:w-auto px-5 py-3 border border-[#e8e0d4] hover:border-[#D4A843] text-[#0d0d0d] font-bold text-xs uppercase tracking-wider transition-colors"
                    >
                      Already have a Number?
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Structured intake blocks */}
          {(f.FamilyContext || f.Loves) && (
            <div className="mt-12 md:mt-16 grid md:grid-cols-2 gap-8">
              {f.FamilyContext && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">
                    Family
                  </p>
                  <p
                    className="text-base md:text-[17px] text-[#333] leading-relaxed"
                    style={{ fontFamily: 'var(--font-lora), serif' }}
                  >
                    {f.FamilyContext}
                  </p>
                </div>
              )}
              {f.Loves && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">
                    Loves
                  </p>
                  <p
                    className="text-base md:text-[17px] text-[#333] leading-relaxed"
                    style={{ fontFamily: 'var(--font-lora), serif' }}
                  >
                    {f.Loves}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Teacher quote */}
          {f.TeacherQuote && (
            <div className="mt-10 md:mt-14 bg-white border border-[#e8e0d4] p-6 md:p-9">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">
                From {firstName}&rsquo;s teacher
              </p>
              <blockquote
                className="text-lg md:text-xl text-[#333] italic leading-relaxed"
                style={{ fontFamily: 'var(--font-lora), serif' }}
              >
                &ldquo;{f.TeacherQuote}&rdquo;
              </blockquote>
              {f.TeacherName && (
                <p className="text-xs text-[#888] mt-3 uppercase tracking-wider">
                  — {f.TeacherName}
                </p>
              )}
            </div>
          )}

          {/* Notes fallback */}
          {f.Notes && !f.FamilyContext && !f.Loves && (
            <div className="mt-12 max-w-3xl">
              <p
                className="text-base md:text-[17px] text-[#333] leading-relaxed whitespace-pre-line"
                style={{ fontFamily: 'var(--font-lora), serif' }}
              >
                {f.Notes}
              </p>
            </div>
          )}
        </div>

        {/* Kids you've met */}
        <RecentKidsStrip />
      </main>
      <BANFooter />
    </div>
  );
}
