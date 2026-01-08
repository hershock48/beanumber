/**
 * Create Test Sponsorship Script
 * 
 * Creates a test sponsorship record in Airtable for testing the sponsor portal
 * 
 * Usage:
 *   npm run create-test-sponsorship
 * 
 * Or with custom values:
 *   npm run create-test-sponsorship -- --sponsorCode BAN-2025-001 --email kevin@beanumber.org
 */

import Stripe from 'stripe';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_SPONSORSHIPS_TABLE = process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';

interface TestSponsorship {
  SponsorCode: string;
  SponsorEmail: string;
  ChildID: string;
  ChildDisplayName: string;
  AuthStatus: 'Active' | 'Revoked';
  VisibleToSponsor: boolean;
  ChildAge?: string;
  ChildLocation?: string;
  SponsorshipStartDate?: string;
}

async function createTestSponsorship(data: TestSponsorship) {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Airtable credentials not configured. Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID');
  }

  const fields: any = {
    'SponsorCode': data.SponsorCode,
    'SponsorEmail': data.SponsorEmail,
    'ChildID': data.ChildID,
    'ChildDisplayName': data.ChildDisplayName,
    'AuthStatus': data.AuthStatus,
    'VisibleToSponsor': data.VisibleToSponsor,
  };

  if (data.ChildAge) fields['ChildAge'] = data.ChildAge;
  if (data.ChildLocation) fields['ChildLocation'] = data.ChildLocation;
  if (data.SponsorshipStartDate) fields['SponsorshipStartDate'] = data.SponsorshipStartDate;

  const response = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_SPONSORSHIPS_TABLE}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Airtable API error: ${error}`);
  }

  const result = await response.json();
  return result;
}

// Default test data
const defaultTestData: TestSponsorship = {
  SponsorCode: 'BAN-2025-001',
  SponsorEmail: 'kevin@beanumber.org',
  ChildID: 'CHILD-001',
  ChildDisplayName: 'Test Child',
  AuthStatus: 'Active',
  VisibleToSponsor: true,
  ChildAge: '8',
  ChildLocation: 'Northern Uganda',
  SponsorshipStartDate: new Date().toISOString().split('T')[0],
};

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  let testData = { ...defaultTestData };
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace('--', '');
    const value = args[i + 1];
    
    if (key === 'sponsorCode') testData.SponsorCode = value;
    if (key === 'email') testData.SponsorEmail = value;
    if (key === 'childID') testData.ChildID = value;
    if (key === 'childName') testData.ChildDisplayName = value;
    if (key === 'childAge') testData.ChildAge = value;
    if (key === 'childLocation') testData.ChildLocation = value;
  }

  createTestSponsorship(testData)
    .then((result) => {
      console.log('\n✅ Test sponsorship created successfully!');
      console.log('\n📋 Test Data:');
      console.log(`   Sponsor Code: ${testData.SponsorCode}`);
      console.log(`   Email: ${testData.SponsorEmail}`);
      console.log(`   Child ID: ${testData.ChildID}`);
      console.log(`   Child Name: ${testData.ChildDisplayName}`);
      console.log(`\n   Record ID: ${result.id}`);
      console.log('\n🧪 To test:');
      console.log(`   1. Visit: http://localhost:3001/sponsor/login`);
      console.log(`   2. Login with: ${testData.SponsorEmail} / ${testData.SponsorCode}`);
      console.log(`   3. You should see the sponsor dashboard\n`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Failed to create test sponsorship:', error.message);
      process.exit(1);
    });
}

export { createTestSponsorship };
