/**
 * deepLink — parse an incoming URL into a normalized app route.
 *
 * Handles both universal-link inputs (https://beanumber.org/…) and
 * custom-scheme inputs (beanumber://…). Used by:
 *
 *   - useWebDeepLinks (hooks/useWebDeepLinks.ts) — the general
 *     web-URL listener. Coexists with usePushDeepLinks; the two
 *     do not step on each other because they hook different
 *     event sources (Linking vs Notifications).
 *
 *   - The deferred-link first-open resolver (hooks/useDeferredLink.ts)
 *     — the path returned by /api/mobile/v1/deferred-link/resolve is
 *     already an app path but we still round-trip it through
 *     parseIncomingUrl to enforce the allow-list.
 *
 * The route table (docs/claude/architecture.md §"Deep linking") is
 * enforced here — anything not on the list returns null. That's the
 * "additive only, don't step on push handler" rule.
 */

import * as Linking from 'expo-linking';

export interface ParsedUrl {
  pathname: string;
  query: Record<string, string>;
}

const APP_ROUTES = [
  { pattern: /^\/meet\/(\d+)\/?$/, target: (m: RegExpMatchArray) => `/meet/${m[1]}` },
  {
    pattern: /^\/children\/(\d+)\/updates\/?$/,
    target: (m: RegExpMatchArray) => `/children/${m[1]}/updates`,
  },
  {
    pattern: /^\/children\/(\d+)\/?$/,
    target: (m: RegExpMatchArray) => `/children/${m[1]}`,
  },
  {
    pattern: /^\/newsletter\/([\w-]+)\/?$/,
    target: (m: RegExpMatchArray) => `/newsletter/${m[1]}`,
  },
  { pattern: /^\/campus\/?$/, target: () => '/(tabs)/explore' },
  { pattern: /^\/me\/?$/, target: () => '/(tabs)/me' },
];

/**
 * Parse a URL — either https://beanumber.org/... or beanumber://... —
 * into { pathname, query }. Returns null when the URL isn't ours or
 * doesn't parse.
 */
export function parseIncomingUrl(url: string): ParsedUrl | null {
  if (!url || typeof url !== 'string') return null;

  try {
    const parsed = Linking.parse(url);
    if (!parsed) return null;

    // expo-linking's parse gives us `path` without a leading slash
    // for https URLs, and with a leading slash stripped for
    // custom-scheme too. Normalize.
    let path = parsed.path ?? '';
    if (!path.startsWith('/')) path = `/${path}`;
    if (path === '/') return null;

    // queryParams comes back as Record<string, string | string[]>. We
    // flatten to plain strings — the last value wins if a key
    // appears more than once.
    const query: Record<string, string> = {};
    const raw = parsed.queryParams ?? {};
    for (const [key, val] of Object.entries(raw)) {
      if (val == null) continue;
      query[key] = Array.isArray(val) ? val[val.length - 1] ?? '' : String(val);
    }

    return { pathname: path, query };
  } catch {
    return null;
  }
}

/**
 * Map a parsed URL to the app route path we should push. Returns
 * null when the URL doesn't match any known route — used to reject
 * (e.g.) /admin/* or /api/* URLs that snuck through.
 *
 * Preserves the incoming query string, appended to the target path.
 * The reveal screen doesn't read the query today; keeping it here
 * means a future ?src=qr / ?from=me trace works without a code
 * change.
 */
export function routeFor(parsed: ParsedUrl): string | null {
  for (const route of APP_ROUTES) {
    const match = parsed.pathname.match(route.pattern);
    if (match) {
      const base = route.target(match);
      const qs = Object.entries(parsed.query)
        .map(
          ([k, v]) =>
            `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
        )
        .join('&');
      return qs ? `${base}?${qs}` : base;
    }
  }
  return null;
}

/**
 * One-shot convenience: parse and route in a single call. Used by
 * the initial-URL check and the runtime listener.
 */
export function resolveIncomingUrl(url: string | null): string | null {
  if (!url) return null;
  const parsed = parseIncomingUrl(url);
  if (!parsed) return null;
  return routeFor(parsed);
}
