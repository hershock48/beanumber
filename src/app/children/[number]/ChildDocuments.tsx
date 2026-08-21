/**
 * Report cards + letters for one kid, rendered on /children/[N].
 *
 * These are the files Simon uploads through /admin/roster/[number].
 * The upload endpoint stores them on children.report_card_urls /
 * children.letter_urls and immediately emails every active sponsor
 * "<kid>'s report card is up — it's on their page now." Between the
 * June 2026 Postgres migration and this component, that sentence was
 * false: the page projected both columns to [] and nothing rendered
 * them. This is the missing half.
 *
 * Visibility is decided in page.tsx (sponsor or number-holder only)
 * and enforced by never putting the URLs in the payload for anyone
 * else — the Supabase Storage links are public-by-URL.
 */

interface Attachment {
  id: string;
  url: string;
  filename: string;
  size?: number;
  type?: string;
}

interface ChildDocumentsProps {
  firstName: string;
  reportCards: Attachment[];
  letters: Attachment[];
}

function formatSize(bytes?: number): string | null {
  if (typeof bytes !== 'number' || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(a: Attachment): boolean {
  if (a.type?.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|heic)$/i.test(a.filename || a.url);
}

function DocumentList({
  label,
  items,
}: {
  label: string;
  items: Attachment[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="bg-white border border-[#e8e0d4] p-5 md:p-7">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-4">
        {label}
      </p>
      <div className="space-y-3">
        {items.map(item => {
          const size = formatSize(item.size);
          return (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 border border-[#e8e0d4] hover:border-[#D4A843] transition-colors p-3 group"
            >
              <div className="w-16 h-16 flex-shrink-0 bg-[#f5f0e8] border border-[#e8e0d4] overflow-hidden flex items-center justify-center">
                {isImage(item) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.url}
                    alt={item.filename}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#b9ac95]">
                    {(item.filename.split('.').pop() || 'file').slice(0, 4)}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm md:text-base text-[#0d0d0d] truncate group-hover:text-[#D4A843] transition-colors">
                  {item.filename}
                </p>
                <p className="text-xs text-[#999] mt-0.5">
                  {size ? `${size} · ` : ''}Tap to open
                </p>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

export function ChildDocuments({
  firstName,
  reportCards,
  letters,
}: ChildDocumentsProps) {
  if (reportCards.length === 0 && letters.length === 0) return null;
  return (
    <div className="mt-8 md:mt-10 space-y-6 md:space-y-8">
      <DocumentList
        label={`${firstName}'s report cards`}
        items={reportCards}
      />
      <DocumentList label={`Letters from ${firstName}`} items={letters} />
    </div>
  );
}
