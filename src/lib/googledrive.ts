/**
 * Google Drive API Service
 * Handles Google Drive file operations for photo/video storage
 *
 * Uses the same OAuth credentials as Gmail integration.
 * Folder structure: /Be A Number/Children/[ChildID]/
 *
 * This module follows the WAT architecture pattern:
 * - Returns structured results { success, data?, error? }
 * - Never throws unhandled exceptions
 * - Logs all operations
 */

import { google, drive_v3 } from 'googleapis';
import { logger } from './logger';
import { getEmailConfig, isGmailConfigured } from './env';

// ============================================================================
// TYPES
// ============================================================================

export interface DriveUploadOptions {
  /** File name to use in Drive */
  fileName: string;
  /** MIME type of the file */
  mimeType: string;
  /** File content as Buffer or stream */
  content: Buffer | NodeJS.ReadableStream;
  /** Child ID for folder organization */
  childId: string;
  /** Optional description */
  description?: string;
}

export interface DriveUploadResult {
  success: boolean;
  data?: {
    fileId: string;
    fileName: string;
    webViewLink?: string;
    webContentLink?: string;
    parentFolderId: string;
  };
  error?: string;
}

export interface DriveFolderResult {
  success: boolean;
  data?: {
    folderId: string;
    folderName: string;
  };
  error?: string;
}

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  webContentLink?: string;
  createdTime?: string;
  size?: string;
}

