/**
 * Tool: ensurePeriodFolder
 *
 * Creates or locates the period-specific folder for a child's update.
 * Structure:
 * - Field updates: /Children/[ChildID]/field-updates/[Period]/
 * - Academic updates: /Children/[ChildID]/academics/[Term]/
 *
 * WAT-compliant tool:
 * - Single responsibility
 * - Structured output { success, data?, error? }
 * - Logging via logger.ts
 */

import { google, drive_v3 } from 'googleapis';
import { logger } from '../../logger';
import { getEmailConfig, isGmailConfigured } from '../../env';
import { SOURCE_TYPE } from '../../constants';
import type { ToolResult, SourceType } from '../../types/child-update';
import { ensureChildDriveFolderTool } from './ensure-child-folder';

// ============================================================================
// TYPES
// ============================================================================

export interface EnsurePeriodFolderInput {
  childId: string;
  sourceType: SourceType;
  periodOrTerm: string;
}

export interface EnsurePeriodFolderOutput {
  folderId: string;
  path: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const FIELD_UPDATES_FOLDER = 'field-updates';
const ACADEMICS_FOLDER = 'academics';

// ============================================================================
// DRIVE CLIENT
// ============================================================================

let driveClient: drive_v3.Drive | null = null;

function getDriveClient(): drive_v3.Drive | null {
  if (driveClient) {
    return driveClient;
  }

  if (!isGmailConfigured()) {
    return null;
  }

  const config = getEmailConfig();

  const oauth2Client = new google.auth.OAuth2(
    config.gmailClientId,
    config.gmailClientSecret,
    'urn:ietf:wg:oauth:2.0:oob'
  );

  oauth2Client.setCredentials({
    refresh_token: config.gmailRefreshToken,
  });

  driveClient = google.drive({
    version: 'v3',
    auth: oauth2Client,
  });

  return driveClient;
}

// ============================================================================
// FOLDER HELPERS
// ============================================================================

async function findFolder(
  drive: drive_v3.Drive,
  folderName: string,
  parentId: string
): Promise<string | null> {
  const query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;

  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  const folders = response.data.files;
  if (folders && folders.length > 0) {
    return folders[0].id || null;
  }

  return null;
}

async function createFolder(
  drive: drive_v3.Drive,
  folderName: string,
  parentId: string
): Promise<string | null> {
  const fileMetadata: drive_v3.Schema$File = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId],
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id',
  });

  return response.data.id || null;
}

// ============================================================================
// TOOL IMPLEMENTATION
// ============================================================================

/**
 * Ensure a period-specific folder exists for a child's update
 *
 * Creates the folder hierarchy if it doesn't exist.
 * Field updates: /Children/[ChildID]/field-updates/[Period]/
 * Academic updates: /Children/[ChildID]/academics/[Term]/
 *
 * @param input - Contains childId, sourceType, and periodOrTerm
 * @returns Folder ID and path
 */
export async function ensurePeriodFolderTool(
  input: EnsurePeriodFolderInput
): Promise<ToolResult<EnsurePeriodFolderOutput>> {
  const { childId, sourceType, periodOrTerm } = input;

  logger.info('ensurePeriodFolder: Starting', {
    childId,
    sourceType,
    periodOrTerm,
  });

  // =========================================================================
  // VALIDATION
  // =========================================================================

  if (!childId || typeof childId !== 'string') {
    return {
      success: false,
      error: {
        code: 'invalid_args',
        message: 'childId is required',
      },
    };
  }

  if (!sourceType || !Object.values(SOURCE_TYPE).includes(sourceType)) {
    return {
      success: false,
      error: {
        code: 'invalid_args',
        message: 'sourceType must be "field" or "academic"',
      },
    };
  }

  if (!periodOrTerm || typeof periodOrTerm !== 'string') {
    return {
      success: false,
      error: {
        code: 'invalid_args',
        message: 'periodOrTerm is required',
      },
    };
  }

  // Check if Drive is configured
  if (!isGmailConfigured()) {
    return {
      success: false,
      error: {
        code: 'drive_not_configured',
        message: 'Google Drive is not configured. Set Gmail OAuth environment variables.',
      },
    };
  }

  const drive = getDriveClient();
  if (!drive) {
    return {
      success: false,
      error: {
        code: 'drive_auth',
        message: 'Failed to initialize Google Drive client.',
      },
    };
  }

  try {
    // First, ensure the child folder exists
    const childFolderResult = await ensureChildDriveFolderTool({ childId });

    if (!childFolderResult.success) {
      return {
        success: false,
        error: childFolderResult.error,
      };
    }

    const childFolderId = childFolderResult.data.folderId;
    const basePath = childFolderResult.data.path;

    // Determine the source type folder name
    const sourceFolder =
      sourceType === SOURCE_TYPE.FIELD ? FIELD_UPDATES_FOLDER : ACADEMICS_FOLDER;

    // Find or create source type folder (field-updates or academics)
    let sourceFolderId = await findFolder(drive, sourceFolder, childFolderId);
    if (!sourceFolderId) {
      sourceFolderId = await createFolder(drive, sourceFolder, childFolderId);
      if (!sourceFolderId) {
        throw new Error(`Failed to create ${sourceFolder} folder`);
      }
      logger.info('ensurePeriodFolder: Created source folder', {
        sourceFolder,
        sourceFolderId,
      });
    }

    // Find or create period/term folder
    let periodFolderId = await findFolder(drive, periodOrTerm, sourceFolderId);
    if (!periodFolderId) {
      periodFolderId = await createFolder(drive, periodOrTerm, sourceFolderId);
      if (!periodFolderId) {
        throw new Error(`Failed to create period folder ${periodOrTerm}`);
      }
      logger.info('ensurePeriodFolder: Created period folder', {
        periodOrTerm,
        periodFolderId,
      });
    }

    const path = `${basePath}/${sourceFolder}/${periodOrTerm}`;

    logger.info('ensurePeriodFolder: Completed', {
      childId,
      sourceType,
      periodOrTerm,
      folderId: periodFolderId,
      path,
    });

    return {
      success: true,
      data: {
        folderId: periodFolderId,
        path,
      },
    };
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string };

    logger.error('ensurePeriodFolder: Failed', error, {
      childId,
      sourceType,
      periodOrTerm,
    });

    if (err.code === 401) {
      return {
        success: false,
        error: {
          code: 'drive_auth',
          message: 'Google Drive authentication failed. Please check your refresh token.',
        },
      };
    }

    return {
      success: false,
      error: {
        code: 'drive_error',
        message: err.message || 'Failed to ensure period folder',
      },
    };
  }
}
