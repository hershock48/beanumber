/**
 * Upload to Drive Tool
 *
 * WAT-compliant tool for uploading media files to Google Drive.
 * Organizes files by child ID in folder structure.
 */

import { logger } from '../../logger';
import { ValidationResult, success, failure } from '../../validation';
import { uploadFileToDrive, isDriveConfigured, DriveUploadResult } from '../../googledrive';

// ============================================================================
// INPUT/OUTPUT INTERFACES
// ============================================================================

/**
 * Input schema for upload tool
 */
export interface UploadToDriveInput {
  /** Child ID for folder organization */
  childId: string;
  /** File name to use in Drive */
  fileName: string;
  /** MIME type of the file */
  mimeType: string;
  /** File content as base64 string or Buffer */
  content: string | Buffer;
  /** Optional description for the file */
  description?: string;
}

/**
 * Output schema
 */
export interface UploadToDriveOutput {
  success: boolean;
  data?: {
    fileId: string;
    fileName: string;
    webViewLink?: string;
    webContentLink?: string;
    folderId: string;
  };
  error?: string;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate tool input
 */
function validateInput(input: unknown): ValidationResult<UploadToDriveInput> {
  if (!input || typeof input !== 'object') {
    return failure('Invalid input: expected an object');
  }

  const obj = input as Record<string, unknown>;

  // Validate required childId
  if (typeof obj.childId !== 'string' || !obj.childId.trim()) {
    return failure('Invalid input: childId is required');
  }

  // Validate required fileName
  if (typeof obj.fileName !== 'string' || !obj.fileName.trim()) {
    return failure('Invalid input: fileName is required');
  }

  // Validate required mimeType
  if (typeof obj.mimeType !== 'string' || !obj.mimeType.trim()) {
    return failure('Invalid input: mimeType is required');
  }

  // Validate mimeType format
  if (!obj.mimeType.includes('/')) {
    return failure('Invalid input: mimeType must be in format type/subtype');
  }

  // Validate required content
  if (!obj.content) {
    return failure('Invalid input: content is required');
  }

  // Accept string (base64) or Buffer
  if (typeof obj.content !== 'string' && !Buffer.isBuffer(obj.content)) {
    return failure('Invalid input: content must be a string (base64) or Buffer');
  }

  // Validate optional description
  if (obj.description !== undefined && typeof obj.description !== 'string') {
    return failure('Invalid input: description must be a string');
  }

  return success({
    childId: obj.childId.trim(),
    fileName: obj.fileName.trim(),
    mimeType: obj.mimeType.trim(),
    content: obj.content as string | Buffer,
    description: obj.description as string | undefined,
  });
}

// ============================================================================
// MAIN TOOL FUNCTION
// ============================================================================

/**
 * Upload a media file to Google Drive
 *
 * @param input - File data and metadata
 * @returns Upload result with file ID and links
 *
 * @example
 * const result = await uploadToDriveTool({
 *   childId: 'CHILD-001',
 *   fileName: 'photo.jpg',
 *   mimeType: 'image/jpeg',
 *   content: base64String, // or Buffer
 *   description: 'Monthly update photo'
 * });
 */
export async function uploadToDriveTool(
  input: unknown
): Promise<UploadToDriveOutput> {
  // 1. Validate input
  const validated = validateInput(input);
  if (!validated.success) {
    logger.warn('upload-to-drive validation failed', { error: validated.error });
    return {
      success: false,
      error: validated.error,
    };
  }

  const { childId, fileName, mimeType, content, description } = validated.data!;

  // 2. Check if Drive is configured
  if (!isDriveConfigured()) {
    logger.warn('Google Drive not configured, skipping upload');
    return {
      success: false,
      error: 'Google Drive is not configured. Set Gmail OAuth environment variables with Drive scope.',
    };
  }

  // 3. Execute upload
  try {
    logger.debug('Uploading file to Drive', {
      childId,
      fileName,
      mimeType,
    });

    // Convert base64 string to Buffer if needed
    let contentBuffer: Buffer;
    if (typeof content === 'string') {
      // Check if it's a data URL
      const base64Match = content.match(/^data:[^;]+;base64,(.+)$/);
      if (base64Match) {
        contentBuffer = Buffer.from(base64Match[1], 'base64');
      } else {
        // Assume it's raw base64
        contentBuffer = Buffer.from(content, 'base64');
      }
    } else {
      contentBuffer = content;
    }

    // Upload to Drive
    const result: DriveUploadResult = await uploadFileToDrive({
      childId,
      fileName,
      mimeType,
      content: contentBuffer,
      description,
    });

    if (!result.success) {
      logger.error('Drive upload failed', { error: result.error });
      return {
        success: false,
        error: result.error,
      };
    }

    // 4. Log success
    logger.info('File uploaded to Drive', {
      fileId: result.data?.fileId,
      fileName: result.data?.fileName,
      childId,
    });

    // 5. Return structured output
    return {
      success: true,
      data: {
        fileId: result.data!.fileId,
        fileName: result.data!.fileName,
        webViewLink: result.data?.webViewLink,
        webContentLink: result.data?.webContentLink,
        folderId: result.data!.parentFolderId,
      },
    };
  } catch (error) {
    // 6. Handle errors gracefully
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('upload-to-drive failed', error, {
      childId,
      fileName,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}
