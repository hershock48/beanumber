/**
 * Standardized error handling utilities
 * Provides consistent error responses across all API routes
 */

import { NextResponse } from 'next/server';
import { logger } from './logger';
import { ERROR_MESSAGES } from './constants';

// ============================================================================
// CUSTOM ERROR CLASSES
// ============================================================================

/**
 * Base application error
 */
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public context?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 400, true, context);
  }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends AppError {
  constructor(message: string = ERROR_MESSAGES.UNAUTHORIZED, context?: Record<string, unknown>) {
    super(message, 401, true, context);
  }
}

/**
 * Authorization error (403)
 */
export class AuthorizationError extends AppError {
  constructor(message: string = ERROR_MESSAGES.UNAUTHORIZED, context?: Record<string, unknown>) {
    super(message, 403, true, context);
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 404, true, context);
  }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends AppError {
  public retryAfter?: number;

  constructor(message: string = ERROR_MESSAGES.TOO_MANY_REQUESTS, retryAfter?: number) {
    super(message, 429, true, { retryAfter });
    this.retryAfter = retryAfter;
  }
}

/**
 * External service error (502)
 */
export class ExternalServiceError extends AppError {
  constructor(service: string, message?: string) {
    super(
      message || `External service error: ${service}`,
      502,
      true,
      { service }
    );
  }
}

/**
 * Database error
 */
export class DatabaseError extends ExternalServiceError {
  constructor(message?: string) {
    super('Airtable', message || ERROR_MESSAGES.AIRTABLE_ERROR);
  }
}

/**
 * Payment processing error
 */
export class PaymentError extends ExternalServiceError {
  constructor(message?: string) {
    super('Stripe', message || ERROR_MESSAGES.STRIPE_ERROR);
  }
}

// ============================================================================
// ERROR RESPONSE HELPERS
// ============================================================================

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  timestamp: string;
  context?: Record<string, unknown>;
}

/**
 * Create standardized error response
 */
export function createErrorResponse(
  error: Error | AppError | unknown,
  method?: string,
  path?: string
): NextResponse<ErrorResponse> {
  let statusCode = 500;
  let message: string = ERROR_MESSAGES.SERVER_ERROR;
  let errorName = 'InternalServerError';
  let context: Record<string, unknown> | undefined;

  // Extract error details
  if (error instanceof AppError) {
    statusCode = error.statusCode;
    message = error.message;
    errorName = error.name;
    context = error.context;

    // Log based on severity
    if (error.isOperational) {
      logger.warn(`Operational error: ${message}`, {
        error: errorName,
        statusCode,
        ...context,
      });
    } else {
      logger.error(`Non-operational error: ${message}`, error, context);
    }
  } else if (error instanceof Error) {
    logger.error(`Unexpected error: ${error.message}`, error);
    errorName = error.name;
  } else {
    logger.error('Unknown error', error);
  }

  // Log API error if method and path provided
  if (method && path) {
    logger.apiError(method, path, error as Error, context);
  }

  // Create response body
  const responseBody: ErrorResponse = {
    error: errorName,
    message,
    statusCode,
    timestamp: new Date().toISOString(),
  };

  // Include context in development mode only
  if (process.env.NODE_ENV === 'development' && context) {
    responseBody.context = context;
  }

  // Add retry-after header for rate limit errors
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (error instanceof RateLimitError && error.retryAfter) {
    headers['Retry-After'] = String(error.retryAfter);
  }

  return NextResponse.json(responseBody, {
    status: statusCode,
    headers,
  });
}

/**
 * Create validation error response
 */
export function validationErrorResponse(message: string): NextResponse<ErrorResponse> {
  return createErrorResponse(new ValidationError(message));
}

/**
 * Create authentication error response
 */
export function authenticationErrorResponse(message?: string): NextResponse<ErrorResponse> {
  return createErrorResponse(new AuthenticationError(message));
}

/**
 * Create authorization error response
 */
export function authorizationErrorResponse(message?: string): NextResponse<ErrorResponse> {
  return createErrorResponse(new AuthorizationError(message));
}

/**
 * Create not found error response
 */
export function notFoundErrorResponse(resource: string): NextResponse<ErrorResponse> {
  return createErrorResponse(new NotFoundError(`${resource} not found`));
}

/**
 * Create rate limit error response
 */
export function rateLimitErrorResponse(retryAfter?: number): NextResponse<ErrorResponse> {
  return createErrorResponse(new RateLimitError(undefined, retryAfter));
}

// ============================================================================
// SUCCESS RESPONSE HELPERS
// ============================================================================

/**
 * Standard success response format
 */
export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
  timestamp: string;
}

/**
 * Create standardized success response
 */
export function createSuccessResponse<T>(
  data: T,
  message?: string,
  status: number = 200
): NextResponse<SuccessResponse<T>> {
  const responseBody: SuccessResponse<T> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };

  if (message) {
    responseBody.message = message;
  }

  return NextResponse.json(responseBody, { status });
}

/**
 * Create created response (201)
 */
export function createdResponse<T>(data: T, message?: string): NextResponse<SuccessResponse<T>> {
  return createSuccessResponse(data, message, 201);
}

/**
 * Create no content response (204)
 */
export function noContentResponse(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

// ============================================================================
// ERROR HANDLING WRAPPER
// ============================================================================

/**
 * Wraps an API route handler with error handling
 */
export function withErrorHandling<T extends Request = Request>(
  handler: (request: T) => Promise<NextResponse>,
  method?: string,
  path?: string
) {
  return async (request: T): Promise<NextResponse> => {
    try {
      return await handler(request);
    } catch (error) {
      return createErrorResponse(error, method, path);
    }
  };
}

// ============================================================================
// ASYNC ERROR BOUNDARY
// ============================================================================

/**
 * Safe async execution with error handling
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  errorMessage: string = 'Operation failed'
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logger.error(errorMessage, error);
    throw new AppError(errorMessage, 500, false);
  }
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Check if error is operational (expected)
 */
export function isOperationalError(error: unknown): boolean {
  if (isAppError(error)) {
    return error.isOperational;
  }
  return false;
}
