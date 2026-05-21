/**
 * Server-rendered portal-style content that appears on /[number] when
 * the viewer is verified as the sponsor of this child. Folds onto the
 * page so the kid's number page becomes the sponsor's home for that
 * kid — no separate /sponsor destination required.
 *
 * Sections (each conditional on its source data being present):
 *   - Stats strip: days as sponsor, meals supported, school days,
 *     dollars to campus. Computed from sponsorship start date.
 *   - Latest update from this specific child (Child Updates table).
 *   - Latest campus newsletter (Newsletters table, applies to all).
 *
 * Intentionally light. The portal historically had messaging,
 * milestones, request-update flows — we're rebuilding it around real
 * content cadence (monthly newsletter + thrice-yearly per-child
 * updates), not workflow chrome.
 */

interface PortalSectionsProps {
  firstName: string;
  stats: {
    daysAsSponsor: number;
    mealsSupported: number;
    schoolDaysSupported: number;
    totalContributedUsd: number;
  };
  latestChildUpdate: {
    title: string;
    content: string;
    photos: Array<{ url: string; filename?: string }>;
    updateDate?: string;
  } | null;
  latestNewsletter: {
    title: string;
    subject: string;
    bodyHtml: string;
    heroPhotoUrl?: string;
    publishedAt?: string;
  } | null;
}

export function SponsorPortalSections({
  firstName,
  stats,
  latestChildUpdate,
  latestNewsletter,
}: PortalSectionsProps) {
  return (
    <div className="mt-10 md:mt-14 space-y-6 md:space-y-8">
      {/* ── Stats strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        <StatCard label="days as sponsor" value={stats.daysAsSponsor.toString()} />
        <StatCard label="meals supported" value={stats.mealsSupported.toLocaleString()} />
        <StatCard label="school days" value={stats.schoolDaysSupported.toString()} />
        <StatCard label="total to campus" value={`$${stats.totalContributedUsd}`} />
      </div>

      {/* ── Latest update for this specific kid ─────────────────── */}
      {latestChildUpdate && (
        <div className="bg-white border border-[#e8e0d4] p-5 md:p-7">
          <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843]">
              Latest from {firstName}
            </p>
            {latestChildUpdate.updateDate && (
              <p className="text-xs text-[#aaa]">
                {formatDate(latestChildUpdate.updateDate)}
              </p>
            )}
          </div>
          {latestChildUpdate.title && (
            <p
              className="text-lg md:text-xl text-[#0d0d0d] mb-2"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              {latestChildUpdate.title}
            </p>
          )}
          {latestChildUpdate.content && (
            <p className="text-[#555] leading-relaxed text-sm md:text-base whitespace-pre-line">
              {latestChildUpdate.content}
            </p>
          )}
          {latestChildUpdate.photos.length > 0 && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
              {latestChildUpdate.photos.slice(0, 6).map((photo, idx) => (
                <a
                  key={`${photo.url}-${idx}`}
                  href={photo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block aspect-[4/3] bg-[#f5f0e8] border border-[#e8e0d4] overflow-hidden hover:opacity-90 transition-opacity"
                >
                  <img
                    src={photo.url}
                    alt={photo.filename || `Update photo ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Latest campus newsletter (applies to all sponsors) ─── */}
      {latestNewsletter && latestNewsletter.bodyHtml && (
        <div className="bg-white border border-[#e8e0d4] p-5 md:p-7">
          <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843]">
              From the campus
            </p>
            {latestNewsletter.publishedAt && (
              <p className="text-xs text-[#aaa]">
                {formatDate(latestNewsletter.publishedAt)}
              </p>
            )}
          </div>
          <p
            className="text-lg md:text-xl text-[#0d0d0d] mb-3"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            {latestNewsletter.subject || latestNewsletter.title}
          </p>
          {latestNewsletter.heroPhotoUrl && (
            <div className="mb-4 aspect-[16/9] bg-[#f5f0e8] border border-[#e8e0d4] overflow-hidden">
              <img
                src={latestNewsletter.heroPhotoUrl}
                alt="Campus update photo"
                className="w-full h-full object-cover"
              />
            </div>
          )}
          {/* Newsletter body is authored HTML — Kevin writes inside Airtable
              and we trust the source. If we ever accept external authors
              here, swap to a sanitizing renderer. */}
          <div
            className="text-[#444] leading-relaxed text-sm md:text-base ban-newsletter-body"
            dangerouslySetInnerHTML={{ __html: latestNewsletter.bodyHtml }}
          />
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-[#e8e0d4] px-3 py-3 md:py-4 text-center">
      <p
        className="text-2xl md:text-[28px] text-[#D4A843] leading-none"
        style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
      >
        {value}
      </p>
      <p className="text-[10px] md:text-[11px] uppercase tracking-[0.12em] text-[#888] mt-1.5">
        {label}
      </p>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}
