/**
 * Migration Script: Populate Children Table from Sponsorships
 * 
 * This script helps migrate child data from the Sponsorships table
 * to the new Children table.
 * 
 * Usage:
 *   tsx scripts/migrate-children-to-airtable.ts
 * 
 * Prerequisites:
 *   - Children table must be created in Airtable
 *   - Environment variables must be set
 */

import { getAirtableConfig } from '../src/lib/env';

interface SponsorshipRecord {
  id: string;
  fields: {
    ChildID: string;
    ChildDisplayName: string;
    ChildAge?: string;
    ChildLocation?: string;
    SponsorshipStartDate?: string;
    Status?: string;
  };
}

interface ChildRecord {
  fields: {
    'Child ID': string;
    FirstName: string;
    LastInitial?: string;
    Status: 'active' | 'inactive' | 'paused' | 'archived';
    SchoolLocation?: string;
    GradeClass?: string;
    Notes?: string;
  };
}

async function migrateChildren() {
  const config = getAirtableConfig();
  
  if (!config.tables.children) {
    console.error('❌ AIRTABLE_CHILDREN_TABLE not set in environment variables');
    console.error('   Add AIRTABLE_CHILDREN_TABLE=Children to your .env.local');
    process.exit(1);
  }

  console.log('📋 Starting migration from Sponsorships to Children table...\n');

  try {
    // Fetch all sponsorships
    const sponsorshipsUrl = `https://api.airtable.com/v0/${config.baseId}/${config.tables.sponsorships}`;
    const sponsorshipsResponse = await fetch(sponsorshipsUrl, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
    });

    if (!sponsorshipsResponse.ok) {
      throw new Error(`Failed to fetch sponsorships: ${sponsorshipsResponse.statusText}`);
    }

    const sponsorshipsData = await sponsorshipsResponse.json();
    const sponsorships = sponsorshipsData.records as SponsorshipRecord[];

    console.log(`📊 Found ${sponsorships.length} sponsorship records\n`);

    // Extract unique children
    const childrenMap = new Map<string, {
      childId: string;
      displayName: string;
      age?: string;
      location?: string;
      status: string;
    }>();

    for (const sponsorship of sponsorships) {
      const childId = sponsorship.fields.ChildID;
      if (!childId) continue;

      // Use the most recent sponsorship data for each child
      if (!childrenMap.has(childId)) {
        childrenMap.set(childId, {
          childId,
          displayName: sponsorship.fields.ChildDisplayName || '',
          age: sponsorship.fields.ChildAge,
          location: sponsorship.fields.ChildLocation,
          status: sponsorship.fields.Status || 'active',
        });
      }
    }

    console.log(`👶 Found ${childrenMap.size} unique children\n`);

    // Check which children already exist
    const childrenUrl = `https://api.airtable.com/v0/${config.baseId}/${config.tables.children}`;
    const existingResponse = await fetch(childrenUrl, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
    });

    const existingChildren = existingResponse.ok 
      ? (await existingResponse.json()).records as Array<{ fields: { 'Child ID': string } }>
      : [];

    const existingChildIds = new Set(
      existingChildren.map(c => c.fields['Child ID'])
    );

    console.log(`✅ Found ${existingChildIds.size} existing children in Children table\n`);

    // Prepare new children records
    const newChildren: ChildRecord[] = [];
    let skipped = 0;

    for (const [childId, data] of childrenMap) {
      if (existingChildIds.has(childId)) {
        skipped++;
        continue;
      }

      // Parse first name from display name
      const firstName = data.displayName.split(' ')[0] || data.displayName;
      const lastInitial = data.displayName.split(' ').length > 1 
        ? data.displayName.split(' ')[1][0]?.toUpperCase() 
        : undefined;

      // Map status
      let status: 'active' | 'inactive' | 'paused' | 'archived' = 'active';
      if (data.status === 'Paused') status = 'paused';
      if (data.status === 'Ended') status = 'inactive';

      const childRecord: ChildRecord = {
        fields: {
          'Child ID': childId,
          FirstName: firstName,
          LastInitial: lastInitial,
          Status: status,
          SchoolLocation: data.location,
          GradeClass: data.age ? `Grade ${data.age}` : undefined,
          Notes: `Migrated from Sponsorships table. Original display name: ${data.displayName}`,
        },
      };

      newChildren.push(childRecord);
    }

    console.log(`📝 Prepared ${newChildren.length} new children records`);
    console.log(`⏭️  Skipped ${skipped} existing children\n`);

    if (newChildren.length === 0) {
      console.log('✅ No new children to migrate. All done!');
      return;
    }

    // Create children in batches (Airtable allows up to 10 records per request)
    const batchSize = 10;
    let created = 0;

    for (let i = 0; i < newChildren.length; i += batchSize) {
      const batch = newChildren.slice(i, i + batchSize);
      
      const createResponse = await fetch(childrenUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          records: batch,
        }),
      });

      if (!createResponse.ok) {
        const error = await createResponse.json();
        console.error(`❌ Error creating batch ${Math.floor(i / batchSize) + 1}:`, error);
        continue;
      }

      created += batch.length;
      console.log(`✅ Created batch ${Math.floor(i / batchSize) + 1}: ${batch.length} children (${created}/${newChildren.length})`);
    }

    console.log(`\n🎉 Migration complete!`);
    console.log(`   Created: ${created} children`);
    console.log(`   Skipped: ${skipped} existing children`);
    console.log(`   Total: ${childrenMap.size} children\n`);

  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run migration
migrateChildren().catch(console.error);
