import { notFound } from 'next/navigation';
import Link from 'next/link';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';
import { RevealBeacon } from './RevealBeacon';

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

    const child = childRes.records[0].fields;
    const childId = child.ChildID;

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
      child_id: childId || `CHILD-${shirtNumber}`,
      display_name: child.DisplayName || `${child.FirstName || 'Child'} ${child.LastInitial || ''}`.trim(),
      first_name: child.FirstName,
      age,
      grade_class: child.GradeClass,
      fun_fact: child.Notes,
      photo_url: photo,
      location: sponsorship?.ChildLocation || 'Gulu, Northern Uganda',
      sponsorship_status: sponsorship?.Status,
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
  if (isNaN(num)) notFound();

  const child = await getChildByShirtNumber(num);
  if (!child) notFound();

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
            Back to all children
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
  const photoUrl = child.photo_url || '/images/child-placeholder.jpg';

  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      {/* Silently flip the sponsor's ChildRevealedAt if they're logged in
          and this number matches their assignment. Renders nothing. */}
      <RevealBeacon number={Number(number)} />

      <BANNavigation currentPath={'/children/' + number} />

      <main className="max-w-5xl mx-auto px-5 py-10 md:py-16">
        {/* Breadcrumb */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-[#aaa] hover:text-[#D4A843] transition-colors mb-8"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to all children
        </Link>

        <div className="grid md:grid-cols-2 gap-10 md:gap-14 items-start">
          {/* Photo */}
          <div className="aspect-[4/5] bg-[#f5f0e8] border border-[#e8e0d4] overflow-hidden relative">
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
          <div className="flex flex-col justify-center py-4">
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

            {child.fun_fact && (
              <div className="bg-white border border-[#e8e0d4] p-5 mb-8">
                <p className="text-[#666] italic leading-relaxed">
                  &ldquo;{child.fun_fact}&rdquo;
                </p>
              </div>
            )}

            {/* About the location */}
            <div className="mb-8">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-2">
                {child.location}
              </h2>
              <p className="text-[#777] text-sm leading-relaxed">
                {displayName} lives in a community rebuilding after decades of conflict.
                Your sponsorship provides daily access to education, nutritious meals,
                and a personal mentor.
              </p>
            </div>

            {/* Sponsorship card */}
            <div className="bg-white border border-[#e8e0d4] p-7">
              <p
                className="text-xl text-[#0d0d0d] mb-1"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Sponsor {displayName}
              </p>
              <div className="flex items-baseline gap-1 mb-2">
                <span
                  className="text-4xl text-[#D4A843]"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
                >
                  $25
                </span>
                <span className="text-[#aaa]">/month</span>
              </div>
              <p className="text-[#777] text-sm mb-6 leading-relaxed">
                Education, meals, and mentorship every month. Plus a monthly newsletter from the campus, photos of your child through the year, a handwritten letter from them, and a year-end report card. No commitment. Adjust or cancel anytime.
              </p>
              <Link
                href={'/sponsorship?child=' + child.child_id + '&name=' + encodeURIComponent(displayName)}
                className="block w-full text-center bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-6 hover:bg-[#c49a3a] transition-colors"
              >
                Become a sponsor
              </Link>
            </div>

            {/* What's included */}
            <div className="mt-8 grid grid-cols-2 gap-4">
              {[
                { icon: '📚', text: 'Daily education' },
                { icon: '🍽️', text: 'Nutritious meals' },
                { icon: '🤝', text: 'Personal mentor' },
                { icon: '📬', text: 'Progress updates' },
              ].map(item => (
                <div key={item.text} className="flex items-center gap-3 text-sm text-[#777]">
                  <span className="text-lg">{item.icon}</span>
                  {item.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <BANFooter />
    </div>
  );
}
