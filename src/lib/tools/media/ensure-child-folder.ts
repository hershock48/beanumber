/**
 * Tool: ensureChildDriveFolder
 *
 * Creates or locates the canonical folder for a child in Google Drive.
 * Structure: /Be A Number/Children/[ChildID]/
 *
 * WAT-compliant tool:
 * - Single responsibility
 * - Structured output { success, data?, error? }
 * - Logging via logger.ts
 */

import { google, drive_v3 } from 'googleapis';
import { logger } from '../../logger';
import { getEmailConfig, isGmailConfigured } from '../../env';
import type { ToolResult } from '../../types/child-update';

// ============================================================================
// TYPES
// ============================================================================

export interface EnsureChildFolderInput {
  childId: string;
}

export interface EnsureChildFolderOutput {
  folderId: string;
  path: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ROOT_FOLDER_NAME = 'Be A Number';
const CHILDREN_FOLDER_NAME = 'Children';

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
  parentId?: string
): Promise<string | null> {
  let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

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
  parentId?: string
): Promise<string | null> {
  const fileMetadata: drive_v3.Schema$File = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };

  if (parentId) {
    fileMetadata.parents = [parentId];
  }

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
 * Ensure a child's folder exists in Google Drive
 *
 * Creates the folder hierarchy if it doesn't exist:
 * /Be A Number/Children/[ChildID]/
 *
 * @param input - Contains childId
 * @returns Folder ID and path
 */
export async function ensureChildDriveFolderTool(
  input: EnsureChildFolderInput
): Promise<ToolResult<EnsureChildFolderOutput>> {
  const { childId } = input;

  logger.info('ensureChildDriveFolder: Starting', { childId });

  // Validate input
  if (!childId || typeof childId !== 'string') {
    return {
      success: false,
      error: {
        code: 'invalid_args',
        message: 'childId is required',
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
    // Find or create root folder
    let rootFolderId = await findFolder(drive, ROOT_FOLDER_NAME);
    if (!rootFolderId) {
      rootFolderId = await createFolder(drive, ROOT_FOLDER_NAME);
      if (!rootFolderId) {
        throw new Error('Failed to create root folder');
      }
      logger.info('ensureChildDriveFolder: Created root folder', { rootFolderId });
    }

    // Find or create Children folder
    let childrenFolderId = await findFolder(drive, CHILDREN_FOLDER_NAME, rootFolderId);
    if (!childrenFolderId) {
      childrenFolderId = await createFolder(drive, CHILDREN_FOLDER_NAME, rootFolderId);
      if (!childrenFolderId) {
        throw new Error('Failed to create Children folder');
      }
      logger.info('ensureChildDriveFolder: Created Children folder', { childrenFolderId });
    }

    // Find or create child-specific folder
    let childFolderId = await findFolder(drive, childId, childrenFolderId);
    if (!childFolderId) {
      childFolderId = await createFolder(drive, childId, childrenFolderId);
      if (!childFolderId) {
        throw new Error(`Failed to create folder for child ${childId}`);
      }
      logger.info('ensureChildDriveFolder: Created child folder', { childId, childFolderId });
    }

    const path = `/${ROOT_FOLDER_NAME}/${CHILDREN_FOLDER_NAME}/${childId}`;

    logger.info('ensureChildDriveFolder: Completed', {
      childId,
      folderId: childFolderId,
      path,
    });

    return {
      success: true,
      data: {
        folderId: childFolderId,
        path,
      },
    };
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string };

    logger.error('ensureChildDriveFolder: Failed', error, { childId });

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
        message: err.message || 'Failed to ensure child folder',
      },
    };
  }
}
