/**
 * Environment variable validation and access
 *
 * Nothing is hard-required at module load any more. Until 2026-09-14
 * this file threw at startup if five AIRTABLE_* variables were missing,
 * which meant deleting the retired Airtable credentials from Vercel
 * would have taken the whole site down, not just Airtable features.
 * Postgres (DATABASE_URL) is checked lazily by src/lib/db/client.ts so
 * a missing value fails the one request that needs it with a clear
 * message instead of crashing every route.
 */

interface EnvironmentVariables {
  // Cron auth
  CRON_SECRET?: string;

  // Stripe (optional until configured)
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?: string;

  // Email Service (SendGrid or Gmail)
  SENDGRID_API_KEY?: string;
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
  GMAIL_USER_EMAIL?: string;
  GMAIL_FROM_EMAIL?: string;

  // Admin
  ADMIN_API_TOKEN?: string;

  // Optional - Analytics
  NEXT_PUBLIC_GA_MEASUREMENT_ID?: string;
}

/**
 * Reads the environment once and warns (outside production) about
 * recommended variables that are missing.
 */
function readEnvironment(): EnvironmentVariables {
  const recommendedVars = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'ADMIN_API_TOKEN', 'DATABASE_URL'];
  const missingRecommended = recommendedVars.filter(name => !process.env[name]);

  if (missingRecommended.length > 0 && process.env.NODE_ENV !== 'production') {
    console.warn(
      `⚠️  Missing recommended environment variables: ${missingRecommended.join(', ')}`
    );
  }

  return {
    CRON_SECRET: process.env.CRON_SECRET,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET,
    GMAIL_REFRESH_TOKEN: process.env.GMAIL_REFRESH_TOKEN,
    GMAIL_USER_EMAIL: process.env.GMAIL_USER_EMAIL,
    GMAIL_FROM_EMAIL: process.env.GMAIL_FROM_EMAIL,
    ADMIN_API_TOKEN: process.env.ADMIN_API_TOKEN,
    NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
  };
}

let env: EnvironmentVariables | undefined;

/**
 * Get environment variables
 * Safe to use throughout the application
 */
export function getEnv(): EnvironmentVariables {
  if (!env) {
    env = readEnvironment();
  }
  return env;
}

/**
 * Check if a specific optional environment variable is configured
 */
export function hasEnv(key: keyof EnvironmentVariables): boolean {
  const envVars = getEnv();
  return !!envVars[key];
}

/**
 * Get Stripe configuration
 * @throws {Error} if Stripe is not configured
 */
export function getStripeConfig() {
  const envVars = getEnv();

  if (!envVars.STRIPE_SECRET_KEY || !envVars.STRIPE_WEBHOOK_SECRET) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET environment variables.');
  }

  return {
    secretKey: envVars.STRIPE_SECRET_KEY,
    webhookSecret: envVars.STRIPE_WEBHOOK_SECRET,
    publishableKey: envVars.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  };
}

/**
 * Check if Stripe is configured
 */
export function isStripeConfigured(): boolean {
  const envVars = getEnv();
  return !!(envVars.STRIPE_SECRET_KEY && envVars.STRIPE_WEBHOOK_SECRET);
}

/**
 * Get SendGrid configuration
 */
export function getSendGridConfig() {
  const envVars = getEnv();

  if (!envVars.SENDGRID_API_KEY) {
    throw new Error('SendGrid is not configured. Set SENDGRID_API_KEY environment variable.');
  }

  return {
    apiKey: envVars.SENDGRID_API_KEY,
  };
}

/**
 * Get email service configuration
 * Supports both SendGrid and Gmail
 */
export function getEmailConfig() {
  const envVars = getEnv();
  const useGmail = !!(envVars.GMAIL_CLIENT_ID && envVars.GMAIL_CLIENT_SECRET && envVars.GMAIL_REFRESH_TOKEN);
  const useSendGrid = !!envVars.SENDGRID_API_KEY;

  return {
    enabled: useGmail || useSendGrid,
    provider: useGmail ? 'gmail' : 'sendgrid',
    // SendGrid config
    sendgridApiKey: envVars.SENDGRID_API_KEY || '',
    // Gmail config
    gmailClientId: envVars.GMAIL_CLIENT_ID,
    gmailClientSecret: envVars.GMAIL_CLIENT_SECRET,
    gmailRefreshToken: envVars.GMAIL_REFRESH_TOKEN,
    gmailUserEmail: envVars.GMAIL_USER_EMAIL || envVars.GMAIL_FROM_EMAIL,
    // Common config
    fromEmail: process.env.GMAIL_FROM_EMAIL || process.env.SENDGRID_FROM_EMAIL || 'info@beanumber.org',
    fromName: process.env.GMAIL_FROM_NAME || process.env.SENDGRID_FROM_NAME || 'Be A Number, International',
  };
}

/**
 * Get admin authentication token
 */
export function getAdminToken(): string {
  const envVars = getEnv();

  if (!envVars.ADMIN_API_TOKEN) {
    throw new Error('Admin authentication is not configured. Set ADMIN_API_TOKEN environment variable.');
  }

  return envVars.ADMIN_API_TOKEN;
}

/**
 * Check if SendGrid is configured
 */
export function isSendGridConfigured(): boolean {
  return hasEnv('SENDGRID_API_KEY');
}

/**
 * Check if Gmail is configured
 */
export function isGmailConfigured(): boolean {
  const envVars = getEnv();
  return !!(
    envVars.GMAIL_CLIENT_ID &&
    envVars.GMAIL_CLIENT_SECRET &&
    envVars.GMAIL_REFRESH_TOKEN
  );
}

/**
 * Check if admin authentication is configured
 */
export function isAdminAuthConfigured(): boolean {
  return hasEnv('ADMIN_API_TOKEN');
}

/**
 * Check if analytics is configured
 */
export function isAnalyticsConfigured(): boolean {
  return hasEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID');
}
