/**
 * Airtable database abstraction layer
 * Centralizes all Airtable queries with caching and error handling
 */

import { getAirtableConfig } from './env';
import { logger, startTimer } from './logger';
import { DatabaseError } from './errors';
import { AIRTABLE_FIELDS, AUTH_STATUS, UPDATE_STATUS, SPONSORSHIP_STATUS, CACHE } from './constants';
import type {
  AirtableSponsorshipRecord,
  AirtableUpdateRecord,
  AirtableListResponse,
  SponsorshipFields,
  UpdateFields,
  ChildProfile,
  SponsorUpdate,
} from './types/airtable';

// ============================================================================
// AIRTABLE CLIENT
// ============================================================================

class AirtableClient {
  private baseUrl: string;
  private apiKey: string;
  private tables: {
    sponsorships: string;
    updates: string;
  };

  constructor() {
    const config = getAirtableConfig();
    this.baseUrl = `https://api.airtable.com/v0/${config.baseId}`;
    this.apiKey = config.apiKey;
    this.tables = config.tables;
  }

  /**
   * Make a request to Airtable API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const timer = startTimer(`Airtable request: ${endpoint}`);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      const duration = timer.end();

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.error('Airtable API error', undefined, {
          status: response.status,
          statusText: response.statusText,
          errorData,
          endpoint,
        });

        throw new DatabaseError(
          `Airtable API error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      logger.dbQuery(endpoint.split('/')[1] || 'unknown', 'request', {
        duration_ms: duration,
        endpoint,
      });

      return data as T;
    } catch (error) {
      timer.end();

      if (error instanceof DatabaseError) {
        throw error;
      }

      logger.dbError('airtable', 'request', error, { endpoint });
      throw new DatabaseError('Failed to connect to database');
    }
  }

  /**
   * List records from a table
   */
  async listRecords<T>(
    tableName: string,
    params?: {
      filterByFormula?: string;
      maxRecords?: number;
      sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
      fields?: string[];
    }
  ): Promise<AirtableListResponse<T>> {
    const searchParams = new URLSearchParams();

    if (params?.filterByFormula) {
      searchParams.append('filterByFormula', params.filterByFormula);
    }

    if (params?.maxRecords) {
      searchParams.append('maxRecords', String(params.maxRecords));
    }

    if (params?.sort) {
      params.sort.forEach((s, i) => {
        searchParams.append(`sort[${i}][field]`, s.field);
        searchParams.append(`sort[${i}][direction]`, s.direction);
      });
    }

    if (params?.fields) {
      params.fields.forEach((field) => {
        searchParams.append('fields[]', field);
      });
    }

    const query = searchParams.toString();
    const endpoint = `/${encodeURIComponent(tableName)}${query ? `?${query}` : ''}`;

    return this.request<AirtableListResponse<T>>(endpoint);
  }

  /**
   * Get a single record by ID
   */
  async getRecord<T>(tableName: string, recordId: string): Promise<T> {
    const endpoint = `/${encodeURIComponent(tableName)}/${recordId}`;
    return this.request<T>(endpoint);
  }

  /**
   * Create a new record
   */
  async createRecord<T>(tableName: string, fields: Record<string, unknown>): Promise<T> {
    const endpoint = `/${encodeURIComponent(tableName)}`;
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify({ fields }),
    });
  }

  /**
   * Update a record
   */
  async updateRecord<T>(
    tableName: string,
    recordId: string,
    fields: Record<string, unknown>
  ): Promise<T> {
    const endpoint = `/${encodeURIComponent(tableName)}/${recordId}`;
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify({ fields }),
    });
  }

  /**
   * Delete a record
   */
  async deleteRecord(tableName: string, recordId: string): Promise<void> {
    const endpoint = `/${encodeURIComponent(tableName)}/${recordId}`;
    await this.request(endpoint, { method: 'DELETE' });
  }
}

// Singleton instance
const airtableClient = new AirtableClient();

// ============================================================================
// SPONSORSHIPS QUERIES
// ============================================================================

/**
 * Find sponsorship by email and code
 */
