/**
 * Children Tools
 *
 * WAT-compliant tools for child update system operations.
 * Based on the Child Update & Sponsorship Information System design.
 */

// Get active children
export {
  getActiveChildrenTool,
  type GetActiveChildrenOutput,
} from './get-active-children';

// Get child by ID
export {
  getChildByChildIdTool,
  type GetChildByIdInput,
  type GetChildByIdOutput,
} from './get-child-by-id';

// Find existing child update
export {
  findChildUpdateTool,
  type FindChildUpdateInput,
  type FindChildUpdateOutput,
} from './find-child-update';

// Create child update record
export {
  createChildUpdateRecordTool,
  type CreateChildUpdateOutput,
} from './create-child-update';

// List pending updates
export {
  listPendingUpdatesTool,
  type ListPendingUpdatesOutput,
} from './list-pending-updates';

// Update status
export {
  updateChildUpdateStatusTool,
  type UpdateStatusInput,
  type UpdateStatusOutput,
} from './update-status';
