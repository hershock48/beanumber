/**
 * Application-wide constants
 * Centralizes all magic strings, values, and configuration
 */

// ============================================================================
// STATUS VALUES
// ============================================================================

export const AUTH_STATUS = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Suspended',
} as const;

export const SPONSORSHIP_STATUS = {
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  ENDED: 'Ended',
  AWAITING_SPONSOR: 'Awaiting Sponsor',
} as const;

// Child Update System statuses
export const CHILD_UPDATE_STATUS = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Pending Review',
  PUBLISHED: 'Published',
  REJECTED: 'Rejected',
  NEEDS_CORRECTION: 'Needs Correction',
} as const;

export const SOURCE_TYPE = {
  FIELD: 'field',
  ACADEMIC: 'academic',
} as const;

// Role-based system emails
export const ROLE_EMAILS = {
  FIELD_UPDATES: 'field-updates@beanumber.org',
  ACADEMICS: 'academics@beanumber.org',
  ADMIN: 'admin@beanumber.org',
} as const;

// ============================================================================
// SESSION & AUTHENTICATION
// ============================================================================

export const SESSION = {
  COOKIE_NAME: 'sponsor_session',
  /**
   * Cookie lifetime — 365 days. Returning sponsors get a year of
   * friction-free recognition on a given device before they need to
   * sign in again. Same value used everywhere we write the cookie
   * (callback, claim-match, verify); use this constant rather than
   * inlining the number so a future tweak only touches one place.
   */
  MAX_AGE_DAYS: 365,
  MAX_AGE_SECONDS: 365 * 24 * 60 * 60,
  PATH: '/',
} as const;

export const SPONSOR_CODE_PATTERN = /^BAN-\d{4}-\d{3}$/;

// ============================================================================
// RATE LIMITING & THROTTLING
// ============================================================================

export const RATE_LIMITS = {
  // Request update throttle (90 days in milliseconds)
  UPDATE_REQUEST_THROTTLE_MS: 90 * 24 * 60 * 60 * 1000,

  // API rate limits (requests per window)
  LOGIN_ATTEMPTS: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },

  CHECKOUT_CREATION: {
    maxRequests: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
  },

  UPDATE_SUBMISSION: {
    maxRequests: 20,
    windowMs: 60 * 60 * 1000, // 1 hour
  },

  UPDATE_REQUEST: {
    maxRequests: 3,
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
  },
} as const;

// ============================================================================
// STRIPE
// ============================================================================

export const STRIPE = {
  CURRENCY: 'usd',
  API_VERSION: '2025-12-15.clover' as const,

  WEBHOOK_EVENTS: {
    CHECKOUT_COMPLETED: 'checkout.session.completed',
    SUBSCRIPTION_CREATED: 'customer.subscription.created',
    SUBSCRIPTION_UPDATED: 'customer.subscription.updated',
    INVOICE_PAYMENT_SUCCEEDED: 'invoice.payment_succeeded',
  },

  PAYMENT_MODES: {
    PAYMENT: 'payment',
    SUBSCRIPTION: 'subscription',
  },
} as const;

// ============================================================================
// EMAIL
// ============================================================================

export const EMAIL = {
  FROM_ADDRESS: 'noreply@beanumber.org',
  FROM_NAME: 'Be A Number, International',

  TEMPLATES: {
    WELCOME_SPONSOR: 'welcome-sponsor',
    NEW_UPDATE_NOTIFICATION: 'new-update',
    DONATION_RECEIPT: 'donation-receipt',
    UPDATE_REQUEST_CONFIRMATION: 'update-request-confirmation',
  },
} as const;

// ============================================================================
// VALIDATION
// ============================================================================

export const VALIDATION = {
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

  DONATION: {
    MIN_AMOUNT: 1,
    MAX_AMOUNT: 1000000,
  },

  UPDATE: {
    TITLE_MIN_LENGTH: 3,
    TITLE_MAX_LENGTH: 200,
    CONTENT_MIN_LENGTH: 10,
    CONTENT_MAX_LENGTH: 10000,
  },
} as const;

// ============================================================================
// URLS & ROUTING
// ============================================================================

export const ROUTES = {
  HOME: '/',
  CONTACT: '/contact',
  // /sponsorship was renamed to /campus when the page changed from a
  // kid-picker checkout to the campus exploration page. The next.config.ts
  // redirect keeps old links working; this constant points at the new
  // canonical URL.
  SPONSORSHIP: '/campus',
  SPONSOR_LOGIN: '/sponsor/login',
  SPONSOR_DASHBOARD: (code: string) => `/sponsor/${code}`,
  DONATE_SUCCESS: '/donate/success',
  ADMIN_DASHBOARD: '/admin/dashboard',
  ADMIN_UPDATES_SUBMIT: '/admin/updates/submit',

} as const;

// ============================================================================
// ERROR MESSAGES
// ============================================================================

export const ERROR_MESSAGES = {
  // Authentication errors
  INVALID_CREDENTIALS: 'Invalid email or sponsor code. Please check your credentials and try again.',
  ACCOUNT_INACTIVE: 'Your sponsor account is not active. Please contact us for assistance.',
  ACCOUNT_NOT_VISIBLE: 'Your sponsor account is not accessible. Please contact us for assistance.',
  SESSION_EXPIRED: 'Your session has expired. Please log in again.',
  UNAUTHORIZED: 'You are not authorized to access this resource.',

  // Validation errors
  INVALID_EMAIL: 'Please enter a valid email address.',
  INVALID_SPONSOR_CODE: 'Sponsor code must be in format BAN-YYYY-XXX.',
  INVALID_DONATION_AMOUNT: 'Donation amount must be between $1 and $1,000,000.',
  MISSING_REQUIRED_FIELD: (field: string) => `${field} is required.`,

  // Rate limiting
  TOO_MANY_REQUESTS: 'Too many requests. Please try again later.',
  UPDATE_REQUEST_THROTTLED: (daysRemaining: number) =>
    `You can request a new update in ${daysRemaining} days.`,

  // Server errors
  STRIPE_ERROR: 'Payment processing error. Please try again.',
  EMAIL_FAILED: 'Failed to send email. Please contact support if the issue persists.',
  SERVER_ERROR: 'An unexpected error occurred. Please try again later.',

  // Not found
  SPONSORSHIP_NOT_FOUND: 'Sponsorship not found.',
  UPDATE_NOT_FOUND: 'Update not found.',
} as const;

// ============================================================================
// LOGGING
// ============================================================================

export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
} as const;

// ============================================================================
// ADMIN AUTHENTICATION
// ============================================================================

export const ADMIN = {
  AUTH_HEADER: 'X-Admin-Token',
  // The real cookie name lives in src/lib/admin-session.ts
  // (ban_admin_session); nothing reads this constant.
} as const;
