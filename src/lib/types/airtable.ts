/**
 * TypeScript type definitions for Airtable records
 * These types ensure type safety across the application
 */

// ============================================================================
// SPONSORSHIPS TABLE
// ============================================================================

export interface AirtableSponsorshipRecord {
  id: string;
  fields: {
    SponsorCode: string;
    SponsorEmail: string;
    SponsorName?: string;
    ChildID: string;
    ChildDisplayName: string;
    ChildPhoto?: Array<{
      id: string;
      url: string;
      filename: string;
      size: number;
      type: string;
      width?: number;
      height?: number;
    }>;
    ChildAge?: string;
    ChildLocation?: string;
    SponsorshipStartDate?: string;
    AuthStatus: 'Active' | 'Inactive' | 'Suspended';
    Status?: 'Active' | 'Paused' | 'Ended' | 'Awaiting Sponsor';
    VisibleToSponsor: boolean;
    LastRequestAt?: string;
    NextRequestEligibleAt?: string;
  };
  createdTime: string;
}

export type SponsorshipFields = AirtableSponsorshipRecord['fields'];

// ============================================================================
// UPDATES TABLE
// ============================================================================

export interface AirtableUpdateRecord {
  id: string;
  fields: {
    ChildID: string;
    SponsorCode?: string;
    UpdateType: 'Progress Report' | 'Photo Update' | 'Special Note' | 'Holiday Greeting' | 'Milestone';
    Title: string;
    Content: string;
    Photos?: Array<{
      id: string;
      url: string;
      filename: string;
      size: number;
      type: string;
      width?: number;
      height?: number;
    }>;
    Status: 'Pending Review' | 'Published' | 'Rejected';
    VisibleToSponsor: boolean;
    RequestedBySponsor?: boolean;
    RequestedAt?: string;
    PublishedAt?: string;
    SubmittedBy?: string;
    SubmittedAt?: string;
  };
  createdTime: string;
}

export type UpdateFields = AirtableUpdateRecord['fields'];

// ============================================================================
// DONORS TABLE
// ============================================================================

export interface AirtableDonorRecord {
  id: string;
  fields: {
    'Donor Name': string;
    'Email Address'?: string;
    'Organization Name'?: string;
    'Phone Number'?: string;
    'Mailing Address'?: string;
    'Stripe Customer ID'?: string;
  };
  createdTime: string;
}

export type DonorFields = AirtableDonorRecord['fields'];

// ============================================================================
// DONATIONS TABLE
// ============================================================================

export interface AirtableDonationRecord {
  id: string;
  fields: {
    'Stripe Payment Intent ID': string;
    'Stripe Checkout Session ID'?: string;
    'Stripe Customer ID'?: string;
    'Donation Amount': number;
    Currency: string;
    'Donation Date': string;
    'Payment Status': 'Succeeded' | 'Pending' | 'Failed' | 'Refunded';
    'Recurring Donation'?: boolean;
    Donor?: string[]; // Linked record IDs
    'Donor Email at Donation'?: string;
    'Donation Source'?: string;
    'Subscription ID'?: string;
    'Address Line 1'?: string;
    City?: string;
    State?: string;
    'Postal Code'?: string;
    Country?: string;
  };
  createdTime: string;
}

export type DonationFields = AirtableDonationRecord['fields'];

// ============================================================================
// AIRTABLE API RESPONSE TYPES
// ============================================================================

export interface AirtableListResponse<T> {
  records: T[];
  offset?: string;
}

export interface AirtableError {
  error: {
    type: string;
    message: string;
  };
}

// ============================================================================
// APPLICATION DOMAIN TYPES
// ============================================================================

/**
 * Simplified sponsor data for sessions
 */
export interface SponsorSession {
  code: string;
  email: string;
  name?: string;
  childId: string;
  childName: string;
}

/**
 * Child profile data for sponsor dashboard
 */
export interface ChildProfile {
  id: string;
  displayName: string;
  age?: string;
  location?: string;
  photo?: {
    url: string;
    filename: string;
  };
  sponsorshipStartDate?: string;
}

/**
 * Update data for sponsor dashboard
 */
export interface SponsorUpdate {
  id: string;
  type: UpdateFields['UpdateType'];
  title: string;
  content: string;
  photos?: Array<{
    url: string;
    filename: string;
  }>;
  publishedAt?: string;
  submittedBy?: string;
}

/**
 * Request update eligibility
 */
export interface RequestUpdateEligibility {
  canRequest: boolean;
  lastRequestAt?: string;
  nextEligibleAt?: string;
  daysUntilEligible?: number;
}

// ============================================================================
// CHILDREN TABLE (NEW)
// ============================================================================

export interface AirtableChildRecord {
  id: string;
  fields: {
    'Child ID': string;
    FirstName: string;
    LastInitial?: string;
    Status: 'active' | 'inactive' | 'paused' | 'archived';
    SchoolLocation?: string;
    GradeClass?: string;
    ExpectedFieldPeriod?: string;
    ExpectedAcademicTerm?: string;
    LastFieldUpdateDate?: string;
    LastAcademicUpdateDate?: string;
    Sponsors?: string[]; // Linked record IDs
    Notes?: string;
  };
  createdTime: string;
}

export type ChildFields = AirtableChildRecord['fields'];

// ============================================================================
// CHILD UPDATES TABLE (NEW)
// ============================================================================

export interface AirtableChildUpdateRecord {
  id: string;
  fields: {
    'Update ID'?: string; // Formula field
    Child?: string[]; // Linked record IDs
    ChildID?: string; // Lookup field
    SourceType: 'field' | 'academic';
    Period?: string; // For field updates (e.g., '2026-01')
    AcademicTerm?: string; // For academic updates (e.g., 'Term 1 2026')
    SubmittedAt: string;
    SubmittedBy: string; // Email
    Status: 'Draft' | 'Pending Review' | 'Published' | 'Rejected' | 'Needs Correction';
    
    // Field Update Payload
    PhysicalWellbeing?: 'Excellent' | 'Good' | 'Okay' | 'Needs attention';
    PhysicalNotes?: string;
    EmotionalWellbeing?: 'Excellent' | 'Good' | 'Okay' | 'Needs attention';
    EmotionalNotes?: string;
    SchoolEngagement?: 'Very engaged' | 'Engaged' | 'Inconsistent' | 'Not engaged';
    EngagementNotes?: string;
    SponsorNarrative?: string;
    PositiveHighlight?: string;
    Challenge?: string;
    
    // Academic Update Payload
    AttendancePercent?: number;
    EnglishGrade?: number;
    MathGrade?: number;
    ScienceGrade?: number;
    SocialStudiesGrade?: number;
    TeacherComment?: string;
    
    // Drive File References
    DriveFolderID?: string;
    Photo1FileID?: string;
    Photo2FileID?: string;
    Photo3FileID?: string;
    HandwrittenNoteFileID?: string;
    ReportCardFileID?: string;
    
    // Governance
    ReviewedBy?: string; // Email
    ReviewedAt?: string;
    RejectionReason?: string;
    CorrectionNotes?: string;
    SupersedesUpdate?: string[]; // Linked record IDs
    SupersededBy?: string[]; // Linked record IDs
  };
  createdTime: string;
}

export type ChildUpdateFields = AirtableChildUpdateRecord['fields'];
