/**
 * Admin · AppSettings key/value store.
 *
 * Singleton-style storage for things that don't deserve their own
 * Airtable table — the Gmail OAuth refresh token, the authorized
 * email, the signature, etc. Each setting is one row in the
 * AppSettings table, keyed by a dotted-namespace string.
 *
 * Server-side only. All reads/writes go through Airtable directly.
 */

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const SETTINGS_TABLE =
  process.env.AIRTABLE_APP_SETTINGS_TABLE || 'AppSettings';

export const SETTING_KEYS = {
  gmailRefreshToken: 'gmail.refresh_token',
  gmailAuthorizedEmail: 'gmail.authorized_email',
  gmailSignature: 'gmail.signature',
} as const;

function atHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

interface SettingRecord {
  id: string;
  fields: {
    Key?: string;
    Value?: string;
    UpdatedAt?: string;
    Notes?: string;
  };
}

async function findSetting(key: string): Promise<SettingRecord | null> {
  const formula = encodeURIComponent(`{Key}="${key.replace(/"/g, '\\"')}"`);
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    SETTINGS_TABLE
  )}?filterByFormula=${formula}&maxRecords=1`;
  const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  return data.records?.[0] || null;
}

export async function getSetting(key: string): Promise<string | null> {
  const rec = await findSetting(key);
  return rec?.fields.Value || null;
}

export async function setSetting(
  key: string,
  value: string,
  notes?: string
): Promise<void> {
  const existing = await findSetting(key);
  const fields: Record<string, string> = {
    Key: key,
    Value: value,
    UpdatedAt: new Date().toISOString(),
  };
  if (notes) fields.Notes = notes;

  if (existing) {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      SETTINGS_TABLE
    )}/${existing.id}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: atHeaders(),
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) {
      throw new Error(`AppSettings PATCH failed: ${res.status} ${await res.text()}`);
    }
    return;
  }
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    SETTINGS_TABLE
  )}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: atHeaders(),
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    throw new Error(`AppSettings POST failed: ${res.status} ${await res.text()}`);
  }
}

export async function deleteSetting(key: string): Promise<void> {
  const existing = await findSetting(key);
  if (!existing) return;
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    SETTINGS_TABLE
  )}/${existing.id}`;
  await fetch(url, { method: 'DELETE', headers: atHeaders() });
}
