/**
 * Airtable Setup Validation Script
 * 
 * Checks if the Children and Child Updates tables exist and are properly configured.
 * 
 * Usage:
 *   tsx scripts/check-airtable-setup.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// Load .env.local manually
function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          process.env[key.trim()] = valueParts.join('=').trim();
        }
      }
    });
  }
}

// Load environment variables
loadEnvFile();

// Read env vars
const config = {
  apiKey: process.env.AIRTABLE_API_KEY || '',
  baseId: process.env.AIRTABLE_BASE_ID || '',
  tables: {
    sponsorships: process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships',
    updates: process.env.AIRTABLE_UPDATES_TABLE || 'Updates',
    children: process.env.AIRTABLE_CHILDREN_TABLE || 'Children',
    childUpdates: process.env.AIRTABLE_CHILD_UPDATES_TABLE || 'Child Updates',
  },
};

interface AirtableTable {
  id: string;
  name: string;
  description?: string;
}

interface AirtableBaseSchema {
  tables: AirtableTable[];
}

async function checkAirtableSetup() {
  if (!config.apiKey || !config.baseId) {
    console.error('❌ Missing required environment variables:');
    if (!config.apiKey) console.error('   - AIRTABLE_API_KEY');
    if (!config.baseId) console.error('   - AIRTABLE_BASE_ID');
    console.error('\n💡 Make sure .env.local exists and contains these variables.\n');
    process.exit(1);
  }
  
  console.log('🔍 Checking Airtable setup...\n');
  console.log(`Base ID: ${config.baseId}\n`);

  try {
    // Get base schema (this requires metadata API access)
    // Note: This might not work with personal access tokens
    // We'll try the metadata endpoint first
    const metadataUrl = `https://api.airtable.com/v0/meta/bases/${config.baseId}/tables`;
    
    const response = await fetch(metadataUrl, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
    });

    if (!response.ok) {
      if (response.status === 403) {
        console.log('⚠️  Cannot access metadata API with current token.');
        console.log('   This is normal - metadata API requires different permissions.\n');
        console.log('📋 Manual Setup Required:\n');
        console.log('   1. Go to your Airtable base: https://airtable.com/' + config.baseId);
        console.log('   2. Follow the guide: docs/setup/AIRTABLE_CHILD_UPDATES_SETUP.md');
        console.log('   3. Create the tables manually in the Airtable UI\n');
        return;
      }
      throw new Error(`Failed to fetch base schema: ${response.statusText}`);
    }

    const schema: AirtableBaseSchema = await response.json();
    const tableNames = schema.tables.map(t => t.name);

    console.log(`📊 Found ${schema.tables.length} tables in base:\n`);
    schema.tables.forEach(table => {
      console.log(`   - ${table.name}`);
    });
    console.log('');

    // Check for required tables
    const requiredTables = {
      'Children': config.tables.children || 'Children',
      'Child Updates': config.tables.childUpdates || 'Child Updates',
      'Sponsorships': config.tables.sponsorships,
      'Updates': config.tables.updates,
    };

    console.log('✅ Checking required tables:\n');
    
    let allTablesExist = true;
    for (const [displayName, tableName] of Object.entries(requiredTables)) {
      if (!tableName) {
        console.log(`   ⚠️  ${displayName}: Not configured (missing env var)`);
        continue;
      }
      
      const exists = tableNames.includes(tableName);
      if (exists) {
        console.log(`   ✅ ${displayName} (${tableName}): EXISTS`);
      } else {
        console.log(`   ❌ ${displayName} (${tableName}): MISSING`);
        allTablesExist = false;
      }
    }

    console.log('');

    if (allTablesExist) {
      console.log('🎉 All required tables exist!\n');
      console.log('✅ Setup complete. You can now:');
      console.log('   - Run migration: npm run migrate-children');
      console.log('   - Start using the new tables in your code\n');
    } else {
      console.log('❌ Some tables are missing.\n');
      console.log('📋 Next Steps:\n');
      console.log('   1. Create missing tables in Airtable UI');
      console.log('   2. Follow: docs/setup/AIRTABLE_CHILD_UPDATES_SETUP.md');
      console.log('   3. Run this script again to verify\n');
    }

    // Try to check if we can read from existing tables
    if (tableNames.includes(config.tables.sponsorships)) {
      console.log('🔍 Testing Sponsorships table access...');
      const testUrl = `https://api.airtable.com/v0/${config.baseId}/${config.tables.sponsorships}?maxRecords=1`;
      const testResponse = await fetch(testUrl, {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
        },
      });

      if (testResponse.ok) {
        const testData = await testResponse.json();
        console.log(`   ✅ Can read from Sponsorships (${testData.records.length} record(s) found)\n`);
      } else {
        console.log(`   ⚠️  Cannot read from Sponsorships: ${testResponse.statusText}\n`);
      }
    }

  } catch (error: any) {
    console.error('❌ Error checking setup:', error.message);
    console.log('\n📋 Manual Setup Required:\n');
    console.log('   1. Go to your Airtable base');
    console.log('   2. Follow: docs/setup/AIRTABLE_CHILD_UPDATES_SETUP.md');
    console.log('   3. Create tables manually in Airtable UI\n');
  }
}

// Run check
checkAirtableSetup().catch(console.error);
