/**
 * Check Links Tool
 *
 * WAT-compliant tool for checking site link health.
 * Verifies all routes return expected status codes.
 *
 * Usage in workflows:
 * - Can be called as part of CI/CD pipeline
 * - Can be triggered manually via API
 * - Reports broken links for quick fixes
 */

import { logger } from '../../logger';
import { ValidationResult, success, failure } from '../../validation';
import { ROUTES } from '../../constants';

// ============================================================================
// INPUT/OUTPUT INTERFACES
// ============================================================================

/**
 * Input schema for check-links tool
 */
export interface CheckLinksInput {
  /** Base URL to check (default: NEXT_PUBLIC_SITE_URL or localhost:3000) */
  baseUrl?: string;
  /** Include API routes in check (default: false) */
  includeApi?: boolean;
  /** Timeout per request in ms (default: 5000) */
  timeout?: number;
}

/**
 * Result for a single link check
 */
export interface LinkCheckResult {
  /** The path that was checked */
  path: string;
  /** Full URL that was checked */
  url: string;
  /** HTTP status code (0 if request failed) */
  status: number;
  /** Whether the link is healthy (2xx or 3xx status) */
  healthy: boolean;
  /** Error message if request failed */
  error?: string;
  /** Response time in ms */
  responseTimeMs: number;
}

/**
 * Output schema for check-links tool
 */
export interface CheckLinksOutput {
  success: boolean;
  data?: {
    results: LinkCheckResult[];
    summary: {
      total: number;
      healthy: number;
      broken: number;
      errors: number;
    };
    brokenLinks: string[];
    checkedAt: string;
    baseUrl: string;
  };
  error?: string;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate tool input
 */
function validateInput(input: unknown): ValidationResult<CheckLinksInput> {
  if (input === undefined || input === null) {
    return success({});
  }

  if (typeof input !== 'object') {
    return failure('Invalid input: expected an object or undefined');
  }

  const obj = input as Record<string, unknown>;

  let baseUrl: string | undefined;
  if (obj.baseUrl !== undefined) {
    if (typeof obj.baseUrl !== 'string') {
      return failure('Invalid baseUrl: must be a string');
    }
    baseUrl = obj.baseUrl;
  }

  let includeApi = false;
  if (obj.includeApi !== undefined) {
    if (typeof obj.includeApi !== 'boolean') {
      return failure('Invalid includeApi: must be a boolean');
    }
    includeApi = obj.includeApi;
  }

  let timeout = 5000;
  if (obj.timeout !== undefined) {
    if (typeof obj.timeout !== 'number' || obj.timeout < 100) {
      return failure('Invalid timeout: must be a number >= 100');
    }
    timeout = obj.timeout;
  }

  return success({ baseUrl, includeApi, timeout });
}

/**
 * Get all static routes from ROUTES constant
 */
function getStaticRoutes(includeApi: boolean): string[] {
  const routes: string[] = [];

  // Add static page routes
  routes.push(ROUTES.HOME);
  routes.push(ROUTES.CONTACT);
  routes.push(ROUTES.SPONSOR_LOGIN);
  routes.push(ROUTES.DONATE_SUCCESS);
  routes.push(ROUTES.ADMIN_DASHBOARD);
  routes.push(ROUTES.ADMIN_UPDATES_SUBMIT);

  // Add known static pages not in ROUTES constant
  routes.push('/founder');
  routes.push('/governance');
  routes.push('/impact');
  routes.push('/partnerships');

  // Add API routes if requested (for health checks)
  if (includeApi) {
    // Note: API routes need special handling (POST vs GET, auth, etc.)
    // For now, we skip them as they require more complex testing
  }

  return routes;
}

/**
 * Check a single link
 */
async function checkLink(
  url: string,
  path: string,
  timeout: number
): Promise<LinkCheckResult> {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: 'HEAD', // Use HEAD for efficiency
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    const responseTimeMs = Date.now() - startTime;
    const healthy = response.status >= 200 && response.status < 400;

    return {
      path,
      url,
      status: response.status,
      healthy,
      responseTimeMs,
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if it was a timeout
    const isTimeout = errorMessage.includes('abort') || errorMessage.includes('timeout');

    return {
      path,
      url,
      status: 0,
      healthy: false,
      error: isTimeout ? 'Request timeout' : errorMessage,
      responseTimeMs,
    };
  }
}

// ============================================================================
// MAIN TOOL FUNCTION
// ============================================================================

/**
 * Check all site links for health
 *
 * This tool validates that all defined routes return healthy status codes.
 *
 * @param input - Optional configuration
 * @returns Structured result with link check results
 *
 * @example
 * const result = await checkLinksTool({
 *   baseUrl: 'https://www.beanumber.org'
 * });
 * if (result.success) {
 *   console.log(`Checked ${result.data?.summary.total} links`);
 *   if (result.data?.summary.broken > 0) {
 *     console.log('Broken links:', result.data?.brokenLinks);
 *   }
 * }
 */
export async function checkLinksTool(input?: unknown): Promise<CheckLinksOutput> {
  // 1. Validate input
  const validated = validateInput(input);
  if (!validated.success) {
    logger.warn('check-links-tool validation failed', { error: validated.error });
    return {
      success: false,
      error: validated.error,
    };
  }

  const { baseUrl: inputBaseUrl, includeApi, timeout } = validated.data!;

  // Determine base URL
  const baseUrl = inputBaseUrl ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'http://localhost:3000';

  // 2. Execute action
  try {
    logger.debug('check-links-tool executing', { baseUrl, includeApi, timeout });

    const routes = getStaticRoutes(includeApi ?? false);
    const results: LinkCheckResult[] = [];

    // Check each route
    for (const path of routes) {
      const url = `${baseUrl}${path}`;
      const result = await checkLink(url, path, timeout ?? 5000);
      results.push(result);

      // Log individual results
      if (!result.healthy) {
        logger.warn('Broken link detected', {
          path: result.path,
          status: result.status,
          error: result.error,
        });
      }
    }

    // Calculate summary
    const healthy = results.filter(r => r.healthy).length;
    const broken = results.filter(r => !r.healthy && r.status > 0).length;
    const errors = results.filter(r => r.status === 0).length;
    const brokenLinks = results
      .filter(r => !r.healthy)
      .map(r => r.path);

    // 3. Log success
    logger.info('check-links-tool completed', {
      total: results.length,
      healthy,
      broken,
      errors,
      brokenLinks,
    });

    // 4. Return structured output
    return {
      success: true,
      data: {
        results,
        summary: {
          total: results.length,
          healthy,
          broken,
          errors,
        },
        brokenLinks,
        checkedAt: new Date().toISOString(),
        baseUrl,
      },
    };
  } catch (error) {
    // 5. Handle errors gracefully
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('check-links-tool unexpected error', error);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

// Default export for convenience
export default checkLinksTool;
