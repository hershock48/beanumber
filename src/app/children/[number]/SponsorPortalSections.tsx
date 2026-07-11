/**
 * Server-rendered portal-style content that appears on /[number] when
 * the viewer is verified as the sponsor of this child. Folds onto the
 * page so the kid's number page becomes the sponsor's home for that
 * kid — no separate /sponsor destination required.
 *
 * Sections (each conditional on its source data being present):
 *   - Latest update from this specific child (Child Updates table).
 *
 * The stats strip (days as sponsor / meals / school days / total to
 * campus) was removed 2026-07-10 per Kevin — it read as clutter and
 * competed with the real content (the kid's actual update). The prop,
 * the computeSponsorStats helper in page.tsx, and the values on the
 * child object were all cleaned up in the same pass — no dead work
 * runs on the render path anymore.
 *
 * The campus newsletter used to render here too. It now lives in
 * the public CampusNewsfeed component below this section — visible
 * to anyone, not just sponsors. Report cards + letters stay sponsor-
 * only because they're individual to this kid.
 *
 * Intentionally light. The portal historically had messaging,
 * milestones, request-update flows — we're rebuilding it around real
 * content cadence (monthly newsletter + thrice-yearly per-child
 * updates), not workflow chrome.
 */

interface PortalSectionsProps {
  firstName: string;
  latestChildUpdate: {
    title: string;
    content: string;
    photos: Array<{ url: string; filename?: string }>;
    updateDate?: string;
  } | null;
}

export function SponsorPortalSections({
  firstName,
  latestChildUpdate,
}: PortalSectionsProps) {
  return (
    <div className="mt-10 md:mt-14 space-y-6 md:space-y-8">
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
