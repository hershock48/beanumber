/**
 * Attachment type inference — used across the correspondence surfaces
 * (admin queue composer, /children/[N] NotesThread, /me KidCardNotesPreview)
 * to decide whether to render an uploaded file as an inline photo or a
 * document card.
 *
 * The Supabase storage path preserves the original extension via
 * safeFilename() in src/lib/storage.ts, so URL-sniffing is reliable
 * enough — every URL we produce ends in ".jpg", ".png", ".pdf", ".docx"
 * etc. before any query string. If Simon ever uploads a file with an
 * unusual extension we fall back to 'other' and render a generic
 * document card, which is still correct (the URL still works as a
 * link).
 *
 * This is a pure, dependency-free string check so both server components
 * (NotesThread render) and client components (MessagesQueue composer)
 * can share it without pulling in Node-only APIs.
 */

export type AttachmentKind = 'image' | 'pdf' | 'doc' | 'other';

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)(\?|#|$)/i;
const PDF_EXT = /\.pdf(\?|#|$)/i;
const DOC_EXT = /\.(docx?|rtf|odt)(\?|#|$)/i;

export function attachmentKind(url: string | null | undefined): AttachmentKind {
  if (!url) return 'other';
  if (IMAGE_EXT.test(url)) return 'image';
  if (PDF_EXT.test(url)) return 'pdf';
  if (DOC_EXT.test(url)) return 'doc';
  return 'other';
}

/**
 * Human-readable label for a non-image attachment. Empty for images
 * (which render inline and don't need a label).
 */
export function attachmentTypeLabel(kind: AttachmentKind): string {
  switch (kind) {
    case 'pdf':
      return 'PDF';
    case 'doc':
      return 'Word doc';
    case 'other':
      return 'document';
    default:
      return '';
  }
}
