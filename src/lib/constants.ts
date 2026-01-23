/**
 * Application-wide constants
 * Centralizes all magic strings, values, and configuration
 */

// ============================================================================
// AIRTABLE FIELD NAMES
// ============================================================================

export const AIRTABLE_FIELDS = {
  // Sponsorships table
  SPONSORSHIPS: {
    SPONSOR_CODE: 'SponsorCode',
    SPONSOR_EMAIL: 'SponsorEmail',
    SPONSOR_NAME: 'SponsorName',
    CHILD_ID: 'ChildID',
    CHILD_DISPLAY_NAME: 'ChildDisplayName',
    CHILD_PHOTO: 'ChildPhoto',
    CHILD_AGE: 'ChildAge',
    CHILD_LOCATION: 'ChildLocation',
    SPONSORSHIP_START_DATE: 'SponsorshipStartDate',
    AUTH_STATUS: 'AuthStatus',
    STATUS: 'Status',
    VISIBLE_TO_SPONSOR: 'VisibleToSponsor',
    LAST_REQUEST_AT: 'LastRequestAt',
    NEXT_REQUEST_ELIGIBLE_AT: 'NextRequestEligibleAt',
  },

  // Updates table
  UPDATES: {
    CHILD_ID: 'ChildID',
    SPONSOR_CODE: 'SponsorCode',
    UPDATE_TYPE: 'UpdateType',
    TITLE: 'Title',
    CONTENT: 'Content',
    PHOTOS: 'Photos',
    STATUS: 'Status',
    VISIBLE_TO_SPONSOR: 'VisibleToSponsor',
    REQUESTED_BY_SPONSOR: 'RequestedBySponsor',
    REQUESTED_AT: 'RequestedAt',
    PUBLISHED_AT: 'PublishedAt',
    SUBMITTED_BY: 'SubmittedBy',
    SUBMITTED_AT: 'SubmittedAt',
  },

  // Donors table
  DONORS: {
    DONOR_NAME: 'Donor Name',
    EMAIL_ADDRESS: 'Email Address',
    ORGANIZATION_NAME: 'Organization Name',
    PHONE_NUMBER: 'Phone Number',
    MAILING_ADDRESS: 'Mailing Address',
    STRIPE_CUSTOMER_ID: 'Stripe Customer ID',
  },

  // Donations table
  DONATIONS: {
    STRIPE_PAYMENT_INTENT_ID: 'Stripe Payment Intent ID',
    STRIPE_CHECKOUT_SESSION_ID: 'Stripe Checkout Session ID',
    STRIPE_CUSTOMER_ID: 'Stripe Customer ID',
    DONATION_AMOUNT: 'Donation Amount',
    CURRENCY: 'Currency',
    DONATION_DATE: 'Donation Date',
    PAYMENT_STATUS: 'Payment Status',
    RECURRING_DONATION: 'Recurring Donation',
    DONOR: 'Donor',
    DONOR_EMAIL_AT_DONATION: 'Donor Email at Donation',
    DONATION_SOURCE: 'Donation Source',
    SUBSCRIPTION_ID: 'Subscription ID',
    ADDRESS_LINE_1: 'Address Line 1',
    CITY: 'City',
    STATE: 'State',
    POSTAL_CODE: 'Postal Code',
    COUNTRY: 'Country',
  },

  // Children table (new)
  CHILDREN: {
    CHILD_ID: 'ChildID',
    FIRST_NAME: 'FirstName',
    LAST_INITIAL: 'LastInitial',
    STATUS: 'Status',
    SCHOOL_LOCATION: 'SchoolLocation',
    GRADE_CLASS: 'GradeClass',
    EXPECTED_FIELD_PERIOD: 'ExpectedFieldPeriod',
    EXPECTED_ACADEMIC_TERM: 'ExpectedAcademicTerm',
    LAST_FIELD_UPDATE_DATE: 'LastFieldUpdateDate',
    LAST_ACADEMIC_UPDATE_DATE: 'LastAcademicUpdateDate',
  },

  // Child Updates table (new canonical update system)
  CHILD_UPDATES: {
    UPDATE_ID: 'UpdateID',
    CHILD: 'Child', // Link to Children table
    CHILD_ID: 'ChildID', // Lookup from Child
    SOURCE_TYPE: 'SourceType',
    PERIOD: 'Period',
    ACADEMIC_TERM: 'AcademicTerm',
    SUBMITTED_AT: 'SubmittedAt',
    SUBMITTED_BY: 'SubmittedBy',
    STATUS: 'Status',
    // Field update payload
    PHYSICAL_WELLBEING: 'PhysicalWellbeing',
    PHYSICAL_NOTES: 'PhysicalNotes',
    EMOTIONAL_WELLBEING: 'EmotionalWellbeing',
    EMOTIONAL_NOTES: 'EmotionalNotes',
    SCHOOL_ENGAGEMENT: 'SchoolEngagement',
    ENGAGEMENT_NOTES: 'EngagementNotes',
    SPONSOR_NARRATIVE: 'SponsorNarrative',
    POSITIVE_HIGHLIGHT: 'PositiveHighlight',
    CHALLENGE: 'Challenge',
    // Academic payload
    ATTENDANCE_PERCENT: 'AttendancePercent',
    ENGLISH_GRADE: 'EnglishGrade',
    MATH_GRADE: 'MathGrade',
    SCIENCE_GRADE: 'ScienceGrade',
    SOCIAL_STUDIES_GRADE: 'SocialStudiesGrade',
    TEACHER_COMMENT: 'TeacherComment',
    // Drive file references
    DRIVE_FOLDER_ID: 'DriveFolderID',
    PHOTO_1_FILE_ID: 'Photo1FileID',
    PHOTO_2_FILE_ID: 'Photo2FileID',
    PHOTO_3_FILE_ID: 'Photo3FileID',
    HANDWRITTEN_NOTE_FILE_ID: 'HandwrittenNoteFileID',
    REPORT_CARD_FILE_ID: 'ReportCardFileID',
    // Governance
    REVIEWED_BY: 'ReviewedBy',
    REVIEWED_AT: 'ReviewedAt',
    REJECTION_REASON: 'RejectionReason',
    CORRECTION_NOTES: 'CorrectionNotes',
    SUPERSEDES_UPDATE: 'SupersedesUpdate',
    SUPERSEDED_BY: 'SupersededBy',
  },
} as const;

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

