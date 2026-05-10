import { notFound } from 'next/navigation';
import Link from 'next/link';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';
import { RevealBeacon } from './RevealBeacon';
import { RevealOverlay } from './RevealOverlay';
import { SponsorButton } from './SponsorButton';

// Never statically optimize or cache this page. Sponsorship status and child
// data changes over time, and a stale empty cache entry would manifest as a
// false 404 on active numbers.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface ChildPageProps {
  params: Promise<{ number: string }>;
}

interface AirtableChildRecord {
  id: string;
  fields: {
    ChildID?: string;
    DisplayName?: string;
    FirstName?: string;
    LastInitial?: string;
    ShirtNumber?: number;
    GradeClass?: string;
    ProfilePhoto?: Array<{ url: string; filename: string }>;
    Notes?: string;
    Status?: string;
    DateOfBirth?: string;
    ReservedForAuction?: boolean;
    ShirtAssignedAt?: string;
    // ── Structured profile fields populated via the YDO intake form.
    // Rendered conditionally on the profile page — empty = hidden block.
    HomeVillage?: string;
    FamilyContext?: string;
    Loves?: string;
    ChildQuote?: string;
    TeacherName?: string;
    TeacherQuote?: string;
  };
}

interface AirtableSponsorshipRecord {
  id: string;
  fields: {
    ChildID?: string;
    ChildDisplayName?: string;
    ChildAge?: string;
    ChildLocation?: string;
    ChildPhoto?: Array<{ url: string; filename: string }>;
    Status?: string;
  };
}

