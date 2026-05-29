/**
 * Admin · Connect Gmail.
 *
 * One-time page for authorizing the app to send email on Kevin's
 * behalf. Shows the current connection state, links to the OAuth
 * flow, and lets Kevin edit the signature appended to every send.
 *
 * Admin only (Simon redirected to roster).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '../_components/AdminShell';
import { getAdminRole } from '@/lib/admin-session';
import { getSetting, SETTING_KEYS } from '@/lib/admin/settings';
import { gmailOAuthConfigured } from '@/lib/gmail/oauth';
import { GmailSettingsForm } from './GmailSettingsForm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  searchParams: Promise<{ status?: string; error?: string }>;
}

const ERROR_COPY: Record<string, string> = {
  not_configured: 'Google OAuth env vars aren\'t set yet. Follow the one-time setup in docs/claude/gmail_setup.md.',
  missing_code: 'Google didn\'t return an authorization code. Try again.',
  state_mismatch: 'CSRF state mismatch — try the flow again, and don\'t open the link in a different browser.',
  no_refresh_token: 'Google didn\'t return a refresh token. Revoke access at https://myaccount.google.com/permissions and try again.',
  access_denied: 'You declined the permission. Click connect to try again.',
};

export default async function ConnectGmailPage({ searchParams }: PageProps) {
  const role = (await getAdminRole()) || 'admin';
  if (role === 'simon') redirect('/admin/roster');

  const params = await searchParams;
  const status = params.status;
  const errorParam = params.error;

  const oauthConfigured = gmailOAuthConfigured();
  const refreshToken = oauthConfigured
    ? await getSetting(SETTING_KEYS.gmailRefreshToken)
    : null;
  const authorizedEmail = await getSetting(SETTING_KEYS.gmailAuthorizedEmail);
  const signature = (await getSetting(SETTING_KEYS.gmailSignature)) || '';

  const connected = !!refreshToken;

  return (
    <AdminShell activeTab="home" role={role}>
      <div className="max-w-2xl mx-auto px-5 py-6 md:py-10">
        <Link
          href="/admin"
          className="inline-flex items-center text-sm text-[#888] hover:text-[#0d0d0d] mb-6"
        >
          ← Back to admin
        </Link>

        <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-1">
          Gmail integration
        </p>
        <h1
          className="text-3xl md:text-4xl text-[#0d0d0d] mb-4"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          {connected ? 'Connected.' : 'Connect Gmail.'}
        </h1>

        {status === 'connected' && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-800 text-sm">
            ✓ Gmail connected. You can now send email from inside donor
            profiles, and it&apos;ll go from your Gmail account.
          </div>
        )}
        {errorParam && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-sm">
            {ERROR_COPY[errorParam] || `Error: ${errorParam}`}
          </div>
        )}

        {!oauthConfigured ? (
          <div className="mb-8 p-5 border border-amber-300 bg-amber-50 text-sm leading-relaxed">
            <p className="font-bold mb-2">One-time setup pending</p>
            <p className="mb-3">
              Google OAuth env vars aren&apos;t set in Vercel yet. See{' '}
              <code className="text-xs bg-white border border-amber-200 px-1.5 py-0.5">
                docs/claude/gmail_setup.md
              </code>{' '}
              for the step-by-step. You need to create a Google Cloud
              project, enable Gmail API, create OAuth credentials, and
              set <code>GOOGLE_OAUTH_CLIENT_ID</code> and{' '}
              <code>GOOGLE_OAUTH_CLIENT_SECRET</code> as env vars.
            </p>
          </div>
        ) : connected ? (
          <div className="mb-8 p-5 border border-[#e8e0d4] bg-white text-sm">
            <p className="mb-1">
              Authorized as{' '}
              <span className="font-semibold text-[#0d0d0d]">
                {authorizedEmail || 'unknown'}
              </span>
            </p>
            <p className="text-[#888] mb-4">
              Emails sent from inside the admin will go from this account
              and land in its Sent folder. Replies come to your normal
              Gmail inbox.
            </p>
            <a
              href="/api/auth/google/connect"
              className="inline-block text-xs text-[#888] hover:text-[#0d0d0d] underline"
            >
              Re-authorize (replace stored credentials)
            </a>
          </div>
        ) : (
          <div className="mb-8 p-5 border border-[#D4A843] bg-[#FFF8F0] text-sm">
            <p className="mb-4 text-[#0d0d0d]">
              Click below to grant the BAN admin permission to send email
              on your behalf. Google will ask you to confirm. You only
              have to do this once.
            </p>
            <a
              href="/api/auth/google/connect"
              className="inline-block bg-[#D4A843] text-[#0d0d0d] hover:bg-[#c49a3a] font-bold text-xs uppercase tracking-wider px-5 py-3 transition-colors"
            >
              Connect Gmail
            </a>
          </div>
        )}

        {oauthConfigured && (
          <section>
            <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-2">
              Email signature
            </p>
            <p className="text-xs text-[#888] mb-3 leading-relaxed">
              Appended to every email you send from the admin. Plain text,
              line breaks preserved. Leave empty for no signature.
            </p>
            <GmailSettingsForm initialSignature={signature} />
          </section>
        )}
      </div>
    </AdminShell>
  );
}
