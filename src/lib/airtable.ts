/**
 * Airtable database abstraction layer
 * Centralizes all Airtable queries with caching and error handling
 */

import { getAirtableConfig } from './env';
import { logger, startTimer } from './logger';
import { DatabaseError } from './errors';
import { AIRTABLE_FIELDS, AUTH_STATUS, UPDATE_STATUS, CACHE } from './constants';
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

// Export client for advanced usage
export { airtableClient };