export interface DriveListResult {
  success: boolean;
  data?: {
    files: DriveFileInfo[];
    count: number;
  };
  error?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Root folder name in Google Drive */
const ROOT_FOLDER_NAME = 'Be A Number';

/** Children subfolder name */
const CHILDREN_FOLDER_NAME = 'Children';

// ============================================================================
// DRIVE CLIENT
// ============================================================================

let driveClient: drive_v3.Drive | null = null;

/**
 * Check if Google Drive is configured
 * (Uses same OAuth credentials as Gmail)
 */
export function isDriveConfigured(): boolean {
  return isGmailConfigured();
}

/**
 * Initialize Google Drive API client with OAuth2
 * Returns null if not configured
 */
function getDriveClient(): drive_v3.Drive | null {
  if (driveClient) {
    return driveClient;
  }

  if (!isDriveConfigured()) {
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
// FOLDER MANAGEMENT
// ============================================================================

/**
 * Find a folder by name within a parent folder
 */
async function findFolder(
  drive: drive_v3.Drive,
  folderName: string,
  parentId?: string
): Promise<string | null> {
  try {
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
  } catch (error) {
    logger.error('Failed to find folder', error, { folderName, parentId });
    return null;
  }
}

/**
 * Create a folder in Google Drive
 */
async function createFolder(
  drive: drive_v3.Drive,
  folderName: string,
  parentId?: string
): Promise<string | null> {
  try {
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

    logger.info('Created Drive folder', { folderName, folderId: response.data.id });
    return response.data.id || null;
  } catch (error) {
    logger.error('Failed to create folder', error, { folderName, parentId });
    return null;
  }
}

/**
 * Get or create the folder hierarchy for a child
 * Structure: /Be A Number/Children/[ChildID]/
 */
async function getOrCreateChildFolder(
  drive: drive_v3.Drive,
  childId: string
): Promise<string | null> {
  try {
    // Find or create root folder
    let rootFolderId = await findFolder(drive, ROOT_FOLDER_NAME);
    if (!rootFolderId) {
      rootFolderId = await createFolder(drive, ROOT_FOLDER_NAME);
      if (!rootFolderId) {
        throw new Error('Failed to create root folder');
      }
    }

    // Find or create Children folder
    let childrenFolderId = await findFolder(drive, CHILDREN_FOLDER_NAME, rootFolderId);
    if (!childrenFolderId) {
      childrenFolderId = await createFolder(drive, CHILDREN_FOLDER_NAME, rootFolderId);
      if (!childrenFolderId) {
        throw new Error('Failed to create Children folder');
      }
    }

    // Find or create specific child folder
    let childFolderId = await findFolder(drive, childId, childrenFolderId);
    if (!childFolderId) {
      childFolderId = await createFolder(drive, childId, childrenFolderId);
      if (!childFolderId) {
        throw new Error(`Failed to create folder for child ${childId}`);
      }
    }

    return childFolderId;
  } catch (error) {
    logger.error('Failed to get/create child folder', error, { childId });
    return null;
  }
}

// ============================================================================
// FILE OPERATIONS
// ============================================================================

/**
 * Upload a file to Google Drive
 *
 * @param options - Upload options including file content and metadata
 * @returns Structured result with file ID and links
 */
export async function uploadFileToDrive(options: DriveUploadOptions): Promise<DriveUploadResult> {
  if (!isDriveConfigured()) {
    logger.warn('Drive upload attempted but Drive is not configured');
    return {
      success: false,
      error: 'Google Drive is not configured. Set Gmail OAuth environment variables.',
    };
  }

  const drive = getDriveClient();
  if (!drive) {
    return {
      success: false,
      error: 'Failed to initialize Google Drive client.',
    };
  }

  try {
    // Get or create the child's folder
    const folderId = await getOrCreateChildFolder(drive, options.childId);
    if (!folderId) {
      return {
        success: false,
        error: `Failed to create folder for child ${options.childId}`,
      };
    }

    // Upload the file
    const fileMetadata: drive_v3.Schema$File = {
      name: options.fileName,
      parents: [folderId],
    };

    if (options.description) {
      fileMetadata.description = options.description;
    }

    const media = {
      mimeType: options.mimeType,
      body: options.content,
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id, name, webViewLink, webContentLink',
    });

    const fileId = response.data.id;
    if (!fileId) {
      return {
        success: false,
        error: 'File upload succeeded but no file ID returned',
      };
    }

    logger.info('File uploaded to Drive', {
      fileId,
      fileName: options.fileName,
      childId: options.childId,
      folderId,
    });

    return {
      success: true,
      data: {
        fileId,
        fileName: response.data.name || options.fileName,
        webViewLink: response.data.webViewLink || undefined,
        webContentLink: response.data.webContentLink || undefined,
        parentFolderId: folderId,
      },
    };
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string };

    logger.error('Failed to upload file to Drive', error, {
      fileName: options.fileName,
      childId: options.childId,
    });

    if (err.code === 401) {
      return {
        success: false,
        error: 'Google Drive authentication failed. Please check your refresh token.',
      };
    } else if (err.code === 403) {
      return {
        success: false,
        error: 'Google Drive API permission denied. Please ensure Drive scope is enabled.',
      };
    } else if (err.code === 429) {
      return {
        success: false,
        error: 'Google Drive API rate limit exceeded. Please try again later.',
      };
    }

    return {
      success: false,
      error: err.message || 'Failed to upload file to Google Drive.',
    };
  }
}

/**
 * List files in a child's folder
 *
 * @param childId - Child ID to list files for
 * @returns List of files in the child's folder
 */
export async function listFilesForChild(childId: string): Promise<DriveListResult> {
  if (!isDriveConfigured()) {
    return {
      success: false,
      error: 'Google Drive is not configured.',
    };
  }

  const drive = getDriveClient();
  if (!drive) {
    return {
      success: false,
      error: 'Failed to initialize Google Drive client.',
    };
  }

  try {
    // Find the child's folder
    const rootFolderId = await findFolder(drive, ROOT_FOLDER_NAME);
    if (!rootFolderId) {
      return {
        success: true,
        data: { files: [], count: 0 },
      };
    }

    const childrenFolderId = await findFolder(drive, CHILDREN_FOLDER_NAME, rootFolderId);
    if (!childrenFolderId) {
      return {
        success: true,
        data: { files: [], count: 0 },
      };
    }

    const childFolderId = await findFolder(drive, childId, childrenFolderId);
    if (!childFolderId) {
      return {
        success: true,
        data: { files: [], count: 0 },
      };
    }

    // List files in the child's folder
    const response = await drive.files.list({
      q: `'${childFolderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, webViewLink, webContentLink, createdTime, size)',
      orderBy: 'createdTime desc',
    });

    const files: DriveFileInfo[] = (response.data.files || []).map(file => ({
      id: file.id || '',
      name: file.name || '',
      mimeType: file.mimeType || '',
      webViewLink: file.webViewLink || undefined,
      webContentLink: file.webContentLink || undefined,
      createdTime: file.createdTime || undefined,
      size: file.size || undefined,
    }));

    logger.info('Listed files for child', { childId, count: files.length });

    return {
      success: true,
      data: {
        files,
        count: files.length,
      },
    };
  } catch (error: unknown) {
    const err = error as { message?: string };

    logger.error('Failed to list files for child', error, { childId });

    return {
      success: false,
      error: err.message || 'Failed to list files from Google Drive.',
    };
  }
}

/**
 * Delete a file from Google Drive
 *
 * @param fileId - Google Drive file ID
 * @returns Success/failure result
 */
export async function deleteFileFromDrive(fileId: string): Promise<{ success: boolean; error?: string }> {
  if (!isDriveConfigured()) {
    return {
      success: false,
      error: 'Google Drive is not configured.',
    };
  }

  const drive = getDriveClient();
  if (!drive) {
    return {
      success: false,
      error: 'Failed to initialize Google Drive client.',
    };
  }

  try {
    await drive.files.delete({ fileId });

    logger.info('File deleted from Drive', { fileId });

    return { success: true };
  } catch (error: unknown) {
    const err = error as { message?: string };

    logger.error('Failed to delete file from Drive', error, { fileId });

    return {
      success: false,
      error: err.message || 'Failed to delete file from Google Drive.',
    };
  }
}

/**
 * Get a shareable link for a file
 * Sets the file to be viewable by anyone with the link
 *
 * @param fileId - Google Drive file ID
 * @returns Web view link
 */
export async function getShareableLink(fileId: string): Promise<{ success: boolean; link?: string; error?: string }> {
  if (!isDriveConfigured()) {
    return {
      success: false,
      error: 'Google Drive is not configured.',
    };
  }

  const drive = getDriveClient();
  if (!drive) {
    return {
      success: false,
      error: 'Failed to initialize Google Drive client.',
    };
  }

  try {
    // Create a permission for anyone to view
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    // Get the file's web view link
    const response = await drive.files.get({
      fileId,
      fields: 'webViewLink',
    });

    logger.info('Created shareable link', { fileId });

    return {
      success: true,
      link: response.data.webViewLink || undefined,
    };
  } catch (error: unknown) {
    const err = error as { message?: string };

    logger.error('Failed to create shareable link', error, { fileId });

    return {
      success: false,
      error: err.message || 'Failed to create shareable link.',
    };
  }
}
