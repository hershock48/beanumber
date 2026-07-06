'use client';

/**
 * ShareKidCard — sponsor's marketing tool. Renders a 1080×1080 PNG in
 * the browser via <canvas>, ready to download and drop into Instagram
 * or a text thread. The image says "I'm sponsoring [Kid]'s education
 * at the campus" and points back to beanumber.org/children/[N].
 *
 * The viral loop this sits inside
 * ───────────────────────────────
 * Kevin's whole retention/growth flywheel is: sponsor gets emotionally
 * connected to a specific named kid → sponsor shares that kid with
 * their network → someone in that network clicks through and becomes
 * a sponsor themselves. This is the "share" arrow in that loop. It
 * only exists on /children/[N] pages that the viewer already has a
 * sponsorship or holder tie to — so the "I'm sponsoring" copy is
 * always true from the person hitting Download.
 *
 * Why canvas, not a server ImageResponse
 * ──────────────────────────────────────
 * Satori (the engine behind next/og) requires fonts loaded as
 * ArrayBuffers at every request. We already have Lora loaded in the
 * browser via next/font/google — using it there is one less network
 * dependency, no cold-start cost on the API, and the sponsor already
 * has the fonts warm from browsing the site. Trade-off: no OG preview
 * image URL for Twitter/Facebook link cards, but that's a separate
 * problem that /children/[N]'s own metadata already handles.
 *
 * Photo handling
 * ──────────────
 * Kid photos live on Supabase Storage which serves CORS-friendly
 * responses. We set crossOrigin='anonymous' so toDataURL doesn't
 * throw a taint exception. If the photo fails to load — CORS,
 * network — we still render the card with a placeholder tile so
 * the sponsor always gets SOMETHING they can share.
 *
 * Share targets
 * ─────────────
 *   - Web Share API with file support (modern iOS/Android + some
 *     desktops): opens the native share sheet, sponsor picks IG /
 *     Messages / whatever.
 *   - Everyone else: PNG download. Works on desktop; on mobile it
 *     saves to Photos / Files.
 *   - Plus a "copy link" for the kid page itself, since Instagram bio
 *     links or a story sticker can carry a URL.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';

interface ShareKidCardProps {
  firstName: string;
  displayName: string;
  photoUrl: string | null;
  shirtNumber: number;
}

const CARD_SIZE = 1080;
const PHOTO_HEIGHT = 648; // 60% of card

export function ShareKidCard({
  firstName,
  displayName,
  photoUrl,
  shirtNumber,
}: ShareKidCardProps) {
  const [open, setOpen] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

  // Normalized filename base — used for both the download link and
  // the Web Share File. Previously the download path normalized
  // (José → jose) while the share path passed the raw firstName, so
  // the two flows produced different filenames from the same card.
  const filenameBase = useMemo(() => {
    const base = firstName
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    return base || 'kid';
  }, [firstName]);
  const kidPageUrl = `https://www.beanumber.org/children/${shirtNumber}`;

  // Web Share API feature detection. We probe with a tiny 1x1 PNG
  // file because navigator.canShare(...) requires a File instance —
  // just checking that navigator.share exists isn't enough to know
  // whether *file* sharing is supported (Safari desktop has share
  // but no file support).
  useEffect(() => {
    try {
      const probe = new File(
        [new Uint8Array([137, 80, 78, 71])],
        'probe.png',
        { type: 'image/png' }
      );
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [probe] })
      ) {
        setCanShareFiles(true);
      }
    } catch {
      // Silently fall back to download-only UX.
    }
  }, []);

  // Draw the card whenever the modal opens. We regenerate rather than
  // caching so a photo swap (rare, but possible) reflects immediately
  // without a page reload.
  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setRendering(true);
    try {
    // Resolve Lora's actual font-family name from the CSS variable
    // set by next/font/google in layout.tsx (variable: "--font-lora").
    // The variable resolves to a scrambled family list — something
    // like "__Lora_1234ab, __Lora_Fallback_1234ab" — because next/font
    // hashes the CSS classname. Canvas ctx.font can't use the literal
    // string "Lora" (nothing with that family name is loaded), so we
    // read the resolved CSS value and interpolate. Falls back to
    // Georgia if the variable isn't set (e.g., in an SSR-only
    // rendering path, though this component is 'use client').
    const loraFamily =
      typeof window !== 'undefined'
        ? getComputedStyle(document.body).getPropertyValue('--font-lora').trim()
        : '';
    const nameFontFamily = loraFamily
      ? `${loraFamily}, Georgia, serif`
      : 'Georgia, serif';

    // Wait for the browser's font swap to complete before we paint text.
    // next/font uses display: "swap" so the initial paint is Georgia
    // and Lora fades in later. If we draw before the swap lands, the
    // sponsor gets a Lora-branded button but a Georgia-rendered image.
    // document.fonts.ready resolves once all pending font loads are done.
    try {
      if (typeof document !== 'undefined' && document.fonts?.ready) {
        await document.fonts.ready;
      }
    } catch {
      // Some browsers don't expose FontFaceSet; drawing with fallback
      // is fine.
    }

    canvas.width = CARD_SIZE;
    canvas.height = CARD_SIZE;

    // Cream background — matches the site's #FFF8F0. The bottom
    // portion below the photo band shows this directly.
    ctx.fillStyle = '#FFF8F0';
    ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);

    // Photo band. Cover-fit into the top 60%. If the photo fails to
    // load (CORS, dead URL, missing), we draw a soft placeholder so
    // the composition doesn't collapse into text-only.
    let photoDrawn = false;
    if (photoUrl) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        // 8s ceiling on the photo load. Without this, a stalled CDN
        // or a black-hole URL (DNS resolves but connection never
        // completes) leaves the promise pending indefinitely — the
        // 'Rendering…' spinner sticks and both action buttons stay
        // disabled. On timeout we fall through to the placeholder
        // tile so the sponsor still gets a card they can share.
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error('photo load timeout'));
          }, 8000);
          img.onload = () => {
            clearTimeout(timer);
            resolve();
          };
          img.onerror = () => {
            clearTimeout(timer);
            reject(new Error('photo load failed'));
          };
          img.src = photoUrl;
        });
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          const targetAR = CARD_SIZE / PHOTO_HEIGHT;
          const sourceAR = img.naturalWidth / img.naturalHeight;
          let sx: number, sy: number, sw: number, sh: number;
          if (sourceAR > targetAR) {
            // Photo is wider than target — crop sides, use full height.
            sh = img.naturalHeight;
            sw = sh * targetAR;
            sx = (img.naturalWidth - sw) / 2;
            sy = 0;
          } else {
            // Photo is taller — crop top/bottom, use full width. Bias
            // slightly toward the top so faces don't get cropped out.
            sw = img.naturalWidth;
            sh = sw / targetAR;
            sx = 0;
            sy = Math.max(0, (img.naturalHeight - sh) * 0.25);
          }
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, CARD_SIZE, PHOTO_HEIGHT);
          photoDrawn = true;
        }
      } catch {
        photoDrawn = false;
      }
    }
    if (!photoDrawn) {
      // Sand-tone placeholder tile with a subtle silhouette so the
      // card still reads as "a person" even without their photo.
      ctx.fillStyle = '#e8e0d4';
      ctx.fillRect(0, 0, CARD_SIZE, PHOTO_HEIGHT);
      ctx.fillStyle = '#c9beac';
      ctx.font = 'bold 200px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(firstName.charAt(0).toUpperCase(), CARD_SIZE / 2, PHOTO_HEIGHT / 2);
    }

    // Gold accent band between photo and caption — matches the
    // #D4A843 label color used across the site.
    ctx.fillStyle = '#D4A843';
    ctx.fillRect(0, PHOTO_HEIGHT, CARD_SIZE, 8);

    // Small "BE A NUMBER" wordmark, upper-left of the caption zone.
    // Uppercase, gold, tracked wide — same treatment as the kicker
    // labels on the /me KidCards.
    ctx.fillStyle = '#D4A843';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    // Approximate letter-spacing by drawing character by character.
    // Canvas has no native letter-spacing shim.
    const wordmark = 'BE A NUMBER';
    const wordmarkTracking = 6;
    let wmX = 60;
    const wmY = PHOTO_HEIGHT + 40;
    for (const ch of wordmark) {
      ctx.fillText(ch, wmX, wmY);
      wmX += ctx.measureText(ch).width + wordmarkTracking;
    }

    // Kid's first name — Lora via the resolved next/font family name,
    // Georgia otherwise. See the loraFamily lookup above for why we
    // can't just say "Lora" here.
    ctx.fillStyle = '#0d0d0d';
    ctx.font = `bold 88px ${nameFontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(firstName, CARD_SIZE / 2, PHOTO_HEIGHT + 100);

    // Copy line — Kevin's voice: personal, direct, specific location.
    // "I'm sponsoring [Kid]'s education at the campus in Northern
    // Uganda." Split across two lines because it reads better on a
    // 1080-wide poster than a single very-long line.
    ctx.fillStyle = '#333333';
    ctx.font = '34px Georgia, serif';
    ctx.textAlign = 'center';
    const l1 = `I'm sponsoring ${firstName}'s education`;
    const l2 = 'at the campus in Northern Uganda.';
    ctx.fillText(l1, CARD_SIZE / 2, PHOTO_HEIGHT + 220);
    ctx.fillText(l2, CARD_SIZE / 2, PHOTO_HEIGHT + 270);

    // Hairline separator above the URL.
    ctx.fillStyle = '#e8e0d4';
    ctx.fillRect(CARD_SIZE / 2 - 120, PHOTO_HEIGHT + 340, 240, 2);

    // URL — same gold as the wordmark. Sponsors' friends type this
    // in (or scan) to land on the kid's real page and see the whole
    // story. Fixed to beanumber.org so it works whether the sponsor
    // shared from prod or preview.
    ctx.fillStyle = '#D4A843';
    ctx.font = 'bold 30px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      `beanumber.org/children/${shirtNumber}`,
      CARD_SIZE / 2,
      PHOTO_HEIGHT + 370
    );
    } finally {
      // ALWAYS clear the rendering flag, even if drawImage /
      // measureText / an unexpected canvas error threw. Without
      // try/finally, a mid-draw throw leaves both action buttons
      // permanently disabled until the modal is closed and reopened.
      setRendering(false);
    }
  }, [firstName, photoUrl, shirtNumber]);

  useEffect(() => {
    if (open) draw();
  }, [open, draw]);

  // Escape-to-close + body scroll lock + initial focus while the
  // modal is open. Backdrop click already closes; keyboard users
  // expect Esc too. Locking body overflow prevents the iOS behind-
  // scroll bug where the underlying page scrolls when the user drags
  // on the modal's scrim. Focus moves into the modal container so
  // screen readers announce the dialog title and tab lands inside
  // the modal on the very next Tab press — otherwise focus stays on
  // the "Make the card" button visually behind the overlay.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      // Focus trap: wrap Tab / Shift+Tab so keyboard focus can't
      // leave the modal while it's open. Without this, Tab from the
      // Copy button escapes past the modal into the (invisible,
      // scroll-locked) page below — keyboard and screen-reader
      // users lose the dialog entirely.
      if (e.key !== 'Tab') return;
      const modal = modalRef.current;
      if (!modal) return;
      const tabbables = modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (tabbables.length === 0) {
        e.preventDefault();
        modal.focus();
        return;
      }
      const first = tabbables[0];
      const last = tabbables[tabbables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || active === modal)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Defer focus so the modal has actually painted; without the
    // rAF, the focus call can race the append and land on <body>.
    const raf = requestAnimationFrame(() => {
      modalRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Reset the flash message every time the modal opens or closes so
  // a stale "Saved. Post it with a line…" from an earlier session
  // isn't the first thing a sponsor sees when they come back to make
  // another card for a different kid a week later.
  useEffect(() => {
    setFlash(null);
  }, [open]);

  const canvasToBlob = (): Promise<Blob | null> =>
    new Promise(resolve => {
      const canvas = canvasRef.current;
      if (!canvas) {
        resolve(null);
        return;
      }
      // canvas.toBlob throws SecurityError synchronously if the
      // canvas is tainted by a cross-origin image that didn't return
      // proper CORS headers. Wrapping the call so a thrown error
      // resolves to null instead of leaving the promise pending — an
      // unresolved promise here means the Download / Share buttons
      // hang forever until the sponsor reloads the page.
      try {
        canvas.toBlob(resolve, 'image/png');
      } catch {
        resolve(null);
      }
    });

  const handleDownload = async () => {
    const blob = await canvasToBlob();
    if (!blob) {
      setFlash("Couldn't render the image. Try refreshing the page.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filenameBase}-beanumber.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Revoke on the next tick to give the download a chance to start.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFlash('Saved. Post it with a line about why this kid matters to you.');
  };

  const handleShareFile = async () => {
    const blob = await canvasToBlob();
    if (!blob) {
      setFlash("Couldn't render the image.");
      return;
    }
    try {
      const file = new File([blob], `${filenameBase}-beanumber.png`, {
        type: 'image/png',
      });
      // Pass `url` as its own field, not baked into `text`. iOS
      // Messages, IG Direct, native mail, and Slack all render a
      // proper link preview when the URL is a first-class field —
      // whereas raw text with a URL just becomes a text link the
      // recipient has to tap through. Text stays short and personal.
      await navigator.share({
        files: [file],
        title: `${firstName} at the campus`,
        text: `I'm sponsoring ${firstName}'s education at the campus in Northern Uganda.`,
        url: kidPageUrl,
      });
      setFlash(null);
    } catch (err) {
      // User canceled the share sheet — not an error.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setFlash("Share didn't go through. You can download the image instead.");
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(kidPageUrl);
      setFlash('Link copied.');
    } catch {
      setFlash("Couldn't copy. Long-press the URL to select.");
    }
  };

  return (
    <div className="w-full">
      <div className="max-w-2xl mx-auto text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-2">
          Take {firstName} with you
        </p>
        <h3
          className="text-2xl md:text-3xl text-[#0d0d0d] mb-3"
          style={{ fontFamily: 'var(--font-lora), Georgia, serif', fontWeight: 600 }}
        >
          Share {firstName}&rsquo;s page with your world
        </h3>
        <p className="text-[#555] leading-relaxed mb-6" style={{ fontFamily: 'Georgia, serif' }}>
          One friend seeing this is how the next sponsor finds {firstName}. Post the card
          on your feed or send it to someone specific — say a sentence about why {firstName}{' '}
          matters to you.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-block bg-[#0d0d0d] text-white px-6 py-3 font-bold uppercase tracking-wider text-sm hover:bg-[#D4A843] hover:text-[#0d0d0d] transition-colors"
        >
          Make the card
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          {/* role="dialog" + aria-modal on the CARD, not the scrim —
              screen readers should announce the dialog title when
              focus lands here, and the tab-order should treat this
              container (not the scrim) as the dialog root. tabIndex
              -1 makes it programmatically focusable without joining
              the natural tab sequence. */}
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-kid-card-title"
            tabIndex={-1}
            className="bg-[#FFF8F0] max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 md:p-8 relative outline-none"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute top-3 right-3 w-10 h-10 flex items-center justify-center text-[#555] hover:text-[#0d0d0d] text-2xl"
            >
              ×
            </button>
            <h2
              id="share-kid-card-title"
              className="text-xl md:text-2xl text-[#0d0d0d] mb-1"
              style={{ fontFamily: 'var(--font-lora), Georgia, serif', fontWeight: 600 }}
            >
              Post {firstName}
            </h2>
            <p className="text-sm text-[#555] mb-4">
              1080×1080. Made for Instagram, but works anywhere.
            </p>

            <div className="border border-[#e8e0d4] bg-white mb-4 overflow-hidden">
              <canvas
                ref={canvasRef}
                aria-label={`Shareable card for ${displayName}`}
                className="block w-full h-auto"
              />
              {rendering && (
                <p className="text-center text-xs text-[#888] py-2">
                  Rendering…
                </p>
              )}
            </div>

            <div className="space-y-2">
              {canShareFiles && (
                <button
                  type="button"
                  onClick={handleShareFile}
                  disabled={rendering}
                  className="w-full bg-[#D4A843] text-[#0d0d0d] px-4 py-3 font-bold uppercase tracking-wider text-sm hover:bg-[#c09635] transition-colors disabled:opacity-50"
                >
                  Share
                </button>
              )}
              <button
                type="button"
                onClick={handleDownload}
                disabled={rendering}
                className="w-full bg-[#0d0d0d] text-white px-4 py-3 font-bold uppercase tracking-wider text-sm hover:bg-[#333] transition-colors disabled:opacity-50"
              >
                Download PNG
              </button>
              <button
                type="button"
                onClick={handleCopyLink}
                className="w-full border border-[#e8e0d4] text-[#0d0d0d] px-4 py-3 font-bold uppercase tracking-wider text-sm hover:bg-[#e8e0d4]/40 transition-colors"
              >
                Copy link to {firstName}&rsquo;s page
              </button>
            </div>

            {/* Live region is always in the DOM (not conditionally
                rendered) so screen readers register it BEFORE the
                first announcement. Announces politely on change and
                reads the entire region as one unit rather than diffing
                text nodes. */}
            <p
              className="text-sm text-[#0d0d0d] mt-4 text-center min-h-[1.25rem]"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {flash ?? ''}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
