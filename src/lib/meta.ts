/**
 * Meta API Service (Facebook & Instagram)
 *
 * Handles authentication and API calls to Meta Graph API for:
 * - Instagram content publishing (Reels, Images, Carousels, Stories)
 * - Facebook Page posting
 * - Token management and refresh
 *
 * This module follows the WAT architecture pattern:
 * - Returns structured results { success, data?, error? }
 * - Never throws unhandled exceptions
 * - Logs all operations
 *
 * Required Environment Variables:
 * - META_APP_ID: Meta App ID from developer console
 * - META_APP_SECRET: Meta App Secret
 * - META_ACCESS_TOKEN: Long-lived User Access Token
 * - META_INSTAGRAM_ACCOUNT_ID: Instagram Business Account ID
 * - META_FACEBOOK_PAGE_ID: Linked Facebook Page ID
 */

import { logger } from './logger';

// ============================================================================
// TYPES
// ============================================================================

export interface MetaConfig {
  appId: string;
  appSecret: string;
  accessToken: string;
  instagramAccountId: string;
  facebookPageId: string;
  tokenExpiresAt?: Date;
}

export interface MetaApiResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface InstagramMediaContainer {
  id: string;
}

export interface InstagramPublishResult {
  id: string;
  permalink?: string;
}

export interface FacebookPostResult {
  id: string;
  post_id?: string;
}

export interface TokenRefreshResult {
  accessToken: string;
  expiresIn: number;
  expiresAt: Date;
}

export interface InstagramAccountInfo {
  id: string;
  username: string;
  name?: string;
  profilePictureUrl?: string;
  followersCount?: number;
  mediaCount?: number;
}

export type InstagramMediaType = 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REELS' | 'STORIES';

export interface InstagramMediaInput {
  type: InstagramMediaType;
  mediaUrl: string;  // Public URL to the media file
  caption?: string;
  coverUrl?: string;  // For reels: thumbnail URL
  shareToFeed?: boolean;  // For reels: also show in feed
  children?: Array<{ mediaUrl: string; type: 'IMAGE' | 'VIDEO' }>;  // For carousels
}

// ============================================================================
// CONSTANTS
// ============================================================================

const META_API_BASE = 'https://graph.facebook.com/v19.0';
const TOKEN_REFRESH_THRESHOLD_DAYS = 7;

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Check if Meta API is configured
 */
export function isMetaConfigured(): boolean {
  return !!(
    process.env.META_APP_ID &&
    process.env.META_APP_SECRET &&
    process.env.META_ACCESS_TOKEN &&
    process.env.META_INSTAGRAM_ACCOUNT_ID
  );
}

/**
 * Get Meta API configuration from environment
 */
export function getMetaConfig(): MetaConfig | null {
  if (!isMetaConfigured()) {
    return null;
  }

  return {
    appId: process.env.META_APP_ID!,
    appSecret: process.env.META_APP_SECRET!,
    accessToken: process.env.META_ACCESS_TOKEN!,
    instagramAccountId: process.env.META_INSTAGRAM_ACCOUNT_ID!,
    facebookPageId: process.env.META_FACEBOOK_PAGE_ID || '',
    tokenExpiresAt: process.env.META_TOKEN_EXPIRES_AT
      ? new Date(process.env.META_TOKEN_EXPIRES_AT)
      : undefined,
  };
}

// ============================================================================
// API CLIENT
// ============================================================================

/**
 * Make a request to the Meta Graph API
 */
async function metaApiRequest<T>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'DELETE';
    params?: Record<string, string>;
    body?: Record<string, unknown>;
  } = {}
): Promise<MetaApiResult<T>> {
  const config = getMetaConfig();
  if (!config) {
    return {
      success: false,
      error: 'Meta API is not configured. Please set environment variables.',
    };
  }

  const { method = 'GET', params = {}, body } = options;

  try {
    // Build URL with query params
    const url = new URL(`${META_API_BASE}${endpoint}`);
    url.searchParams.set('access_token', config.accessToken);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    // Make request
    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body && method !== 'GET') {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url.toString(), fetchOptions);
    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data.error?.message || `HTTP ${response.status}`;
      logger.error('Meta API error', { endpoint, status: response.status, error: data.error });

      return {
        success: false,
        error: errorMessage,
      };
    }

    return {
      success: true,
      data: data as T,
    };
  } catch (error: unknown) {
    const err = error as { message?: string };
    logger.error('Meta API request failed', error, { endpoint });

    return {
      success: false,
      error: err.message || 'Failed to make Meta API request',
    };
  }
}

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

