/**
 * API Route: Child Update Intake
 *
 * Receives field or academic update submissions from Google Forms
 * (via Apps Script bridge) and processes them through the intake workflow.
 *
 * POST /api/admin/child-updates/intake
 *
 * This route is admin-protected and validates the submitter email
 * against approved role emails.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getAdminToken, isAdminAuthConfigured } from '@/lib/env';
import { ADMIN, ROLE_EMAILS, SOURCE_TYPE } from '@/lib/constants';
import {
  getChildByChildIdTool,
  findChildUpdateTool,
  createChildUpdateRecordTool,
  ensurePeriodFolderTool,
  uploadToDriveTool,
} from '@/lib/tools';
import type { SourceType } from '@/lib/types/child-update';

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
  if (!token) {
    return false;
  }

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

  // Authenticate
  if (!validateAdminAuth(request)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body: IntakeRequest = await request.json();

    // =========================================================================
    // VALIDATION
    // =========================================================================

    // Validate required fields
    if (!body.childId) {
      return NextResponse.json(
        { success: false, error: 'childId is required' },
        { status: 400 }
      );
    }

    if (!body.sourceType || !Object.values(SOURCE_TYPE).includes(body.sourceType)) {
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

    // Validate submitter email matches source type
    const validSubmitter =
      (body.sourceType === SOURCE_TYPE.FIELD && body.submittedBy === ROLE_EMAILS.FIELD_UPDATES) ||
      (body.sourceType === SOURCE_TYPE.ACADEMIC && body.submittedBy === ROLE_EMAILS.ACADEMICS);

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

    // =========================================================================
    // STEP 1: Validate Child Exists
    // =========================================================================

    const childResult = await getChildByChildIdTool({ childId: body.childId });

    if (!childResult.success) {
      logger.warn('Child update intake: Child not found', {
        childId: body.childId,
        error: childResult.error,
      });

      return NextResponse.json(
        { success: false, error: `Child not found: ${body.childId}` },
        { status: 404 }
      );
    }

    // =========================================================================
    // STEP 2: Check for Duplicate
    // =========================================================================

    const existingResult = await findChildUpdateTool({
      childId: body.childId,
      sourceType: body.sourceType,
      period: body.sourceType === SOURCE_TYPE.FIELD ? body.periodOrTerm : undefined,
      academicTerm: body.sourceType === SOURCE_TYPE.ACADEMIC ? body.periodOrTerm : undefined,
    });

    if (existingResult.success && existingResult.data.exists) {
      logger.warn('Child update intake: Duplicate update', {
        childId: body.childId,
        periodOrTerm: body.periodOrTerm,
        existingId: existingResult.data.updateRecordId,
      });

      return NextResponse.json(
        {
          success: false,
          error: 'An update already exists for this child and period',
          existingUpdateId: existingResult.data.updateRecordId,
        },
        { status: 409 }
      );
    }

    // =========================================================================
    // STEP 3: Create Drive Folder & Upload Photos
    // =========================================================================

    const driveRefs: Record<string, string> = {};

    if (body.photos && body.photos.length > 0) {
      // Ensure period folder exists
      const folderResult = await ensurePeriodFolderTool({
        childId: body.childId,
        sourceType: body.sourceType,
        periodOrTerm: body.periodOrTerm,
      });

      if (folderResult.success) {
        driveRefs.folderId = folderResult.data.folderId;

        // Upload each photo
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
            logger.error('Child update intake: Photo upload failed', uploadError, {
              childId: body.childId,
              photoKey: photo.key,
            });
            // Continue with other photos
          }
        }
      }
    }

    // =========================================================================
    // STEP 4: Create Airtable Record
    // =========================================================================

    // Cast fields - API receives strings, tool handles any type mismatch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fieldsTyped = body.fields as any;

    const createResult = await createChildUpdateRecordTool({
      childId: body.childId,
      sourceType: body.sourceType,
      period: body.sourceType === SOURCE_TYPE.FIELD ? body.periodOrTerm : undefined,
      academicTerm: body.sourceType === SOURCE_TYPE.ACADEMIC ? body.periodOrTerm : undefined,
      submittedAt: new Date().toISOString(),
      submittedBy: body.submittedBy,
      status: 'Pending Review',
      fields: fieldsTyped,
      drive: driveRefs.folderId ? driveRefs : undefined,
    });

    if (!createResult.success) {
      logger.error('Child update intake: Failed to create record', null, {
        childId: body.childId,
        error: createResult.error,
      });

      return NextResponse.json(
        { success: false, error: createResult.error.message },
        { status: 500 }
      );
    }

    logger.info('Child update intake: Success', {
      childId: body.childId,
      updateRecordId: createResult.data.updateRecordId,
      updateId: createResult.data.updateId,
      sourceType: body.sourceType,
      periodOrTerm: body.periodOrTerm,
      photosUploaded: Object.keys(driveRefs).filter(k => k.endsWith('FileId')).length,
    });

    return NextResponse.json({
      success: true,
      data: {
        updateRecordId: createResult.data.updateRecordId,
        updateId: createResult.data.updateId,
        status: createResult.data.status,
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
