/**
 * Available Children API
 * Lists children awaiting sponsors (PUBLIC - no auth required)
 *
 * After pulling sponsorship records from the tool, we do a secondary
 * fetch against the Children table to enrich each child with the
 * hand-written Loves one-liner (used on the sponsorship carousel).
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import {
  createSuccessResponse,
  withErrorHandling,
} from '@/lib/errors';
import { listAvailableChildrenTool } from '@/lib/tools';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!;
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY!;
const AIRTABLE_CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';

interface ChildEnrichment {
  loves?: string;
  childQuote?: string;
  familyContext?: string;
  shirtNumber?: number;
}

/**
 * Batch-fetch profile fields from the Children table for every ChildID
 * in the sponsorship result set. Returns a Map<ChildID, enrichment>.
 */
async function fetchChildEnrichment(childIds: string[]): Promise<Map<string, ChildEnrichment>> {
  const enrichmentMap = new Map<string, ChildEnrichment>();
  if (!childIds.length || !AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) return enrichmentMap;

  try {
    const clauses = childIds.map(id => `{ChildID}="${id}"`).join(',');
    const formula = encodeURIComponent(`OR(${clauses})`);
    const fieldNames = ['ChildID', 'Loves', 'ChildQuote', 'FamilyContext', 'ShirtNumber'];
    const fieldsParam = fieldNames.map(f => 'fields[]=' + encodeURIComponent(f)).join('&');

    const url =
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_CHILDREN_TABLE)}` +
      `?filterByFormula=${formula}&${fieldsParam}&pageSize=100`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (res.ok) {
      const data = await res.json();
      for (const record of data.records || []) {
        const cid = record.fields?.ChildID;
        if (cid) {
          enrichmentMap.set(cid, {
            loves: record.fields?.Loves || undefined,
            childQuote: record.fields?.ChildQuote || undefined,
            familyContext: record.fields?.FamilyContext || undefined,
            shirtNumber: record.fields?.ShirtNumber || undefined,
          });
        }
      }
    }
  } catch (err) {
    logger.warn('[sponsorship/available] Child enrichment failed', { error: String(err) });
  }

  return enrichmentMap;
}

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'GET';
  const path = '/api/sponsorship/available';

  logger.apiRequest(method, path);

  // Parse query params
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  // Use the WAT tool to list available children
  const result = await listAvailableChildrenTool({ limit });

  if (!result.success) {
    throw new Error(result.error || 'Failed to fetch available children');
  }

  // Enrich with profile fields from the Children table
  const children = result.data?.children || [];
  const childIds = children.map(c => c.id).filter(Boolean);
  const enrichmentMap = await fetchChildEnrichment(childIds);

  const enriched = children.map(child => {
    const extra = enrichmentMap.get(child.id);
    return {
      ...child,
      loves: extra?.loves || undefined,
      childQuote: extra?.childQuote || undefined,
      familyContext: extra?.familyContext || undefined,
      shirtNumber: extra?.shirtNumber || undefined,
    };
  });

  logger.info('Listed available children', {
    total: result.data?.total,
    returned: enriched.length,
    enriched: enrichmentMap.size,
  });

  logger.apiResponse(method, path, 200);

  return createSuccessResponse({
    children: enriched,
    total: result.data?.total || 0,
  });
}

export const GET = withErrorHandling(handler, 'GET', '/api/sponsorship/available');