/**
 * Check if the access token needs to be refreshed
 */
export function tokenNeedsRefresh(): boolean {
  const config = getMetaConfig();
  if (!config?.tokenExpiresAt) {
    return false; // Can't determine, assume it's fine
  }

  const now = new Date();
  const daysUntilExpiry = (config.tokenExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  return daysUntilExpiry <= TOKEN_REFRESH_THRESHOLD_DAYS;
}

/**
 * Refresh the long-lived access token
 * Note: The new token must be manually saved to environment variables
 */
export async function refreshAccessToken(): Promise<MetaApiResult<TokenRefreshResult>> {
  const config = getMetaConfig();
  if (!config) {
    return {
      success: false,
      error: 'Meta API is not configured',
    };
  }

  const result = await metaApiRequest<{
    access_token: string;
    token_type: string;
    expires_in: number;
  }>('/oauth/access_token', {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: config.appId,
      client_secret: config.appSecret,
      fb_exchange_token: config.accessToken,
    },
  });

  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error || 'Failed to refresh token',
    };
  }

  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + result.data.expires_in);

  logger.info('Meta access token refreshed', { expiresAt: expiresAt.toISOString() });

  return {
    success: true,
    data: {
      accessToken: result.data.access_token,
      expiresIn: result.data.expires_in,
      expiresAt,
    },
  };
}

// ============================================================================
// INSTAGRAM API
// ============================================================================

/**
 * Get Instagram Business Account info
 */
export async function getInstagramAccountInfo(): Promise<MetaApiResult<InstagramAccountInfo>> {
  const config = getMetaConfig();
  if (!config) {
    return {
      success: false,
      error: 'Meta API is not configured',
    };
  }

  return metaApiRequest<InstagramAccountInfo>(`/${config.instagramAccountId}`, {
    params: {
      fields: 'id,username,name,profile_picture_url,followers_count,media_count',
    },
  });
}

/**
 * Create a media container for Instagram posting
 * This is step 1 of the 2-step publishing process
 */
export async function createInstagramMediaContainer(
  input: InstagramMediaInput
): Promise<MetaApiResult<InstagramMediaContainer>> {
  const config = getMetaConfig();
  if (!config) {
    return {
      success: false,
      error: 'Meta API is not configured',
    };
  }

  const params: Record<string, string> = {};

  switch (input.type) {
    case 'IMAGE':
      params.image_url = input.mediaUrl;
      if (input.caption) params.caption = input.caption;
      break;

    case 'VIDEO':
      params.video_url = input.mediaUrl;
      params.media_type = 'VIDEO';
      if (input.caption) params.caption = input.caption;
      break;

    case 'REELS':
      params.video_url = input.mediaUrl;
      params.media_type = 'REELS';
      if (input.caption) params.caption = input.caption;
      if (input.coverUrl) params.cover_url = input.coverUrl;
      if (input.shareToFeed !== undefined) {
        params.share_to_feed = input.shareToFeed.toString();
      }
      break;

    case 'STORIES':
      if (input.mediaUrl.includes('.mp4') || input.mediaUrl.includes('.mov')) {
        params.video_url = input.mediaUrl;
      } else {
        params.image_url = input.mediaUrl;
      }
      params.media_type = 'STORIES';
      break;

    case 'CAROUSEL_ALBUM':
      if (!input.children || input.children.length < 2) {
        return {
          success: false,
          error: 'Carousel requires at least 2 children items',
        };
      }
      // Carousels require creating child containers first
      // This is handled separately
      break;
  }

  logger.info('Creating Instagram media container', { type: input.type });

  return metaApiRequest<InstagramMediaContainer>(`/${config.instagramAccountId}/media`, {
    method: 'POST',
    params,
  });
}

/**
 * Publish a media container to Instagram
 * This is step 2 of the 2-step publishing process
 */
export async function publishInstagramMedia(
  containerId: string
): Promise<MetaApiResult<InstagramPublishResult>> {
  const config = getMetaConfig();
  if (!config) {
    return {
      success: false,
      error: 'Meta API is not configured',
    };
  }

  logger.info('Publishing Instagram media', { containerId });

  return metaApiRequest<InstagramPublishResult>(`/${config.instagramAccountId}/media_publish`, {
    method: 'POST',
    params: {
      creation_id: containerId,
    },
  });
}

/**
 * Check the status of a media container (for videos/reels)
 * Videos need time to process before they can be published
 */