export async function findSponsorshipByCredentials(
  email: string,
  code: string
): Promise<AirtableSponsorshipRecord | null> {
  logger.dbQuery('sponsorships', 'findByCredentials', {
    email: logger.maskEmail(email),
    code: logger.maskSponsorCode(code),
  });

  const formula = `AND(
    {${AIRTABLE_FIELDS.SPONSORSHIPS.SPONSOR_EMAIL}}="${email}",
    {${AIRTABLE_FIELDS.SPONSORSHIPS.SPONSOR_CODE}}="${code}",
    {${AIRTABLE_FIELDS.SPONSORSHIPS.AUTH_STATUS}}="${AUTH_STATUS.ACTIVE}",
    {${AIRTABLE_FIELDS.SPONSORSHIPS.VISIBLE_TO_SPONSOR}}=1
  )`;

  try {
    const response = await airtableClient.listRecords<AirtableSponsorshipRecord>(
      airtableClient['tables'].sponsorships,
      {
        filterByFormula: formula,
        maxRecords: 1,
      }
    );

    return response.records[0] || null;
  } catch (error) {
    logger.dbError('sponsorships', 'findByCredentials', error);
    throw error;
  }
}

/**
 * Find sponsorship by code (for session validation)
 */
export async function findSponsorshipByCode(
  code: string
): Promise<AirtableSponsorshipRecord | null> {
  logger.dbQuery('sponsorships', 'findByCode', {
    code: logger.maskSponsorCode(code),
  });

  const formula = `AND(
    {${AIRTABLE_FIELDS.SPONSORSHIPS.SPONSOR_CODE}}="${code}",
    {${AIRTABLE_FIELDS.SPONSORSHIPS.AUTH_STATUS}}="${AUTH_STATUS.ACTIVE}",
    {${AIRTABLE_FIELDS.SPONSORSHIPS.VISIBLE_TO_SPONSOR}}=1
  )`;

  try {
    const response = await airtableClient.listRecords<AirtableSponsorshipRecord>(
      airtableClient['tables'].sponsorships,
      {
        filterByFormula: formula,
        maxRecords: 1,
      }
    );

    return response.records[0] || null;
  } catch (error) {
    logger.dbError('sponsorships', 'findByCode', error);
    throw error;
  }
}

/**
 * Update sponsorship request tracking fields
 */
export async function updateSponsorshipRequestTracking(
  recordId: string,
  lastRequestAt: string,
  nextEligibleAt: string
): Promise<void> {
  logger.dbQuery('sponsorships', 'updateRequestTracking', { recordId });

  try {
    await airtableClient.updateRecord(
      airtableClient['tables'].sponsorships,
      recordId,
      {
        [AIRTABLE_FIELDS.SPONSORSHIPS.LAST_REQUEST_AT]: lastRequestAt,
        [AIRTABLE_FIELDS.SPONSORSHIPS.NEXT_REQUEST_ELIGIBLE_AT]: nextEligibleAt,
      }
    );
  } catch (error) {
    logger.dbError('sponsorships', 'updateRequestTracking', error);
    throw error;
  }
}

/**
 * Transform sponsorship record to child profile
 */
export function sponsorshipToChildProfile(
  record: AirtableSponsorshipRecord
): ChildProfile {
  const fields = record.fields;

  return {
    id: fields.ChildID,
    displayName: fields.ChildDisplayName,
    age: fields.ChildAge,
    location: fields.ChildLocation,
    photo: fields.ChildPhoto?.[0]
      ? {
          url: fields.ChildPhoto[0].url,
          filename: fields.ChildPhoto[0].filename,
        }
      : undefined,
    sponsorshipStartDate: fields.SponsorshipStartDate,
  };
}

// ============================================================================
// UPDATES QUERIES
// ============================================================================

/**
 * Find updates for a child
 */
export async function findUpdatesForChild(
  childId: string
): Promise<AirtableUpdateRecord[]> {
  logger.dbQuery('updates', 'findForChild', { childId });

  const formula = `AND(
    {${AIRTABLE_FIELDS.UPDATES.CHILD_ID}}="${childId}",
    {${AIRTABLE_FIELDS.UPDATES.STATUS}}="${UPDATE_STATUS.PUBLISHED}",
    {${AIRTABLE_FIELDS.UPDATES.VISIBLE_TO_SPONSOR}}=1
  )`;

  try {
    const response = await airtableClient.listRecords<AirtableUpdateRecord>(
      airtableClient['tables'].updates,
      {
        filterByFormula: formula,
        sort: [
          { field: AIRTABLE_FIELDS.UPDATES.PUBLISHED_AT, direction: 'desc' },
        ],
      }
    );

    return response.records;
  } catch (error) {
    logger.dbError('updates', 'findForChild', error);
    throw error;
  }
}

