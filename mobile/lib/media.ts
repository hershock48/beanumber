/**
 * media — is this URL a video?
 *
 * The feed and updates pipelines carry plain URLs (Supabase Storage
 * uploads). The server doesn't distinguish photo from video and
 * doesn't need to — the extension does. The day Simon Peter's team
 * uploads their first .mp4 from the campus, every surface that runs
 * URLs through this check just plays it. No schema change, no new
 * endpoint, no admin step.
 */
export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(url);
}
