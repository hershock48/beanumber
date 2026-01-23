/**
 * API Route: Compliance Cron Job
 *
 * Runs daily to check for missing child updates and send reminders/escalations.
 * Should be triggered by Vercel Cron or similar scheduler.
 *
 * GET /api/cron/compliance
 *
 * Protected by CRON_SECRET environment variable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { ROLE_EMAILS, SOURCE_TYPE } from '@/lib/constants';
import {
  detectMissingUpdatesTool,
  sendReminderEmailTool,
  sendEscalationNoticeTool,
  generateComplianceSummaryTool,
} from '@/lib/tools';
import type { SourceType } from '@/lib/types/child-update';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Form URLs (should be configured via env vars in production)
const FIELD_FORM_URL = process.env.FIELD_FORM_URL || 'https://forms.google.com/field-intake';
const ACADEMIC_FORM_URL = process.env.ACADEMIC_FORM_URL || 'https://forms.google.com/academic-intake';

// Reminder schedule configuration
const REMINDER_CONFIG = {
  field: {
    // Days of month for reminders
    initialDay: 1,      // Period start
    followUpDay: 23,    // 7 days before month end
    finalDay: 28,       // Final reminder
    deadlineDay: 28,    // Deadline
  },
  academic: {
    // Days before term end for reminders
    firstReminderDays: 14,
    secondReminderDays: 3,
  },
};

// ============================================================================
// AUTHENTICATION
// ============================================================================

function validateCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  // If no secret configured, allow in development
  if (!cronSecret) {
    if (process.env.NODE_ENV === 'development') {
      return true;
    }
    logger.warn('Compliance cron: CRON_SECRET not configured');
    return false;
  }

  // Check Authorization header
  const authHeader = request.headers.get('Authorization');
  if (authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  // Also check query param for Vercel Cron compatibility
  const url = new URL(request.url);
  const secretParam = url.searchParams.get('secret');
  if (secretParam === cronSecret) {
    return true;
  }

  return false;
}

// ============================================================================
// HELPERS
// ============================================================================

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getReminderType(dayOfMonth: number): 'initial' | 'follow_up' | 'final' | null {
  const config = REMINDER_CONFIG.field;

  if (dayOfMonth === config.initialDay) return 'initial';
  if (dayOfMonth === config.followUpDay) return 'follow_up';
  if (dayOfMonth === config.finalDay) return 'final';

  return null;
}

function getDaysOverdue(period: string): number {
  const [year, month] = period.split('-').map(Number);
  const deadline = new Date(year, month - 1, REMINDER_CONFIG.field.deadlineDay);
  const now = new Date();

  const diffTime = now.getTime() - deadline.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function GET(request: NextRequest) {
  logger.info('Compliance cron: Starting', {});

  // Authenticate
  if (!validateCronAuth(request)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const results: {
    period: string;
    sourceType: string;
    action: string;
    result: 'success' | 'skipped' | 'error';
    details?: unknown;
  }[] = [];

  try {
    const now = new Date();
    const dayOfMonth = now.getDate();
    const currentPeriod = getCurrentPeriod();

    logger.info('Compliance cron: Processing', {
      currentPeriod,
      dayOfMonth,
    });

    // =========================================================================
    // FIELD UPDATES CHECK
    // =========================================================================

    const fieldResult = await detectMissingUpdatesTool({
      periodOrTerm: currentPeriod,
      sourceType: SOURCE_TYPE.FIELD as SourceType,
    });

    if (fieldResult.success) {
      const { counts, missingChildIds } = fieldResult.data;

      logger.info('Compliance cron: Field update status', {
        period: currentPeriod,
        expected: counts.expected,
        present: counts.present,
        missing: counts.missing,
        complianceRate: fieldResult.data.complianceRate,
      });

      if (counts.missing > 0) {
        const reminderType = getReminderType(dayOfMonth);
        const daysOverdue = getDaysOverdue(currentPeriod);

        // Send reminder if it's a reminder day
        if (reminderType) {
          const reminderResult = await sendReminderEmailTool({
            toRoleEmail: ROLE_EMAILS.FIELD_UPDATES,
            periodOrTerm: currentPeriod,
            sourceType: SOURCE_TYPE.FIELD as SourceType,
            missingChildIds,
            formUrl: FIELD_FORM_URL,
            reminderType,
          });

          results.push({
            period: currentPeriod,
            sourceType: 'field',
            action: `reminder_${reminderType}`,
            result: reminderResult.success ? 'success' : 'error',
            details: reminderResult.success
              ? { recipientEmail: reminderResult.data.recipientEmail, childCount: reminderResult.data.childCount }
              : reminderResult.error,
          });
        }

        // Send escalation if overdue
        if (daysOverdue > 0) {
          const escalationResult = await sendEscalationNoticeTool({
            periodOrTerm: currentPeriod,
            sourceType: SOURCE_TYPE.FIELD as SourceType,
            responsibleRole: ROLE_EMAILS.FIELD_UPDATES,
            missingCount: counts.missing,
            missingChildIds,
            daysOverdue,
          });

          results.push({
            period: currentPeriod,
            sourceType: 'field',
            action: 'escalation',
            result: escalationResult.success ? 'success' : 'error',
            details: escalationResult.success
              ? { escalatedTo: escalationResult.data.escalatedTo, daysOverdue }
              : escalationResult.error,
          });
        }
      } else {
        results.push({
          period: currentPeriod,
          sourceType: 'field',
          action: 'check',
          result: 'skipped',
          details: { reason: 'No missing updates', complianceRate: 100 },
        });
      }
    } else {
      results.push({
        period: currentPeriod,
        sourceType: 'field',
        action: 'check',
        result: 'error',
        details: fieldResult.error,
      });
    }

    // =========================================================================
    // ACADEMIC UPDATES CHECK (if applicable)
    // =========================================================================

    // Academic updates are term-based, so we'd need to determine the current term
    // For now, we skip this but log it
    results.push({
      period: currentPeriod,
      sourceType: 'academic',
      action: 'check',
      result: 'skipped',
      details: { reason: 'Term-based checks not yet implemented' },
    });

    // =========================================================================
    // GENERATE SUMMARY
    // =========================================================================

    const summaryResult = await generateComplianceSummaryTool({
      periodOrTerm: currentPeriod,
    });

    logger.info('Compliance cron: Completed', {
      period: currentPeriod,
      results,
      summary: summaryResult.success
        ? {
            overallComplianceRate: summaryResult.data.overallComplianceRate,
            totalMissing: summaryResult.data.totalMissing,
          }
        : null,
    });

    return NextResponse.json({
      success: true,
      data: {
        period: currentPeriod,
        executedAt: new Date().toISOString(),
        results,
        summary: summaryResult.success ? summaryResult.data : null,
      },
    });
  } catch (error: unknown) {
    const err = error as { message?: string };

    logger.error('Compliance cron: Unexpected error', error, {});

    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
