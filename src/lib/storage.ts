/**
 * Supabase Storage helpers — file uploads from admin routes.
 *
 * The migration moved every Airtable attachment into a Supabase Storage
 * bucket (default: `attachments`). Admin upload endpoints (roster photos,
 * newsletter hero photos, campus update photos) now post here instead
 * of `content.airtable.com`.
 *
 * Why Supabase Storage:
 *   - URL is permanent (no signed-URL expiry like Airtable's).
 *   - Bucket-level public read; service-role key required for writes.
 *   - Same Supabase project hosts Postgres, so credentials are already
 *     part of the env.
 *
 * Naming convention: `<kind>/<scope>/<timestamp>-<safe-filename>` so a
 * single kid's profile photos don't clobber each other across uploads.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const SUPABASE_URL =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error(
      'Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
  _client = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
  return _client;
}

const DEFAULT_BUCKET =
  process.env.SUPABASE_ATTACHMENTS_BUCKET || 'attachments';

export interface UploadInput {
  /** Logical grouping: 'profile-photos' | 'report-cards' | 'letters' |
   *  'newsletter-hero' | 'campus-update' | 'child-updates'. */
  kind: string;
  /** Sub-folder under the kind. Usually a stable id (kid uuid, newsletter
   *  id) so future uploads for the same scope land alongside each other. */
  scope: string;
  filename: string;
  contentType: string;
  /** Base64-encoded body, no `data:` prefix. */
  data: string;
  bucket?: string;
}

export interface UploadResult {
  path: string;
  publicUrl: string;
}

function safeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'file';
}

/**
 * Upload a base64-encoded file to Supabase Storage. Returns the
 * permanent public URL.
 */
export async function uploadAttachment(
  input: UploadInput
): Promise<UploadResult> {
  const client = getClient();
  const bucket = input.bucket || DEFAULT_BUCKET;
  const ts = Date.now();
  const path = `${input.kind}/${input.scope}/${ts}-${safeFilename(input.filename)}`;
  const buffer = Buffer.from(input.data, 'base64');
  const { error } = await client.storage.from(bucket).upload(path, buffer, {
    contentType: input.contentType,
    upsert: false,
    // Supabase defaults uploads to max-age=3600, so every browser,
    // CDN node, and React Native image cache re-pulls the full-size
    // original once an hour, forever. With ~55 roster photos served
    // to a mobile grid that renders all of them, that default is what
    // burned through the 5GB cached-egress quota and took every photo
    // on the site down with a 402 (2026-08-07).
    //
    // A year + immutable is correct here rather than merely tolerable:
    // the path carries a timestamp, so these exact bytes never change.
    // A replacement photo is a new path and a new URL.
    cacheControl: '31536000, immutable',
  });
  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }
  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

/**
 * Remove a previously-uploaded file by its storage path. Best-effort:
 * a failure logs but doesn't throw. Most callers use this for
 * cleanup (e.g. when an entity is being deleted), so a stuck file
 * isn't worth blocking on.
 */
export async function deleteAttachment(
  path: string,
  bucket = DEFAULT_BUCKET
): Promise<void> {
  try {
    const client = getClient();
    const { error } = await client.storage.from(bucket).remove([path]);
    if (error) console.warn('[storage.deleteAttachment]', error.message);
  } catch (err) {
    console.warn('[storage.deleteAttachment]', err);
  }
}
