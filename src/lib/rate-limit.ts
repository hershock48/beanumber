/**
 * Rate limiting middleware
 * Prevents abuse by limiting requests per IP address
 */

import { NextRequest } from 'next/server';
import { RateLimitError } from './errors';
import { logger } from './logger';

// ============================================================================
// IN-MEMORY RATE LIMITER
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  skipSuccessfulRequests?: boolean;
}

/**
 * Simple in-memory rate limiter
 * Note: This is not suitable for multi-instance deployments
 * For production with multiple instances, use Redis or similar
 */
class InMemoryRateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Check if request is within rate limit
   */
  check(key: string, config: RateLimitConfig): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
    retryAfter?: number;
  } {
    const now = Date.now();
    const entry = this.store.get(key);

    // No entry or expired - allow request
    if (!entry || entry.resetAt <= now) {
      const resetAt = now + config.windowMs;
      this.store.set(key, { count: 1, resetAt });

      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetAt,
      };
    }

    // Entry exists and not expired
    if (entry.count < config.maxRequests) {
      // Within limit - increment and allow
      entry.count++;
      this.store.set(key, entry);

      return {
        allowed: true,
        remaining: config.maxRequests - entry.count,
        resetAt: entry.resetAt,
      };
    }

    // Exceeded limit - deny
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);

    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfter,
    };
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    this.store.delete(key);
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.store.entries()) {
      if (entry.resetAt <= now) {
        this.store.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Rate limiter cleanup: removed ${cleaned} expired entries`);
    }
  }

  /**
   * Get current store size (for monitoring)
   */
  getSize(): number {
    return this.store.size;
  }

  /**
   * Clear all entries (for testing)
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Destroy rate limiter (cleanup interval)
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

// Singleton instance
const rateLimiter = new InMemoryRateLimiter();

// ============================================================================
// RATE LIMIT MIDDLEWARE
// ============================================================================

/**
 * Extract client identifier from request
 */
function getClientIdentifier(request: NextRequest): string {
  // Try to get IP address from headers (Vercel, Cloudflare, etc.)
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');

  const ip = cfConnectingIp || realIp || forwardedFor?.split(',')[0] || 'unknown';

  // In development, use a fixed identifier to avoid issues
  if (process.env.NODE_ENV === 'development') {
    return `dev-${ip}`;
  }

  return ip;
}

/**
 * Create rate limit key
 */
function createRateLimitKey(identifier: string, namespace: string): string {
  return `${namespace}:${identifier}`;
}

/**
 * Rate limit middleware
 * Returns null if allowed, RateLimitError if denied
 */
export function checkRateLimit(
  request: NextRequest,
  config: RateLimitConfig,
  namespace: string = 'global'
): RateLimitError | null {
  const identifier = getClientIdentifier(request);
  const key = createRateLimitKey(identifier, namespace);

  const result = rateLimiter.check(key, config);

  // Log rate limit check
  logger.debug('Rate limit check', {
    namespace,
    identifier: identifier.substring(0, 10) + '***', // Mask IP
    allowed: result.allowed,
    remaining: result.remaining,
  });

  if (!result.allowed) {
    logger.warn('Rate limit exceeded', {
      namespace,
      identifier: identifier.substring(0, 10) + '***',
      retryAfter: result.retryAfter,
    });

    return new RateLimitError(undefined, result.retryAfter);
  }

  return null;
}

/**
 * Apply rate limiting to a request handler
 */
export function withRateLimit(
  handler: (request: NextRequest) => Promise<Response>,
  config: RateLimitConfig,
  namespace: string = 'global'
) {
  return async (request: NextRequest): Promise<Response> => {
    const error = checkRateLimit(request, config, namespace);

    if (error) {
      throw error;
    }

    return handler(request);
  };
}

// ============================================================================
// PREDEFINED RATE LIMITERS
// ============================================================================

import { RATE_LIMITS } from './constants';

/**
 * Rate limiter for login attempts
 */
export function checkLoginRateLimit(request: NextRequest): RateLimitError | null {
  return checkRateLimit(request, RATE_LIMITS.LOGIN_ATTEMPTS, 'login');
}

/**
 * Rate limiter for checkout creation
 */
export function checkCheckoutRateLimit(request: NextRequest): RateLimitError | null {
  return checkRateLimit(request, RATE_LIMITS.CHECKOUT_CREATION, 'checkout');
}

/**
 * Rate limiter for update submission
 */
export function checkUpdateSubmissionRateLimit(request: NextRequest): RateLimitError | null {
  return checkRateLimit(request, RATE_LIMITS.UPDATE_SUBMISSION, 'update-submission');
}

/**
 * Rate limiter for update requests
 */
export function checkUpdateRequestRateLimit(request: NextRequest): RateLimitError | null {
  return checkRateLimit(request, RATE_LIMITS.UPDATE_REQUEST, 'update-request');
}

// ============================================================================
// THROTTLING (TIME-BASED LIMITING)
// ============================================================================

/**
 * Check if sponsor can request a new update (90-day throttle)
 */
export function canRequestUpdate(
  lastRequestAt: string | null | undefined,
  nextEligibleAt: string | null | undefined
): {
  canRequest: boolean;
  daysRemaining?: number;
} {
  if (!nextEligibleAt) {
    return { canRequest: true };
  }

  const now = new Date();
  const eligibleDate = new Date(nextEligibleAt);

  if (now >= eligibleDate) {
    return { canRequest: true };
  }

  const msRemaining = eligibleDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));

  return {
    canRequest: false,
    daysRemaining,
  };
}

/**
 * Calculate next eligible date for update request
 */
export function calculateNextEligibleDate(from: Date = new Date()): Date {
  const nextEligible = new Date(from);
  nextEligible.setTime(nextEligible.getTime() + RATE_LIMITS.UPDATE_REQUEST_THROTTLE_MS);
  return nextEligible;
}

// ============================================================================
// TESTING & UTILITIES
// ============================================================================

/**
 * Reset rate limit for a specific identifier (for testing)
 */
export function resetRateLimit(identifier: string, namespace: string = 'global'): void {
  const key = createRateLimitKey(identifier, namespace);
  rateLimiter.reset(key);
}

/**
 * Clear all rate limits (for testing)
 */
export function clearAllRateLimits(): void {
  rateLimiter.clear();
}

/**
 * Get rate limiter stats
 */
export function getRateLimiterStats() {
  return {
    entriesCount: rateLimiter.getSize(),
  };
}

// Export rate limiter instance for advanced usage
export { rateLimiter };