/**
 * Create update request
 */
export async function createUpdateRequest(
  childId: string,
  sponsorCode: string
): Promise<AirtableUpdateRecord> {
  logger.dbQuery('updates', 'createRequest', {
    childId,
    sponsorCode: logger.maskSponsorCode(sponsorCode),
  });

  const now = new Date().toISOString();

  try {
    return await airtableClient.createRecord<AirtableUpdateRecord>(
      airtableClient['tables'].updates,
      {
        [AIRTABLE_FIELDS.UPDATES.CHILD_ID]: childId,
        [AIRTABLE_FIELDS.UPDATES.SPONSOR_CODE]: sponsorCode,
        [AIRTABLE_FIELDS.UPDATES.STATUS]: UPDATE_STATUS.PENDING_REVIEW,
        [AIRTABLE_FIELDS.UPDATES.REQUESTED_BY_SPONSOR]: true,
        [AIRTABLE_FIELDS.UPDATES.REQUESTED_AT]: now,
        [AIRTABLE_FIELDS.UPDATES.VISIBLE_TO_SPONSOR]: false,
        [AIRTABLE_FIELDS.UPDATES.TITLE]: 'Update Requested',
        [AIRTABLE_FIELDS.UPDATES.CONTENT]: 'Sponsor requested a new update.',
      }
    );
  } catch (error) {
    logger.dbError('updates', 'createRequest', error);
    throw error;
  }
}

/**
 * Submit update from field team
 */
export async function submitUpdate(data: {
  childId: string;
  sponsorCode?: string;
  updateType: string;
  title: string;
  content: string;
  submittedBy: string;
}): Promise<AirtableUpdateRecord> {
  logger.dbQuery('updates', 'submit', {
    childId: data.childId,
    updateType: data.updateType,
    submittedBy: data.submittedBy,
  });

  const now = new Date().toISOString();

  const fields: Record<string, unknown> = {
    [AIRTABLE_FIELDS.UPDATES.CHILD_ID]: data.childId,
    [AIRTABLE_FIELDS.UPDATES.UPDATE_TYPE]: data.updateType,
    [AIRTABLE_FIELDS.UPDATES.TITLE]: data.title,
    [AIRTABLE_FIELDS.UPDATES.CONTENT]: data.content,
    [AIRTABLE_FIELDS.UPDATES.SUBMITTED_BY]: data.submittedBy,
    [AIRTABLE_FIELDS.UPDATES.SUBMITTED_AT]: now,
    [AIRTABLE_FIELDS.UPDATES.STATUS]: UPDATE_STATUS.PENDING_REVIEW,
    [AIRTABLE_FIELDS.UPDATES.VISIBLE_TO_SPONSOR]: false,
  };

  if (data.sponsorCode) {
    fields[AIRTABLE_FIELDS.UPDATES.SPONSOR_CODE] = data.sponsorCode;
  }

  try {
    return await airtableClient.createRecord<AirtableUpdateRecord>(
      airtableClient['tables'].updates,
      fields
    );
  } catch (error) {
    logger.dbError('updates', 'submit', error);
    throw error;
  }
}

/**
 * Transform update record to sponsor update
 */
export function updateRecordToSponsorUpdate(
  record: AirtableUpdateRecord
): SponsorUpdate {
  const fields = record.fields;

  return {
    id: record.id,
    type: fields.UpdateType,
    title: fields.Title,
    content: fields.Content,
    photos: fields.Photos?.map((photo) => ({
      url: photo.url,
      filename: photo.filename,
    })),
    publishedAt: fields.PublishedAt,
    submittedBy: fields.SubmittedBy,
  };
}

// ============================================================================
// CACHING WRAPPER
// ============================================================================

/**
 * Cache wrapper for Next.js fetch with revalidation
 * Use this for queries that should be cached
 */
export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  revalidate: number = CACHE.REVALIDATE.SPONSORSHIP_DATA
): Promise<T> {
  // Next.js will automatically cache this based on the fetch implementation
  // For now, just call the fetcher directly
  // In the future, we can add Redis or similar caching layer
  return fetcher();
}

/**
 * Get sponsorship with caching
 */
