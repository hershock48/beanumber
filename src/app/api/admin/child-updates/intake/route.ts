/**
 * API Route: Child Update Intake
 *
 * Receives field or academic update submissions from Google Forms
 * (via Apps Script bridge) and processes them through the intake workflow.
 *
 * POST /api/admin/child-updates/intake
 *
 * Storage model (as of July 2026):
 *   - Photos → Google Drive (kept because Simon may still have folder-
 *     tree workflows built around the Drive layout).
 *   - Record itself → Postgres `child_updates`. Previously routed
 *     through createChildUpdateRecordTool → Airtable, but publish
 *     reads from Postgres, so Airtable-only writes silently disappeared
 *     from the app. Rewritten to insert directly into Postgres so
 *     submissions actually surface.
 *
 * This route is admin-protected and validates the submitter email
 * against approved role emails.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getAdminToken, isAdminAuthConfigured } from '@/lib/env';
import { ADMIN, ROLE_EMAILS, SOURCE_TYPE, CHILD_UPDATE_STATUS } from '@/lib/constants';
import { ensurePeriodFolderTool, uploadToDriveTool } from '@/lib/tools';
import type { SourceType } from '@/lib/types/child-update';
import { db } from '@/lib/db/client';
import { childUpdates, children } from '@/lib/db/schema';
import { and, eq, or } from 'drizzle-orm';

// ============================================================================
// TYPES
// ============================================================================

interface IntakeRequest {
  childId: string;
  sourceType: SourceType;
  periodOrTerm: string;
  submittedBy: string;
  fields: {
    // Field update fields
    physicalWellbeing?: string;
    physicalNotes?: string;
    emotionalWellbeing?: string;
    emotionalNotes?: string;
    schoolEngagement?: string;
    engagementNotes?: string;
    sponsorNarrative?: string;
    positiveHighlight?: string;
    challenge?: string;
    // Academic update fields
    attendancePercent?: number;
    englishGrade?: number;
    mathGrade?: number;
    scienceGrade?: number;
    socialStudiesGrade?: number;
    teacherComment?: string;
  };
  photos?: Array<{
    key: string;
    fileName: string;
    mimeType: string;
    base64Content: string;
  }>;
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

function validateAdminAuth(request: NextRequest): boolean {
  if (!isAdminAuthConfigured()) {
    logger.warn('Admin auth not configured');
    return false;
  }
  const token = request.headers.get(ADMIN.AUTH_HEADER);
  if (!token) return false;
  try {
    const adminToken = getAdminToken();
    return token === adminToken;
  } catch {
    return false;
  }
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  logger.info('Child update intake: Request received', {});

  if (!validateAdminAuth(request)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body: IntakeRequest = await request.json();

    // ── VALIDATION ────────────────────────────────────────────────
    if (!body.childId) {
      return NextResponse.json(
        { success: false, error: 'childId is required' },
        { status: 400 }
      );
    }
    if (
      !body.sourceType ||
      !Object.values(SOURCE_TYPE).includes(body.sourceType)
    ) {
      return NextResponse.json(
        { success: false, error: 'sourceType must be "field" or "academic"' },
        { status: 400 }
      );
    }
    if (!body.periodOrTerm) {
      return NextResponse.json(
        { success: false, error: 'periodOrTerm is required' },
        { status: 400 }
      );
    }
    if (!body.submittedBy) {
      return NextResponse.json(
        { success: false, error: 'submittedBy is required' },
        { status: 400 }
      );
    }

    const validSubmitter =
      (body.sourceType === SOURCE_TYPE.FIELD &&
        body.submittedBy === ROLE_EMAILS.FIELD_UPDATES) ||
      (body.sourceType === SOURCE_TYPE.ACADEMIC &&
        body.submittedBy === ROLE_EMAILS.ACADEMICS);
    if (!validSubmitter) {
      logger.warn('Child update intake: Invalid submitter for source type', {
        sourceType: body.sourceType,
        submittedBy: body.submittedBy,
      });
      return NextResponse.json(
        {
          success: false,
          error: `Invalid submitter for ${body.sourceType} updates. Expected: ${
            body.sourceType === SOURCE_TYPE.FIELD
              ? ROLE_EMAILS.FIELD_UPDATES
              : ROLE_EMAILS.ACADEMICS
          }`,
        },
        { status: 403 }
      );
    }

    // ── STEP 1: Validate child exists in Postgres ────────────────
    // Accept either the legacy child_id string ('HSP/BAN-025') or the
    // Postgres UUID — the intake caller might send either shape.
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isUuid = UUID_RE.test(body.childId);
    const childRows = await db
      .select()
      .from(children)
      .where(
        isUuid
          ? eq(children.id, body.childId)
          : eq(children.childId, body.childId)
      )
      .limit(1);
    const child = childRows[0];
    if (!child) {
      logger.warn('Child update intake: Child not found', {
        childId: body.childId,
      });
      return NextResponse.json(
        { success: false, error: `Child not found: ${body.childId}` },
        { status: 404 }
      );
    }

    // ── STEP 2: Check for duplicate (same kid + same period) ─────
    // Match on child_id UUID + legacy child_id_legacy string (dual
    // lookup, same pattern the rest of the codebase uses), plus the
    // period-or-academic-term matching the request's source type.
    const periodField = body.sourceType === SOURCE_TYPE.FIELD ? 'period' : 'academic_term';
    void periodField; // reserved for possible future indexing
    const dupes = await db
      .select({ id: childUpdates.id, status: childUpdates.status })
      .from(childUpdates)
      .where(
        and(
          or(
            eq(childUpdates.childId, child.id),
            eq(childUpdates.childIdLegacy, child.childId || '')
          ),
          eq(
            body.sourceType === SOURCE_TYPE.FIELD
              ? childUpdates.period
              : childUpdates.academicTerm,
            body.periodOrTerm
          )
        )
      )
      .limit(1);
    if (dupes[0]) {
      logger.warn('Child update intake: Duplicate update', {
        childId: body.childId,
        periodOrTerm: body.periodOrTerm,
        existingId: dupes[0].id,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'An update already exists for this child and period',
          existingUpdateId: dupes[0].id,
        },
        { status: 409 }
      );
    }

    // ── STEP 3: Photos → Google Drive (unchanged) ────────────────
    // Kept on Drive because Simon likely has folder-tree workflows
    // built around the Drive layout. A future migration can move to
    // Supabase Storage; for now the Drive references live in the
    // Postgres row alongside a photoUrls array (if any).
    const driveRefs: Record<string, string> = {};
    if (body.photos && body.photos.length > 0) {
      const folderResult = await ensurePeriodFolderTool({
        childId: body.childId,
        sourceType: body.sourceType,
        periodOrTerm: body.periodOrTerm,
      });
      if (folderResult.success) {
        driveRefs.folderId = folderResult.data.folderId;
        for (const photo of body.photos) {
          try {
            const buffer = Buffer.from(photo.base64Content, 'base64');
            const uploadResult = await uploadToDriveTool({
              childId: body.childId,
              fileName: photo.fileName,
              mimeType: photo.mimeType,
              content: buffer,
              description: `${photo.key} for ${body.periodOrTerm}`,
            });
            if (uploadResult.success && uploadResult.data) {
              driveRefs[`${photo.key}FileId`] = uploadResult.data.fileId;
            }
          } catch (uploadError) {
            logger.error(
              'Child update intake: Photo upload failed',
              uploadError,
              { childId: body.childId, photoKey: photo.key }
            );
          }
        }
      }
    }

    // ── STEP 4: Insert into Postgres child_updates ───────────────
    // Was: createChildUpdateRecordTool → Airtable-only, which silently
    // vanished from the app because publish/route.ts reads Postgres.
    // Now: direct insert. Dual-key child match (childId UUID +
    // childIdLegacy string) so downstream publish + kid-page joins
    // both hit correctly.
    const now = new Date();
    const inserted = await db
      .insert(childUpdates)
      .values({
        childId: child.id,
        childIdLegacy: child.childId,
        sourceType: body.sourceType,
        period: body.sourceType === SOURCE_TYPE.FIELD ? body.periodOrTerm : undefined,
        academicTerm:
          body.sourceType === SOURCE_TYPE.ACADEMIC
            ? body.periodOrTerm
            : undefined,
        submittedBy: body.submittedBy,
        submittedAt: now,
        status: CHILD_UPDATE_STATUS.PENDING_REVIEW ?? 'Pending Review',
        visibleToSponsor: false,
        requestedBySponsor: false,
        requestedAt: now,
        // Structured fields — schema uses camelCase in Drizzle, snake_case
        // in Postgres. Only include fields actually provided.
        physicalWellbeing: body.fields.physicalWellbeing,
        physicalNotes: body.fields.physicalNotes,
        emotionalWellbeing: body.fields.emotionalWellbeing,
        emotionalNotes: body.fields.emotionalNotes,
        schoolEngagement: body.fields.schoolEngagement,
        engagementNotes: body.fields.engagementNotes,
        sponsorNarrative: body.fields.sponsorNarrative,
        positiveHighlight: body.fields.positiveHighlight,
        challenge: body.fields.challenge,
        attendancePercent:
          body.fields.attendancePercent != null
            ? String(body.fields.attendancePercent)
            : undefined,
        englishGrade:
          body.fields.englishGrade != null
            ? String(body.fields.englishGrade)
            : undefined,
        mathGrade:
          body.fields.mathGrade != null
            ? String(body.fields.mathGrade)
            : undefined,
        scienceGrade:
          body.fields.scienceGrade != null
            ? String(body.fields.scienceGrade)
            : undefined,
        socialStudiesGrade:
          body.fields.socialStudiesGrade != null
            ? String(body.fields.socialStudiesGrade)
            : undefined,
        teacherComment: body.fields.teacherComment,
        // Drive references (kept for backward compatibility)
        driveFolderId: driveRefs.folderId,
        photo1FileId: driveRefs.photo1FileId,
        photo2FileId: driveRefs.photo2FileId,
        photo3FileId: driveRefs.photo3FileId,
        handwrittenNoteFileId: driveRefs.handwrittenNoteFileId,
        reportCardFileId: driveRefs.reportCardFileId,
      })
      .returning({ id: childUpdates.id });

    const updateRecordId = inserted[0]?.id;

    logger.info('Child update intake: Success (Postgres)', {
      childId: body.childId,
      updateRecordId,
      sourceType: body.sourceType,
      periodOrTerm: body.periodOrTerm,
      photosUploaded: Object.keys(driveRefs).filter(k =>
        k.endsWith('FileId')
      ).length,
    });

    return NextResponse.json({
      success: true,
      data: {
        updateRecordId,
        updateId: updateRecordId,
        status: 'Pending Review',
        driveFolder: driveRefs.folderId,
      },
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    logger.error('Child update intake: Unexpected error', error, {});
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