async function airtableRequest<T>(endpoint: string): Promise<T> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) {
    console.error('[children/page] Airtable not configured', {
      hasKey: !!apiKey,
      hasBase: !!baseId,
    });
    throw new Error('Airtable not configured');
  }

  const url = `https://api.airtable.com/v0/${baseId}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    // Always fetch fresh. A stale empty response would surface as a false 404.
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error('[children/page] Airtable error', {
      url,
      status: response.status,
      body: body.slice(0, 500),
    });
    throw new Error(`Airtable error: ${response.status}`);
  }
  return response.json();
}

async function getChildByShirtNumber(shirtNumber: number) {
  const childrenTable = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';

  try {
    const formula = encodeURIComponent(`{ShirtNumber}=${shirtNumber}`);
    const childRes = await airtableRequest<{ records: AirtableChildRecord[] }>(
      `/${encodeURIComponent(childrenTable)}?filterByFormula=${formula}&maxRecords=1`
    );

    if (!childRes.records.length) {
      console.warn('[children/page] No child record found for shirt number', {
        shirtNumber,
        table: childrenTable,
      });
      return null;
    }

    const childRecord = childRes.records[0];
    const child = childRecord.fields;
    const childId = child.ChildID;
    const recordId = childRecord.id;

    // Reserved-for-auction numbers short-circuit here. The Child record exists
    // to hold the number, but we don't want to expose placeholder details
    // publicly. Caller will render a dedicated "reserved" view instead.
    if (child.ReservedForAuction) {
      return {
        reserved: true as const,
        child_id: childId || `RESERVED-${shirtNumber}`,
        display_name: '',
        first_name: undefined,
        age: undefined,
        grade_class: undefined,
        fun_fact: undefined,
        photo_url: undefined,
        location: 'Gulu, Northern Uganda',
        sponsorship_status: undefined,
      };
    }

    let sponsorship: AirtableSponsorshipRecord['fields'] | null = null;
    if (childId) {
      const sponsorshipTable = process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';
      const sFormula = encodeURIComponent(`{ChildID}="${childId}"`);
      try {
        const sRes = await airtableRequest<{ records: AirtableSponsorshipRecord[] }>(
          `/${encodeURIComponent(sponsorshipTable)}?filterByFormula=${sFormula}&maxRecords=1`
        );
        if (sRes.records.length) {
          sponsorship = sRes.records[0].fields;
        }
      } catch {
        // Sponsorship lookup is optional
      }
    }

    let age: string | undefined = sponsorship?.ChildAge;
    if (!age && child.DateOfBirth) {
      const birthDate = new Date(child.DateOfBirth);
      const today = new Date();
      const years = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      age = String(monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate()) ? years - 1 : years);
    }

    const photo = child.ProfilePhoto?.[0]?.url || sponsorship?.ChildPhoto?.[0]?.url;

    return {
      reserved: false as const,
      record_id: recordId,
      child_id: childId || `CHILD-${shirtNumber}`,
      display_name: child.DisplayName || `${child.FirstName || 'Child'} ${child.LastInitial || ''}`.trim(),
      first_name: child.FirstName,
      age,
      grade_class: child.GradeClass,
      fun_fact: child.Notes,
      photo_url: photo,
      location: sponsorship?.ChildLocation || 'Gulu, Northern Uganda',
      sponsorship_status: sponsorship?.Status,
      // True when a shirt buyer has been matched to this number. Used on the
      // profile page to reframe the CTA from cold acquisition ("Sponsor
      // [name]") to warm retention ("You already gave [name] a month").
      shirt_assigned: Boolean(child.ShirtAssignedAt),
      // Structured intake fields — any may be empty; the page renders each
      // block conditionally so a half-filled profile still looks intentional.
      home_village: child.HomeVillage,
      family_context: child.FamilyContext,
      loves: child.Loves,
      child_quote: child.ChildQuote,
      teacher_name: child.TeacherName,
      teacher_quote: child.TeacherQuote,
    };
  } catch (error) {
    console.error('[children/page] Error fetching child', {
      shirtNumber,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function generateMetadata({ params }: ChildPageProps) {
  const { number } = await params;
  const num = parseInt(number, 10);
  if (isNaN(num)) return { title: 'Child Not Found' };

  const child = await getChildByShirtNumber(num);
  if (!child) return { title: 'Child Not Found' };

  if (child.reserved) {
    return {
      title: `Shirt #${number} is reserved`,
      description: `Shirt #${number} is held for a live auction. The winner will be matched to a child in Northern Uganda.`,
    };
  }

  // Keep metadata intentionally generic: this URL is sometimes shared before a
  // shirt buyer has opened their shirt, and we don't want a link preview card
  // to spoil the reveal. The child's name and photo only appear in the page
  // body itself — by then the viewer has already chosen to meet them.
  return {
    title: 'Be A Number · Meet your child',
    description:
      'A real child at YDO in Gulu, Uganda. Enter your shirt number to meet them and keep their story going for $25/month.',
    openGraph: {
      title: 'Be A Number',
      description:
        'A real child at YDO in Gulu, Uganda. Enter your shirt number to meet them.',
      images: undefined,
    },
    twitter: {
      card: 'summary',
      title: 'Be A Number',
      description:
        'A real child at YDO in Gulu, Uganda. Enter your shirt number to meet them.',
    },
  };
}