export const UPDATE_STATUS = {
  PENDING_REVIEW: 'Pending Review',
  PUBLISHED: 'Published',
  REJECTED: 'Rejected',
} as const;

// Child Update System statuses (matches Airtable single select options)
export const CHILD_UPDATE_STATUS = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Pending Review',
  PUBLISHED: 'Published',
  REJECTED: 'Rejected',
  // Optional: Add 'Needs Correction' to Airtable if you want this workflow state
  NEEDS_CORRECTION: 'Needs Correction',
} as const;

export const SOURCE_TYPE = {
  FIELD: 'field',
  ACADEMIC: 'academic',
} as const;

export const CHILD_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PAUSED: 'paused',
  ARCHIVED: 'archived',
} as const;

// Role-based system emails
export const ROLE_EMAILS = {
  FIELD_UPDATES: 'field-updates@beanumber.org',
  ACADEMICS: 'academics@beanumber.org',
  ADMIN: 'admin@beanumber.org',
} as const;

export const UPDATE_TYPES = {
  PROGRESS_REPORT: 'Progress Report',
  PHOTO_UPDATE: 'Photo Update',
  SPECIAL_NOTE: 'Special Note',
  HOLIDAY_GREETING: 'Holiday Greeting',
  MILESTONE: 'Milestone',
} as const;

export const PAYMENT_STATUS = {
  SUCCEEDED: 'Succeeded',
  PENDING: 'Pending',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
} as const;

// ============================================================================
// SESSION & AUTHENTICATION
// ============================================================================

export const SESSION = {
  COOKIE_NAME: 'sponsor_session',
  MAX_AGE: 30 * 24 * 60 * 60, // 30 days in seconds
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
  SPONSORSHIP: '/sponsorship',
  SPONSOR_LOGIN: '/sponsor/login',
  SPONSOR_DASHBOARD: (code: string) => `/sponsor/${code}`,
  DONATE_SUCCESS: '/donate/success',
  ADMIN_DASHBOARD: '/admin/dashboard',
  ADMIN_UPDATES_SUBMIT: '/admin/updates/submit',

  API: {
    SPONSOR_VERIFY: '/api/sponsor/verify',
    SPONSOR_LOGOUT: '/api/sponsor/logout',
    SPONSOR_UPDATES: '/api/sponsor/updates',
    SPONSOR_REQUEST_UPDATE: '/api/sponsor/request-update',
    SPONSORSHIP_AVAILABLE: '/api/sponsorship/available',
    SPONSORSHIP_CREATE: '/api/sponsorship/create',
    ADMIN_UPDATES_SUBMIT: '/api/admin/updates/submit',
    ADMIN_UPDATES_LIST: '/api/admin/updates/list',
    ADMIN_UPDATES_PUBLISH: '/api/admin/updates/publish',
    CREATE_CHECKOUT: '/api/create-checkout',
    STRIPE_WEBHOOK: '/api/webhooks/stripe',
  },
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
  AIRTABLE_ERROR: 'Unable to connect to database. Please try again later.',
  STRIPE_ERROR: 'Payment processing error. Please try again.',
  EMAIL_FAILED: 'Failed to send email. Please contact support if the issue persists.',
  SERVER_ERROR: 'An unexpected error occurred. Please try again later.',

  // Not found
  SPONSORSHIP_NOT_FOUND: 'Sponsorship not found.',
  UPDATE_NOT_FOUND: 'Update not found.',
} as const;

// ============================================================================
// SUCCESS MESSAGES
// ============================================================================

export const SUCCESS_MESSAGES = {
  LOGIN_SUCCESS: 'Successfully logged in!',
  LOGOUT_SUCCESS: 'Successfully logged out.',
  UPDATE_REQUESTED: 'Your update request has been submitted. You will receive an update within 2-3 weeks.',
  UPDATE_SUBMITTED: 'Update submitted successfully for review.',
  DONATION_SUCCESS: 'Thank you for your generous donation!',
} as const;

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

export const CACHE = {
  // Next.js revalidate times (in seconds)
  REVALIDATE: {
    SPONSORSHIP_DATA: 300, // 5 minutes
    UPDATES_LIST: 300, // 5 minutes
    STATIC_PAGES: 3600, // 1 hour
  },
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
  SESSION_COOKIE: 'admin_session',
} as const;
