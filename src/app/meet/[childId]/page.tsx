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
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;
  const record = await fetchChild(childId);
  if (!record) notFound();

  const f = record.fields;
  const firstName = f.FirstName || f.DisplayName?.split(' ')[0] || 'Them';
  const displayName = f.DisplayName || firstName;
  const photo = f.ProfilePhoto?.[0]?.url;
  const age = computeAge(f.DateOfBirth);
  const isDeparted = !!f.DepartedAt;

  return (
    <div className="bg-[#FFF8F0] min-h-screen flex flex-col">
      <BANNavigation />
      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-5 py-8 md:py-14">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs text-[#888] hover:text-[#0d0d0d] uppercase tracking-[0.15em] font-bold mb-6"
          >
            &larr; Back to home
          </Link>

          {/* Hero: photo + name + facts */}
          <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-start">
            <div className="aspect-[4/5] bg-[#f5f0e8] overflow-hidden">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo}
                  alt={displayName}
                  className="w-full h-full object-cover"
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

              {!isDeparted && (
                <div className="mt-2 bg-[#FFF8F0] border-2 border-[#D4A843] p-5">
                  <p
                    className="text-xl text-[#0d0d0d] mb-2"
                    style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                  >
                    Sponsor {firstName}.
                  </p>
                  <p className="text-sm text-[#555] leading-relaxed mb-4">
                    $25/month keeps {firstName} in school, fed, and seen
                    by a doctor. Cancel anytime.
                  </p>
                  <Link
                    href={`/sponsorship?kid=${encodeURIComponent(record.id)}`}
                    className="inline-block w-full text-center px-5 py-3 bg-[#D4A843] hover:bg-[#c49a3a] text-[#0d0d0d] font-bold text-xs uppercase tracking-wider transition-colors"
                  >
                    Start sponsoring {firstName} — $25/mo
                  </Link>
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