export default async function ChildProfilePage({ params }: ChildPageProps) {
  const { number } = await params;
  const num = parseInt(number, 10);
  // Treat non-numeric input the same as "not found" — show the friendly page,
  // not a hard 404 that makes people think the site is broken.
  const child = !isNaN(num) ? await getChildByShirtNumber(num) : null;

  // Instead of a 404, show a warm "not found" view. Someone may have typed
  // the wrong number, or this shirt number hasn't been assigned yet.
  if (!child) {
    return (
      <div className="min-h-screen bg-[#FFF8F0]">
        <BANNavigation currentPath={'/children/' + number} />

        <main className="max-w-3xl mx-auto px-5 py-16 md:py-24">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-[#aaa] hover:text-[#D4A843] transition-colors mb-10"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to home
          </Link>

          <div className="text-center mb-16">
            <h1
              className="text-4xl md:text-5xl text-[#0d0d0d] mb-4"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              We don&rsquo;t have a #{number} yet
            </h1>

            <p className="text-lg text-[#666] leading-relaxed max-w-xl mx-auto mb-4">
              Double-check your shirt tag &mdash; the number is printed on the inside label.
              If you&rsquo;re sure it&rsquo;s #{number}, reach out and we&rsquo;ll sort it out.
            </p>

            <p className="text-[#999] mb-10">
              <a href="mailto:Kevin@beanumber.org" className="text-[#D4A843] hover:underline">Kevin@beanumber.org</a>
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/shirts"
                className="inline-block bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-8 hover:bg-[#c49a3a] transition-colors"
              >
                Browse shirts
              </Link>
              <Link
                href="/"
                className="inline-block bg-white border border-[#e8e0d4] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-8 hover:bg-[#f5f0e8] transition-colors"
              >
                Back to home
              </Link>
            </div>
          </div>

          {/* How the number works — gives the page substance and context
              for people who landed here without a shirt. */}
          <div className="bg-white border border-[#e8e0d4] p-8 md:p-10 mb-12">
            <h2
              className="text-2xl text-[#0d0d0d] mb-4"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              How the number works
            </h2>
            <p className="text-[#666] leading-relaxed mb-4">
              Every Be A Number shirt has a unique number stamped on the inside collar.
              That number belongs to a real child at our campus in Omoro District, Northern Uganda.
              When you enter it here, you meet them &mdash; their name, their face, their story.
            </p>
            <p className="text-[#666] leading-relaxed">
              Your $25 covers the shirt and sponsors that child for your first month of school,
              meals, and medical care. Continue at $25/month and you stay connected to their
              story all year &mdash; a monthly campus newsletter, photos, a handwritten letter
              from your child, and a year-end report card.
            </p>
          </div>

          {/* Don't have a shirt yet? — conversion path for curious visitors. */}
          <div className="text-center">
            <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.2em] mb-3">
              Don&rsquo;t have a shirt yet?
            </p>
            <h2
              className="text-2xl md:text-3xl text-[#0d0d0d] mb-4"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              Get one. Meet your child.
            </h2>
            <p className="text-[#666] leading-relaxed max-w-lg mx-auto mb-8">
              Six designs. Five colors. Heavyweight cotton, HTV vinyl, handmade to order.
              Every shirt funds a real child&rsquo;s education, meals, and medical care for a month.
            </p>
            <Link
              href="/shirts"
              className="inline-block bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-10 hover:bg-[#c49a3a] transition-colors"
            >
              Shop the collection
            </Link>
          </div>
        </main>

        <BANFooter />
      </div>
    );
  }

  // Reserved-for-auction numbers get a dedicated view. The Child record exists
  // in Airtable only to hold the number, so we don't expose a profile.
  if (child.reserved) {
    return (
      <div className="min-h-screen bg-[#FFF8F0]">
        <BANNavigation currentPath={'/children/' + number} />

        <main className="max-w-3xl mx-auto px-5 py-16 md:py-24">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-[#aaa] hover:text-[#D4A843] transition-colors mb-10"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to home
          </Link>

          <div className="text-center">
            <div className="inline-block bg-white border border-[#e8e0d4] px-6 py-3 mb-8">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843]">
                Reserved
              </span>
            </div>

            <h1
              className="text-4xl md:text-5xl text-[#0d0d0d] mb-4"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              Shirt #{number} is reserved
            </h1>

            <p className="text-lg text-[#666] leading-relaxed max-w-xl mx-auto mb-10">
              This number is held for a future live auction. The winning bidder will
              be matched to a child in Northern Uganda, and their profile will appear
              here once the match is made.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/shirts"
                className="inline-block bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-8 hover:bg-[#c49a3a] transition-colors"
              >
                Shop shirts
              </Link>
              <Link
                href="/"
                className="inline-block bg-white border border-[#e8e0d4] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-8 hover:bg-[#f5f0e8] transition-colors"
              >
                Meet the children
              </Link>
            </div>
          </div>
        </main>

        <BANFooter />
      </div>
    );
  }

  const displayName = child.display_name || child.first_name || 'Child';
  const firstName = child.first_name || displayName.split(' ')[0] || 'them';
  const photoUrl = child.photo_url || '/images/child-placeholder.jpg';

  // True if ANY of the structured intake fields are populated. When none
  // are, we fall back to the legacy Notes prose so older records still
  // render something human rather than an empty scaffold.
  const hasStructured = Boolean(
    child.home_village ||
    child.family_context ||
    child.loves ||
    child.child_quote ||
    child.teacher_quote
  );

  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      {/* Silently flip the sponsor's ChildRevealedAt if they're logged in
          and this number matches their assignment. Renders nothing. */}
      <RevealBeacon number={Number(number)} />

      <BANNavigation currentPath={'/children/' + number} />

      <main className="max-w-5xl mx-auto px-5 py-6 md:py-16">
        {/* Breadcrumb */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-[#aaa] hover:text-[#D4A843] transition-colors mb-8"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to home
        </Link>

        <RevealOverlay shirtNumber={Number(number)} childName={displayName}>
        <div className="grid md:grid-cols-2 gap-5 md:gap-14 items-start">
          {/* Photo — shorter on mobile to keep the CTA reachable without
              a marathon scroll. Desktop keeps the taller portrait crop. */}
          <div className="aspect-[4/4] md:aspect-[4/5] bg-[#f5f0e8] border border-[#e8e0d4] overflow-hidden relative">
            {photoUrl.startsWith('http') ? (
              <img
                src={photoUrl}
                alt={displayName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="text-6xl mb-3 opacity-40">👤</div>
                  <p className="text-[#aaa] text-sm">Photo coming soon</p>
                </div>
              </div>
            )}
            {/* Shirt number badge */}
            <div className="absolute top-5 right-5 bg-white/90 backdrop-blur-sm px-4 py-2">
              <span className="text-sm font-bold text-[#D4A843]">#{number}</span>
            </div>
          </div>

          {/* Details */}
          <div className="flex flex-col justify-center py-0 md:py-4">
            <h1
              className="text-4xl md:text-5xl text-[#0d0d0d] mb-3"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              {displayName}
            </h1>

            <div className="flex items-center gap-3 text-[#777] mb-6">
              {child.age && <span className="text-lg">Age {child.age}</span>}
              {child.age && child.grade_class && <span className="text-[#ccc]">&middot;</span>}
              {child.grade_class && <span className="text-lg">{child.grade_class}</span>}
            </div>

            {/* Pull quote from the child — in their own voice. This is the
                single strongest element on the page when it's present. */}
            {child.child_quote && (
              <div className="mb-8">
                <p
                  className="text-2xl md:text-[1.65rem] text-[#0d0d0d] leading-snug"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 500, fontStyle: 'italic' }}
                >
                  &ldquo;{child.child_quote}&rdquo;
                </p>
                <p className="mt-3 text-xs uppercase tracking-[0.2em] text-[#aaa]">
                  — {firstName}
                </p>
              </div>
            )}

            {/* Structured fact lines. Each is its own tiny block so an
                empty field just disappears instead of leaving dead scaffold. */}
            {hasStructured && (
              <div className="mb-8 space-y-4">
                {child.home_village && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">
                      Home
                    </p>
                    <p className="text-[#444] leading-relaxed">{child.home_village}</p>
                  </div>
                )}
                {child.family_context && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">
                      Family
                    </p>
                    <p className="text-[#444] leading-relaxed">{child.family_context}</p>
                  </div>
                )}
                {child.loves && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">
                      About {firstName}
                    </p>
                    <p className="text-[#444] leading-relaxed">{child.loves}</p>
                  </div>
                )}
              </div>
            )}

            {/* Teacher quote — attributed, treated as a second human voice
                on the page. Only appears when TeacherQuote is present. */}
            {child.teacher_quote && (
              <div className="bg-white border border-[#e8e0d4] p-5 mb-8">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">
                  From {firstName}&rsquo;s teacher
                </p>
                <p className="text-[#444] leading-relaxed italic">
                  &ldquo;{child.teacher_quote}&rdquo;
                </p>
                {child.teacher_name && (
                  <p className="mt-3 text-sm text-[#888]">— {child.teacher_name}</p>
                )}
              </div>
            )}

            {/* When no structured intake fields exist, fall back to the
                Notes field (mapped as fun_fact) if it has content. This covers
                children like #37 whose bios were written before the structured
                intake form existed. Only show the "story coming" placeholder
                when Notes is also empty. */}
            {!hasStructured && child.fun_fact && (
              <div className="bg-white border border-[#e8e0d4] p-5 mb-8">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-2">
                  About {firstName}
                </p>
                <p className="text-[#444] leading-relaxed">{child.fun_fact}</p>
              </div>
            )}
            {!hasStructured && !child.fun_fact && (
              <div className="bg-white border border-[#e8e0d4] p-5 mb-8">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-2">
                  {firstName}&rsquo;s story
                </p>
                <p className="text-[#666] leading-relaxed">
                  We&rsquo;re gathering {firstName}&rsquo;s full profile from
                  the campus in Omoro District right now — home, family, what
                  they love, and a note from their teacher. Sponsor them today
                  and we&rsquo;ll send it to you as soon as it&rsquo;s in our
                  hands.
                </p>
              </div>
            )}

            {/* ── Sponsorship CTA ──────────────────────────────────
                Single decision container: what the money does, what the
                sponsor gets back, and the button. No separate "provision"
                paragraph — everything the visitor needs is here. */}
            <div className="bg-white border-2 border-[#D4A843]/30 p-7">
              {child.shirt_assigned ? (
                <p
                  className="text-xl text-[#0d0d0d] mb-4"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                >
                  You gave {firstName} a month of school when you bought your shirt. Keep going.
                </p>
              ) : (
                <p
                  className="text-xl text-[#0d0d0d] mb-4"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                >
                  Sponsor {firstName}
                </p>
              )}

              <p className="text-[#555] leading-relaxed mb-4">
                Your $25/month covers {firstName}&rsquo;s school fees, books,
                a uniform, morning porridge and a hot meal every day, access to
                the on-site medical center, and a place where teachers know{' '}
                {firstName}&rsquo;s name.
              </p>

              <p className="text-[#555] leading-relaxed mb-5">
                You&rsquo;ll get a monthly newsletter from the campus, photos
                of {firstName} through the year, a handwritten letter
                from {firstName}, and a year-end report card.
              </p>

              <div className="flex items-baseline gap-1 mb-4">
                <span
                  className="text-4xl text-[#D4A843]"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
                >
                  $25
                </span>
                <span className="text-[#aaa]">/month &middot; cancel anytime</span>
              </div>

              <SponsorButton
                childRecordId={child.record_id}
                childId={child.child_id}
                childDisplayName={displayName}
                firstName={firstName}
                shirtAssigned={child.shirt_assigned}
              />

              <p className="text-center text-xs text-[#bbb] mt-4">
                On behalf of our entire team &mdash; thank you.
              </p>
            </div>
          </div>
        </div>

        {/* ── Sponsor-gated merch collection ────────────────────
            Three states:
            1. Active sponsor  → unlocked catalog, "I want this" → email Kevin
            2. Shirt buyer     → locked teaser, blurred cards, sponsor CTA
            3. Cold visitor    → nothing (focus stays on sponsorship CTA)
        ── */}
        {child.sponsorship_status === 'Active' ? (
          <div className="mt-10 md:mt-16">
            <div className="text-center mb-6 md:mb-8">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">
                Your #{number} collection
              </p>
              <h2
                className="text-2xl md:text-3xl text-[#0d0d0d] mb-2"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                You&rsquo;re a sponsor. These are yours.
              </h2>
              <p className="text-[#777] text-sm max-w-md mx-auto">
                Every piece is handmade with your number on it. Request what you want and we&rsquo;ll make it.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              {[
                { name: 'Hoodie', slug: 'hoodie', detail: `#${number} on the back`, price: '$45' },
                { name: 'Hat', slug: 'hat', detail: `#${number} front and center`, price: '$30' },
                { name: 'Sticker Pack', slug: 'stickers', detail: 'Laptop, water bottle, wherever', price: '$10' },
                { name: 'Another Shirt', slug: 'shirt', detail: 'Different design, same number', price: '$25' },
              ].map((item) => (
                <a
                  key={item.slug}
                  href={`mailto:Kevin@beanumber.org?subject=${encodeURIComponent(`I want a #${number} ${item.name}`)}&body=${encodeURIComponent(`Hey Kevin,\n\nI'd love a ${item.name.toLowerCase()} with #${number} on it.\n\nThanks!`)}`}
                  className="group block bg-white border border-[#e8e0d4] p-3 md:p-4 hover:border-[#D4A843] transition-colors"
                >
                  <div className="aspect-[4/3] bg-[#f5f0e8] flex items-center justify-center mb-3">
                    <p className="text-3xl md:text-4xl font-bold text-[#D4A843] opacity-30">
                      #{number}
                    </p>
                  </div>
                  <p
                    className="text-sm font-semibold text-[#0d0d0d] mb-0.5"
                    style={{ fontFamily: 'var(--font-lora), serif' }}
                  >
                    {item.name}
                  </p>
                  <p className="text-xs text-[#999] mb-3">{item.detail}</p>
                  <p className="text-xs font-bold text-[#D4A843] uppercase tracking-wider group-hover:text-[#c49a3a] transition-colors">
                    I want this &rarr;
                  </p>
                </a>
              ))}
            </div>
          </div>
        ) : child.shirt_assigned ? (
          <div className="mt-10 md:mt-16">
            <div className="relative">
              {/* Blurred product cards — visible but unreachable */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 opacity-30 blur-[3px] pointer-events-none select-none" aria-hidden>
                {['Hoodie', 'Hat', 'Sticker Pack', 'Another Shirt'].map((name) => (
                  <div key={name} className="bg-white border border-[#e8e0d4] p-3 md:p-4">
                    <div className="aspect-[4/3] bg-[#f5f0e8] flex items-center justify-center mb-3">
                      <p className="text-3xl md:text-4xl font-bold text-[#0d0d0d] opacity-20">
                        #{number}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-[#0d0d0d]" style={{ fontFamily: 'var(--font-lora), serif' }}>
                      {name}
                    </p>
                  </div>
                ))}
              </div>

              {/* Lock overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-white/95 backdrop-blur-sm border border-[#e8e0d4] p-6 md:p-8 text-center max-w-sm mx-4 shadow-lg">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">
                    Your #{number} collection
                  </p>
                  <p
                    className="text-lg md:text-xl text-[#0d0d0d] mb-3"
                    style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                  >
                    Sponsor {firstName} to unlock.
                  </p>
                  <p className="text-[#777] text-sm mb-5 leading-relaxed">
                    Sponsors get exclusive #{number} gear &mdash; hoodies, hats, stickers &mdash; all handmade with your number.
                  </p>
                  <SponsorButton
                    childRecordId={child.record_id}
                    childId={child.child_id}
                    childDisplayName={displayName}
                    firstName={firstName}
                    shirtAssigned={child.shirt_assigned}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        </RevealOverlay>
      </main>

      <BANFooter />
    </div>
  );
}
