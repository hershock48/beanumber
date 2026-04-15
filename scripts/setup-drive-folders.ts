/**
 * Setup Google Drive Folder Structure
 *
 * Creates the standard folder structure for Be A Number:
 * - Be A Number/
 *   - Children/
 *   - Social Media/
 *     - Reels/
 *     - Posts/
 *     - Stories/
 *     - Templates/
 *
 * Run with: npx tsx scripts/setup-drive-folders.ts
 */

import 'dotenv/config';
import { google } from 'googleapis';

// ============================================================================
// CONFIGURATION
// ============================================================================

const FOLDER_STRUCTURE = {
  'Be A Number': {
    'Children': {},
    'Social Media': {
      'Reels': {},
      'Posts': {},
      'Stories': {},
      'Templates': {},
    },
  },
};

// ============================================================================
// GOOGLE DRIVE CLIENT
// ============================================================================

function getDriveClient() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Google OAuth credentials. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN.');
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'urn:ietf:wg:oauth:2.0:oob'
  );

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  return google.drive({
    version: 'v3',
    auth: oauth2Client,
  });
}

// ============================================================================
// FOLDER OPERATIONS
// ============================================================================

async function findFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId?: string
): Promise<string | null> {
  let query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
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
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId?: string
): Promise<string> {
  const fileMetadata: { name: string; mimeType: string; parents?: string[] } = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };

  if (parentId) {
    fileMetadata.parents = [parentId];
  }

  const response = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id',
  });

  return response.data.id!;
}

async function ensureFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId?: string
): Promise<string> {
  const existing = await findFolder(drive, name, parentId);
  if (existing) {
    console.log(`  ✓ Found existing: ${name}`);
    return existing;
  }

  const newId = await createFolder(drive, name, parentId);
  console.log(`  + Created: ${name}`);
  return newId;
}

// ============================================================================
// RECURSIVE FOLDER CREATION
// ============================================================================

type FolderTree = { [key: string]: FolderTree };

async function createFolderStructure(
  drive: ReturnType<typeof google.drive>,
  structure: FolderTree,
  parentId?: string,
  depth: number = 0
): Promise<void> {
  const indent = '  '.repeat(depth);

  for (const [folderName, children] of Object.entries(structure)) {
    if (depth === 0) {
      console.log(`\n${indent}📁 ${folderName}`);
    }

    const folderId = await ensureFolder(drive, folderName, parentId);

    // Recursively create children
    if (Object.keys(children).length > 0) {
      await createFolderStructure(drive, children, folderId, depth + 1);
    }
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🚀 Setting up Google Drive folder structure...\n');

  try {
    const drive = getDriveClient();

    // Test connection
    console.log('📡 Connecting to Google Drive...');
    const about = await drive.about.get({ fields: 'user' });
    console.log(`✓ Connected as: ${about.data.user?.emailAddress}\n`);

    // Create folder structure
    console.log('📂 Creating folder structure:');
    await createFolderStructure(drive, FOLDER_STRUCTURE);

    console.log('\n✅ Done! Folder structure created successfully.');
    console.log('\nYou can now upload files to:');
    console.log('  • Be A Number/Children/[ChildID]/ - for child photos');
    console.log('  • Be A Number/Social Media/Reels/ - for Instagram/TikTok reels');
    console.log('  • Be A Number/Social Media/Posts/ - for static images');
    console.log('  • Be A Number/Social Media/Stories/ - for story content');
    console.log('  • Be A Number/Social Media/Templates/ - for reusable templates');

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
