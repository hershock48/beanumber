/**
 * Tool Template
 *
 * Copy this file to create new tools. Each tool should:
 * 1. Define clear input/output interfaces
 * 2. Have a single responsibility
 * 3. Return structured results (never throw unhandled exceptions)
 * 4. Log all operations
 * 5. Validate all inputs
 *
 * Example usage in workflows:
 * - Agent reads workflow instructions
 * - Agent calls this tool with required inputs
 * - Tool executes deterministically and returns structured result
 * - Agent uses result to continue workflow
 */

import { logger } from '../logger';
import { ValidationResult, success, failure } from '../validation';

// ============================================================================
// INPUT/OUTPUT INTERFACES
// ============================================================================

/**
 * Input schema for this tool
 * Define all required and optional parameters
 */
export interface ToolInput {
  /** Required parameter description */
  requiredParam: string;
  /** Optional parameter description */
  optionalParam?: number;
}

/**
 * Output schema for this tool
 * Always includes success boolean and either data or error
 */
export interface ToolOutput<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * The actual data returned on success
 */
export interface ToolResultData {
  // Define the shape of successful result
  result: string;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate tool input
 * @param input - Raw input to validate
 * @returns Validated input or error
 */
function validateInput(input: unknown): ValidationResult<ToolInput> {
  if (!input || typeof input !== 'object') {
    return failure('Invalid input: expected an object');
  }

  const obj = input as Record<string, unknown>;

  // Validate required fields
  if (typeof obj.requiredParam !== 'string' || !obj.requiredParam.trim()) {
    return failure('Invalid input: requiredParam is required');
  }

  // Validate optional fields
  if (obj.optionalParam !== undefined && typeof obj.optionalParam !== 'number') {
    return failure('Invalid input: optionalParam must be a number');
  }

  return success({
    requiredParam: obj.requiredParam.trim(),
    optionalParam: obj.optionalParam as number | undefined,
  });
}

// ============================================================================
// MAIN TOOL FUNCTION
// ============================================================================

/**
 * Tool description - what it does
 *
 * @param input - The tool input parameters
 * @returns Structured result with success/failure and data/error
 *
 * @example
 * const result = await toolFunction({ requiredParam: 'value' });
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.error(result.error);
 * }
 */
export async function toolFunction(
  input: unknown
): Promise<ToolOutput<ToolResultData>> {
  // 1. Validate input
  const validated = validateInput(input);
  if (!validated.success) {
    logger.warn('Tool validation failed', { error: validated.error });
    return {
      success: false,
      error: validated.error,
    };
  }

  const { requiredParam, optionalParam } = validated.data!;

  // 2. Execute action
  try {
    logger.debug('Tool executing', { requiredParam, optionalParam });

    // Tool logic here
    // Replace with actual implementation
    const result = `Processed: ${requiredParam}`;

    // 3. Log success
    logger.info('Tool completed successfully', {
      requiredParam,
      result,
    });

    // 4. Return structured output
    return {
      success: true,
      data: { result },
    };
  } catch (error) {
    // 5. Handle errors gracefully
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Tool failed', error, { requiredParam });

    return {
      success: false,
      error: errorMessage,
    };
  }
}