export async function getCachedSponsorshipByCode(
  code: string
): Promise<AirtableSponsorshipRecord | null> {
  return withCache(
    `sponsorship:${code}`,
    () => findSponsorshipByCode(code),
    CACHE.REVALIDATE.SPONSORSHIP_DATA
  );
}

/**
 * Get updates for child with caching
 */
export async function getCachedUpdatesForChild(
  childId: string
): Promise<AirtableUpdateRecord[]> {
  return withCache(
    `updates:${childId}`,
    () => findUpdatesForChild(childId),
    CACHE.REVALIDATE.UPDATES_LIST
  );
}

// ============================================================================
// ADMIN UPDATES QUERIES
// ============================================================================

/**
 * Find all pending updates (for admin review)
 */
export async function findPendingUpdates(): Promise<AirtableUpdateRecord[]> {
  logger.dbQuery('updates', 'findPending', {});

  const formula = `{${AIRTABLE_FIELDS.UPDATES.STATUS}}="${UPDATE_STATUS.PENDING_REVIEW}"`;

  try {
    const response = await airtableClient.listRecords<AirtableUpdateRecord>(
      airtableClient['tables'].updates,
      {
        filterByFormula: formula,
        sort: [
          { field: AIRTABLE_FIELDS.UPDATES.SUBMITTED_AT, direction: 'desc' },
        ],
      }
    );

    return response.records;
  } catch (error) {
    logger.dbError('updates', 'findPending', error);
    throw error;
  }
}

/**
 * Get a single update by ID
 */
export async function getUpdateById(
  updateId: string
): Promise<AirtableUpdateRecord | null> {
  logger.dbQuery('updates', 'getById', { updateId });

  try {
    const record = await airtableClient.getRecord<AirtableUpdateRecord>(
      airtableClient['tables'].updates,
      updateId
    );
    return record;
  } catch (error) {
    logger.dbError('updates', 'getById', error);
    throw error;
  }
}

/**
 * Publish an update (set status to Published, make visible to sponsor)
 */
export async function publishUpdate(
  updateId: string
): Promise<AirtableUpdateRecord> {
  logger.dbQuery('updates', 'publish', { updateId });

  const now = new Date().toISOString();

  try {
    return await airtableClient.updateRecord<AirtableUpdateRecord>(
      airtableClient['tables'].updates,
      updateId,
      {
        [AIRTABLE_FIELDS.UPDATES.STATUS]: UPDATE_STATUS.PUBLISHED,
        [AIRTABLE_FIELDS.UPDATES.VISIBLE_TO_SPONSOR]: true,
        [AIRTABLE_FIELDS.UPDATES.PUBLISHED_AT]: now,
      }
    );
  } catch (error) {
    logger.dbError('updates', 'publish', error);
    throw error;
  }
}

/**
 * Reject an update
 */
export async function rejectUpdate(
  updateId: string
): Promise<AirtableUpdateRecord> {
  logger.dbQuery('updates', 'reject', { updateId });

  try {
    return await airtableClient.updateRecord<AirtableUpdateRecord>(
      airtableClient['tables'].updates,
      updateId,
      {
        [AIRTABLE_FIELDS.UPDATES.STATUS]: UPDATE_STATUS.REJECTED,
        [AIRTABLE_FIELDS.UPDATES.VISIBLE_TO_SPONSOR]: false,
      }
    );
  } catch (error) {
    logger.dbError('updates', 'reject', error);
    throw error;
  }
}

/**
 * Find sponsorship by sponsor code (for notifications)
 */
export async function findSponsorshipBySponsorCode(
  sponsorCode: string
): Promise<AirtableSponsorshipRecord | null> {
  logger.dbQuery('sponsorships', 'findBySponsorCode', {
    sponsorCode: logger.maskSponsorCode(sponsorCode),
  });

  const formula = `{${AIRTABLE_FIELDS.SPONSORSHIPS.SPONSOR_CODE}}="${sponsorCode}"`;

  try {
    const response = await airtableClient.listRecords<AirtableSponsorshipRecord>(
      airtableClient['tables'].sponsorships,
      {
        filterByFormula: formula,
        maxRecords: 1,
      }
    );

    return response.records[0] || null;
  } catch (error) {
    logger.dbError('sponsorships', 'findBySponsorCode', error);
    throw error;
  }
}

/**
 * Find all active sponsorships
 */