export async function checkMediaContainerStatus(
  containerId: string
): Promise<MetaApiResult<{ status: string; status_code?: string }>> {
  return metaApiRequest<{ status: string; status_code?: string }>(`/${containerId}`, {
    params: {
      fields: 'status,status_code',
    },
  });
}

/**
 * Wait for media container to be ready (for videos/reels)
 * Polls until status is FINISHED or times out
 */
export async function waitForMediaReady(
  containerId: string,
  maxWaitMs: number = 60000,
  pollIntervalMs: number = 5000
): Promise<MetaApiResult<void>> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const result = await checkMediaContainerStatus(containerId);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    const status = result.data?.status_code || result.data?.status;

    if (status === 'FINISHED') {
      return { success: true };
    }

    if (status === 'ERROR') {
      return {
        success: false,
        error: 'Media processing failed',
      };
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  return {
    success: false,
    error: 'Timeout waiting for media to be ready',
  };
}

/**
 * Post content to Instagram (complete flow)
 * Handles container creation, waiting for processing, and publishing
 */
export async function postToInstagram(
  input: InstagramMediaInput
): Promise<MetaApiResult<InstagramPublishResult>> {
  // Step 1: Create container
  const containerResult = await createInstagramMediaContainer(input);
  if (!containerResult.success || !containerResult.data) {
    return {
      success: false,
      error: containerResult.error || 'Failed to create media container',
    };
  }

  const containerId = containerResult.data.id;

  // Step 2: For videos/reels, wait for processing
  if (input.type === 'VIDEO' || input.type === 'REELS') {
    const waitResult = await waitForMediaReady(containerId);
    if (!waitResult.success) {
      return {
        success: false,
        error: waitResult.error || 'Media processing failed',
      };
    }
  }

  // Step 3: Publish
  const publishResult = await publishInstagramMedia(containerId);
  if (!publishResult.success) {
    return {
      success: false,
      error: publishResult.error,
    };
  }

  logger.info('Posted to Instagram successfully', {
    mediaId: publishResult.data?.id,
    type: input.type,
  });

  return publishResult;
}

// ============================================================================
// FACEBOOK API
// ============================================================================

/**
 * Post to Facebook Page
 */
export async function postToFacebook(input: {
  message?: string;
  link?: string;
  photoUrl?: string;
  videoUrl?: string;
}): Promise<MetaApiResult<FacebookPostResult>> {
  const config = getMetaConfig();
  if (!config || !config.facebookPageId) {
    return {
      success: false,
      error: 'Facebook Page is not configured',
    };
  }

  let endpoint = `/${config.facebookPageId}/feed`;
  const params: Record<string, string> = {};

  if (input.message) {
    params.message = input.message;
  }

  if (input.link) {
    params.link = input.link;
  }

  if (input.photoUrl) {
    endpoint = `/${config.facebookPageId}/photos`;
    params.url = input.photoUrl;
  }

  if (input.videoUrl) {
    endpoint = `/${config.facebookPageId}/videos`;
    params.file_url = input.videoUrl;
  }

  logger.info('Posting to Facebook', { hasMessage: !!input.message, hasPhoto: !!input.photoUrl });

  const result = await metaApiRequest<FacebookPostResult>(endpoint, {
    method: 'POST',
    params,
  });

  if (result.success) {
    logger.info('Posted to Facebook successfully', { postId: result.data?.id });
  }

  return result;
}

// ============================================================================
// RATE LIMIT HELPERS
// ============================================================================

/**
 * Rate limit tracking
 * Meta allows 200 API calls per hour per account
 */
let apiCallCount = 0;
let apiCallResetTime = Date.now() + 3600000;

/**
 * Check if we're approaching the rate limit
 */
export function isNearRateLimit(): boolean {
  if (Date.now() > apiCallResetTime) {
    apiCallCount = 0;
    apiCallResetTime = Date.now() + 3600000;
  }
  return apiCallCount >= 180; // Leave buffer of 20 calls
}

/**
 * Increment API call counter
 */
export function incrementApiCallCount(): void {
  apiCallCount++;
}

/**
 * Get current rate limit status
 */
export function getRateLimitStatus(): { callsUsed: number; callsRemaining: number; resetsAt: Date } {
  if (Date.now() > apiCallResetTime) {
    apiCallCount = 0;
    apiCallResetTime = Date.now() + 3600000;
  }

  return {
    callsUsed: apiCallCount,
    callsRemaining: 200 - apiCallCount,
    resetsAt: new Date(apiCallResetTime),
  };
}
