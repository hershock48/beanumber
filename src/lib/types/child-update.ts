/**
 * Child Update System Types (Authoritative)
 *
 * Based on the Child Update & Sponsorship Information System design document.
 * These types define the canonical data structures for child updates.
 */

// ============================================================================
// SHARED TOOL TYPES
// ============================================================================

/**
 * Standard tool error structure
 */
export interface ToolError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Standard tool result type
 * All tools return this structure for consistency
 */
export type ToolResult<T> =
  | { success: true; data: T }
  | { success: false; error: ToolError };

// ============================================================================
// CANONICAL ENUMS
// ============================================================================

/**
 * Source type for child updates
 * - field: Collected by YDO field staff (wellbeing, photos)
 * - academic: Collected by school administration (grades, attendance)
 */
export type SourceType = 'field' | 'academic';

/**
 * Status values for child updates (matches Airtable single select)
 * - Draft: Initial state, not yet reviewed
 * - Pending Review: Awaiting admin review
 * - Published: Approved and visible to sponsors
 * - Rejected: Admin rejected the update
 * - Needs Correction: Admin requested changes (optional)
 */
export type ChildUpdateStatus =
  | 'Draft'
  | 'Pending Review'
  | 'Published'
  | 'Rejected'
  | 'Needs Correction';

/**
 * Role-based actor email addresses
 * These are system roles, not personal inboxes
 */
export const ROLE_ACTOR_EMAILS = {
  FIELD_UPDATES: 'field-updates@beanumber.org',
  ACADEMICS: 'academics@beanumber.org',
  ADMIN: 'admin@beanumber.org',
} as const;

export type RoleActorEmail = typeof ROLE_ACTOR_EMAILS[keyof typeof ROLE_ACTOR_EMAILS];

/**
 * Wellbeing status options
 */
export type WellbeingStatus = 'Excellent' | 'Good' | 'Okay' | 'Needs attention';

/**
 * School engagement status options
 */
export type EngagementStatus = 'Very engaged' | 'Engaged' | 'Inconsistent' | 'Not engaged';

/**
 * Child status in the system
 */
export type ChildStatus = 'active' | 'inactive' | 'paused' | 'archived';

// ============================================================================
// CHILD DATA TYPES
// ============================================================================

/**
 * Child record from Airtable
 */
export interface Child {
  /** Airtable record ID */
  recordId: string;
  /** Child ID in format BAN-XXXX */
  childId: string;
  /** First name only (for privacy) */
  firstName: string;
  /** Last initial (optional) */
  lastInitial?: string;
  /** Current status */
  status: ChildStatus;
  /** School or program location */
  schoolLocation?: string;
  /** Grade or class */
  gradeClass?: string;
  /** Expected field update period */
  expectedFieldPeriod?: string;
  /** Expected academic term */
  expectedAcademicTerm?: string;
  /** Date of last published field update */
  lastFieldUpdateDate?: string;
  /** Date of last published academic update */
  lastAcademicUpdateDate?: string;
}

/**
 * Minimal child info for compliance checks
 */
export interface ChildSummary {
  recordId: string;
  childId: string;
  firstName: string;
  status: ChildStatus;
  schoolLocation?: string;
}

// ============================================================================
// CHILD UPDATE DATA TYPES
// ============================================================================

/**
 * Field update payload (wellbeing, photos, narrative)
 */
export interface FieldUpdatePayload {
  /** Physical wellbeing assessment */
  physicalWellbeing: WellbeingStatus;
  /** Physical wellbeing notes */
  physicalNotes: string;
  /** Emotional/social wellbeing assessment */
  emotionalWellbeing: WellbeingStatus;
  /** Emotional wellbeing notes */
  emotionalNotes: string;
  /** School engagement (non-academic) */
  schoolEngagement: EngagementStatus;
  /** Engagement notes */
  engagementNotes: string;
  /** Sponsor-facing narrative */
  sponsorNarrative: string;
  /** One positive highlight */
  positiveHighlight: string;
  /** One challenge (optional) */
  challenge?: string;
}

/**
 * Academic update payload (grades, attendance)
 */
export interface AcademicUpdatePayload {
  /** Attendance percentage (0-100) */
  attendancePercent: number;
  /** Subject grades */
  grades: {
    english?: number;
    math?: number;
    science?: number;
    socialStudies?: number;
    [subject: string]: number | undefined;
  };
  /** Teacher comment (optional) */
  teacherComment?: string;
}

/**
 * Drive file references for an update
 */
export interface DriveFileRefs {
  /** Parent folder ID */
  folderId?: string;
  /** Photo 1 file ID */
  photo1FileId?: string;
  /** Photo 2 file ID (optional) */
  photo2FileId?: string;
  /** Photo 3 file ID (optional) */
  photo3FileId?: string;
  /** Handwritten note file ID (optional) */
  handwrittenNoteFileId?: string;
  /** Report card file ID (optional, for academic) */
  reportCardFileId?: string;
}