export async function findAllActiveSponsorships(): Promise<AirtableSponsorshipRecord[]> {
  logger.dbQuery('sponsorships', 'findAllActive', {});

  const formula = `AND(
    {${AIRTABLE_FIELDS.SPONSORSHIPS.AUTH_STATUS}}="${AUTH_STATUS.ACTIVE}",
    {${AIRTABLE_FIELDS.SPONSORSHIPS.VISIBLE_TO_SPONSOR}}=1
  )`;

  try {
    const response = await airtableClient.listRecords<AirtableSponsorshipRecord>(
      airtableClient['tables'].sponsorships,
      {
        filterByFormula: formula,
        sort: [
          { field: AIRTABLE_FIELDS.SPONSORSHIPS.SPONSOR_CODE, direction: 'asc' },
        ],
      }
    );

    return response.records;
  } catch (error) {
    logger.dbError('sponsorships', 'findAllActive', error);
    throw error;
  }
}

/**
 * Find the most recent published update for a child
 */
export async function findMostRecentUpdateForChild(
  childId: string
): Promise<AirtableUpdateRecord | null> {
  logger.dbQuery('updates', 'findMostRecentForChild', { childId });

  const formula = `AND(
    {${AIRTABLE_FIELDS.UPDATES.CHILD_ID}}="${childId}",
    {${AIRTABLE_FIELDS.UPDATES.STATUS}}="${UPDATE_STATUS.PUBLISHED}"
  )`;

  try {
    const response = await airtableClient.listRecords<AirtableUpdateRecord>(
      airtableClient['tables'].updates,
      {
        filterByFormula: formula,
        sort: [
          { field: AIRTABLE_FIELDS.UPDATES.PUBLISHED_AT, direction: 'desc' },
        ],
        maxRecords: 1,
      }
    );

    return response.records[0] || null;
  } catch (error) {
    logger.dbError('updates', 'findMostRecentForChild', error);
    throw error;
  }
}

/**
 * Find all published updates (for overdue calculation)
 */
export async function findAllPublishedUpdates(): Promise<AirtableUpdateRecord[]> {
  logger.dbQuery('updates', 'findAllPublished', {});

  const formula = `{${AIRTABLE_FIELDS.UPDATES.STATUS}}="${UPDATE_STATUS.PUBLISHED}"`;

  try {
    const response = await airtableClient.listRecords<AirtableUpdateRecord>(
      airtableClient['tables'].updates,
      {
        filterByFormula: formula,
        sort: [
          { field: AIRTABLE_FIELDS.UPDATES.PUBLISHED_AT, direction: 'desc' },
        ],
      }
    );

    return response.records;
  } catch (error) {
    logger.dbError('updates', 'findAllPublished', error);
    throw error;
  }
}

// ============================================================================
// SPONSORSHIP CATALOG QUERIES
// ============================================================================

/**
 * Find all children awaiting sponsors
 */
export async function findAvailableChildren(): Promise<AirtableSponsorshipRecord[]> {
  logger.dbQuery('sponsorships', 'findAvailable', {});

  const formula = `{${AIRTABLE_FIELDS.SPONSORSHIPS.STATUS}}="${SPONSORSHIP_STATUS.AWAITING_SPONSOR}"`;

  try {
    const response = await airtableClient.listRecords<AirtableSponsorshipRecord>(
      airtableClient['tables'].sponsorships,
      {
        filterByFormula: formula,
        sort: [
          { field: AIRTABLE_FIELDS.SPONSORSHIPS.CHILD_DISPLAY_NAME, direction: 'asc' },
        ],
      }
    );

    return response.records;
  } catch (error) {
    logger.dbError('sponsorships', 'findAvailable', error);
    throw error;
  }
}

/**
 * Create a new sponsorship record
 */
