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

/**
 * Batch-fetch the Loves field from the Children table for every ChildID
 * in the sponsorship result set. Returns a Map<ChildID, loves string>.
 */
async function fetchLovesForChildren(childIds: string[]): Promise<Map<string, string>> {
  const lovesMap = new Map<string, string>();
  if (!childIds.length || !AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) return lovesMap;

  try {
    // Build an OR formula: OR({ChildID}="A", {ChildID}="B", …)
    const clauses = childIds.map(id => `{ChildID}="${id}"`).join(',');
    const formula = encodeURIComponent(`OR(${clauses})`);
    const fields = encodeURIComponent('ChildID') + '&fields[]=' + encodeURIComponent('Loves');

    const url =
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_CHILDREN_TABLE)}` +
      `?filterByFormula=${formula}&fields[]=${fields}&pageSize=100`;

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
        const loves = record.fields?.Loves;
        if (cid && loves) lovesMap.set(cid, loves);
      }
    }
  } catch (err) {
    logger.warn('[sponsorship/available] Loves enrichment failed', { error: String(err) });
  }

  return lovesMap;
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

  // Enrich with Loves one-liners from the Children table
  const children = result.data?.children || [];
  const childIds = children.map(c => c.id).filter(Boolean);
  const lovesMap = await fetchLovesForChildren(childIds);

  const enriched = children.map(child => ({
    ...child,
    loves: lovesMap.get(child.id) || undefined,
  }));

  logger.info('Listed available children', {
    total: result.data?.total,
    returned: enriched.length,
    withLoves: lovesMap.size,
  });

  logger.apiResponse(method, path, 200);

  return createSuccessResponse({
    children: enriched,
    total: result.data?.total || 0,
  });
}

export const GET = withErrorHandling(handler, 'GET', '/api/sponsorship/available');