/**
 * Full child update record
 */
export interface ChildUpdate {
  /** Airtable record ID */
  recordId: string;
  /** Computed update ID: "childId | period/term | sourceType" */
  updateId: string;
  /** Child record ID */
  childRecordId: string;
  /** Child ID */
  childId: string;
  /** Source type (field or academic) */
  sourceType: SourceType;
  /** Period for field updates (e.g., "2026-01") */
  period?: string;
  /** Academic term (e.g., "Term 1 2026") */
  academicTerm?: string;
  /** Submission timestamp */
  submittedAt: string;
  /** Submitter email (role-based) */
  submittedBy: string;
  /** Current status */
  status: ChildUpdateStatus;
  /** Field update payload (if sourceType = field) */
  fieldPayload?: FieldUpdatePayload;
  /** Academic payload (if sourceType = academic) */
  academicPayload?: AcademicUpdatePayload;
  /** Drive file references */
  driveRefs?: DriveFileRefs;
  /** Reviewed by (email) */
  reviewedBy?: string;
  /** Reviewed at timestamp */
  reviewedAt?: string;
  /** Rejection reason (if rejected) */
  rejectionReason?: string;
  /** Correction notes (if Needs Correction) */
  correctionNotes?: string;
  /** ID of update this supersedes */
  supersedesUpdateId?: string;
  /** ID of update that superseded this */
  supersededByUpdateId?: string;
}

/**
 * Input for creating a new child update record
 */
export interface CreateChildUpdateInput {
  childId: string;
  sourceType: SourceType;
  period?: string;
  academicTerm?: string;
  submittedAt: string;
  submittedBy: string;
  status: ChildUpdateStatus;
  fields: Partial<FieldUpdatePayload & AcademicUpdatePayload>;
  drive?: DriveFileRefs;
}

/**
 * Summary of a child update for lists
 */
export interface ChildUpdateSummary {
  recordId: string;
  updateId: string;
  childId: string;
  sourceType: SourceType;
  periodOrTerm: string;
  submittedAt: string;
  submittedBy: string;
  status: ChildUpdateStatus;
}

// ============================================================================
// COMPLIANCE TYPES
// ============================================================================

/**
 * Expected updates for compliance tracking
 */
export interface ExpectedUpdate {
  childId: string;
  periodOrTerm: string;
  sourceType: SourceType;
}

/**
 * Missing update record
 */
export interface MissingUpdate {
  childId: string;
  childFirstName: string;
  periodOrTerm: string;
  sourceType: SourceType;
  daysSinceDeadline?: number;
}

/**
 * Compliance summary for a period
 */
export interface ComplianceSummary {
  periodOrTerm: string;
  sourceType: SourceType;
  expected: number;
  present: number;
  missing: number;
  missingChildIds: string[];
  complianceRate: number;
  generatedAt: string;
}

// ============================================================================
// REMINDER TYPES
// ============================================================================

/**
 * Reminder email input
 */
export interface ReminderEmailInput {
  toRoleEmail: RoleActorEmail;
  subject: string;
  periodOrTerm: string;
  missingChildIds: string[];
  formUrl: string;
}

/**
 * Escalation notice input
 */
export interface EscalationNoticeInput {
  subject: string;
  responsibleRole: RoleActorEmail;
  missingCount: number;
  missingChildIds: string[];
  daysOverdue: number;
}

// ============================================================================
// FORM SUBMISSION TYPES
// ============================================================================

/**
 * Raw field form submission (from Google Forms)
 */
export interface RawFieldFormSubmission {
  childId: string;
  updatePeriod: string;
  schoolLocation: string;
  physicalWellbeing: WellbeingStatus;
  physicalNotes: string;
  emotionalWellbeing: WellbeingStatus;
  emotionalNotes: string;
  schoolEngagement: EngagementStatus;
  engagementNotes: string;
  sponsorNarrative: string;
  positiveHighlight: string;
  challenge?: string;
  photos: {
    photo1?: { fileId: string; fileName: string };
    photo2?: { fileId: string; fileName: string };
    photo3?: { fileId: string; fileName: string };
    handwrittenNote?: { fileId: string; fileName: string };
  };
  submitterEmail: string;
  timestamp: string;
}

/**
 * Raw academic form submission (from Google Forms)
 */
export interface RawAcademicFormSubmission {
  childId: string;
  academicTerm: string;
  schoolName: string;
  attendancePercent: number;
  grades: {
    english?: number;
    math?: number;
    science?: number;
    socialStudies?: number;
  };
  teacherComment?: string;
  reportCard: { fileId: string; fileName: string };
  submitterEmail: string;
  timestamp: string;
}