export async function createSponsorship(data: {
  sponsorEmail: string;
  sponsorName?: string;
  childId: string;
  childDisplayName: string;
  childPhoto?: SponsorshipFields['ChildPhoto'];
  childAge?: string;
  childLocation?: string;
}): Promise<AirtableSponsorshipRecord> {
  logger.dbQuery('sponsorships', 'create', {
    email: logger.maskEmail(data.sponsorEmail),
    childId: data.childId,
  });

  // Generate sponsor code: BAN-YYYY-XXX
  const year = new Date().getFullYear();
  const randomNum = Math.floor(Math.random() * 900) + 100; // 100-999
  const sponsorCode = `BAN-${year}-${randomNum}`;

  const fields: Record<string, unknown> = {
    [AIRTABLE_FIELDS.SPONSORSHIPS.SPONSOR_CODE]: sponsorCode,
    [AIRTABLE_FIELDS.SPONSORSHIPS.SPONSOR_EMAIL]: data.sponsorEmail,
    [AIRTABLE_FIELDS.SPONSORSHIPS.CHILD_ID]: data.childId,
    [AIRTABLE_FIELDS.SPONSORSHIPS.CHILD_DISPLAY_NAME]: data.childDisplayName,
    [AIRTABLE_FIELDS.SPONSORSHIPS.AUTH_STATUS]: AUTH_STATUS.ACTIVE,
    [AIRTABLE_FIELDS.SPONSORSHIPS.STATUS]: SPONSORSHIP_STATUS.ACTIVE,
    [AIRTABLE_FIELDS.SPONSORSHIPS.VISIBLE_TO_SPONSOR]: true,
    [AIRTABLE_FIELDS.SPONSORSHIPS.SPONSORSHIP_START_DATE]: new Date().toISOString().split('T')[0],
  };

  if (data.sponsorName) {
    fields[AIRTABLE_FIELDS.SPONSORSHIPS.SPONSOR_NAME] = data.sponsorName;
  }
  if (data.childAge) {
    fields[AIRTABLE_FIELDS.SPONSORSHIPS.CHILD_AGE] = data.childAge;
  }
  if (data.childLocation) {
    fields[AIRTABLE_FIELDS.SPONSORSHIPS.CHILD_LOCATION] = data.childLocation;
  }

  try {
    return await airtableClient.createRecord<AirtableSponsorshipRecord>(
      airtableClient['tables'].sponsorships,
      fields
    );
  } catch (error) {
    logger.dbError('sponsorships', 'create', error);
    throw error;
  }
}

/**
 * Update a sponsorship record (for assigning sponsor to awaiting child)
 */
export async function assignSponsorToChild(
  recordId: string,
  sponsorData: {
    sponsorEmail: string;
    sponsorName?: string;
    sponsorCode: string;
  }
): Promise<AirtableSponsorshipRecord> {
  logger.dbQuery('sponsorships', 'assignSponsor', {
    recordId,
    email: logger.maskEmail(sponsorData.sponsorEmail),
  });

  const fields: Record<string, unknown> = {
    [AIRTABLE_FIELDS.SPONSORSHIPS.SPONSOR_CODE]: sponsorData.sponsorCode,
    [AIRTABLE_FIELDS.SPONSORSHIPS.SPONSOR_EMAIL]: sponsorData.sponsorEmail,
    [AIRTABLE_FIELDS.SPONSORSHIPS.AUTH_STATUS]: AUTH_STATUS.ACTIVE,
    [AIRTABLE_FIELDS.SPONSORSHIPS.STATUS]: SPONSORSHIP_STATUS.ACTIVE,
    [AIRTABLE_FIELDS.SPONSORSHIPS.VISIBLE_TO_SPONSOR]: true,
    [AIRTABLE_FIELDS.SPONSORSHIPS.SPONSORSHIP_START_DATE]: new Date().toISOString().split('T')[0],
  };

  if (sponsorData.sponsorName) {
    fields[AIRTABLE_FIELDS.SPONSORSHIPS.SPONSOR_NAME] = sponsorData.sponsorName;
  }

  try {
    return await airtableClient.updateRecord<AirtableSponsorshipRecord>(
      airtableClient['tables'].sponsorships,
      recordId,
      fields
    );
  } catch (error) {
    logger.dbError('sponsorships', 'assignSponsor', error);
    throw error;
  }
}

/**
 * Get sponsorship by record ID
 */
export async function getSponsorshipById(
  recordId: string
): Promise<AirtableSponsorshipRecord | null> {
  logger.dbQuery('sponsorships', 'getById', { recordId });

  try {
    const record = await airtableClient.getRecord<AirtableSponsorshipRecord>(
      airtableClient['tables'].sponsorships,
      recordId
    );
    return record;
  } catch (error) {
    logger.dbError('sponsorships', 'getById', error);
    throw error;
  }
}

// Export client for advanced usage
export { airtableClient };
