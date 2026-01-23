/**
 * Subscription Reconciliation API
 * Compares Stripe subscriptions with Airtable records (REQUIRES ADMIN AUTH)
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import {
  createSuccessResponse,
  withErrorHandling,
  ValidationError,
} from '@/lib/errors';
import { requireAdminAuth } from '@/lib/auth';
import { reconcileSubscriptionsTool } from '@/lib/tools';

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'GET';
  const path = '/api/admin/reconciliation';

  logger.apiRequest(method, path);

  // CRITICAL: Require admin authentication
  requireAdminAuth(request);

  // Parse query params
  const { searchParams } = new URL(request.url);
  const sinceDate = searchParams.get('since') || undefined;
  const includeDetails = searchParams.get('details') === 'true';

  // Use the WAT tool to reconcile subscriptions
  const result = await reconcileSubscriptionsTool({
    sinceDate,
    includeDetails,
  });

  if (!result.success) {
    throw new ValidationError(result.error!);
  }

  logger.info('Reconciliation completed', {
    stripeCount: result.data?.totalStripeSubscriptions,
    airtableCount: result.data?.totalAirtableSponsorships,
    mismatches: result.data?.mismatchSummary,
  });

  logger.apiResponse(method, path, 200);

  // Determine status based on mismatches
  const totalMismatches = result.data?.mismatches.length || 0;
  const status = totalMismatches > 0 ? 207 : 200; // 207 Multi-Status if mismatches

  return NextResponse.json(
    {
      success: true,
      data: result.data,
      healthy: totalMismatches === 0,
    },
    { status }
  );
}

export const GET = withErrorHandling(handler, 'GET', '/api/admin/reconciliation');
