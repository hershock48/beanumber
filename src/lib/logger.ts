/**
 * Logging infrastructure
 * Provides structured logging with different levels and contexts
 */

import { LOG_LEVELS } from './constants';

type LogLevel = typeof LOG_LEVELS[keyof typeof LOG_LEVELS];

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: Error;
}

class Logger {
  private isDevelopment: boolean;
  private isProduction: boolean;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
    this.isProduction = process.env.NODE_ENV === 'production';
  }

  /**
   * Format log entry for output
   */
  private formatLog(entry: LogEntry): string {
    const { level, message, timestamp, context, error } = entry;

    if (this.isDevelopment) {
      // Pretty format for development
      let output = `[${timestamp}] ${level.toUpperCase()}: ${message}`;

      if (context && Object.keys(context).length > 0) {
        output += `\n  Context: ${JSON.stringify(context, null, 2)}`;
      }

      if (error) {
        output += `\n  Error: ${error.message}`;
        if (error.stack) {
          output += `\n  Stack: ${error.stack}`;
        }
      }

      return output;
    } else {
      // JSON format for production (easier for log aggregation)
      return JSON.stringify({
        level,
        message,
        timestamp,
        ...context,
        ...(error && {
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
        }),
      });
    }
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
      error,
    };

    const formatted = this.formatLog(entry);

    switch (level) {
      case LOG_LEVELS.ERROR:
        console.error(formatted);
        break;
      case LOG_LEVELS.WARN:
        console.warn(formatted);
        break;
      case LOG_LEVELS.INFO:
        console.info(formatted);
        break;
      case LOG_LEVELS.DEBUG:
        if (this.isDevelopment) {
          console.debug(formatted);
        }
        break;
    }
  }

  /**
   * Log error
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorObj = error instanceof Error ? error : undefined;
    const errorContext = error && !(error instanceof Error)
      ? { ...context, error }
      : context;

    this.log(LOG_LEVELS.ERROR, message, errorContext, errorObj);
  }

  /**
   * Log warning
   */
  warn(message: string, context?: LogContext): void {
    this.log(LOG_LEVELS.WARN, message, context);
  }

  /**
   * Log info
   */
  info(message: string, context?: LogContext): void {
    this.log(LOG_LEVELS.INFO, message, context);
  }

  /**
   * Log debug (only in development)
   */
  debug(message: string, context?: LogContext): void {
    this.log(LOG_LEVELS.DEBUG, message, context);
  }

  /**
   * Log API request
   */
  apiRequest(method: string, path: string, context?: LogContext): void {
    this.info(`API Request: ${method} ${path}`, {
      type: 'api_request',
      method,
      path,
      ...context,
    });
  }

  /**
   * Log API response
   */
  apiResponse(method: string, path: string, status: number, duration?: number): void {
    this.info(`API Response: ${method} ${path} - ${status}`, {
      type: 'api_response',
      method,
      path,
      status,
      ...(duration && { duration_ms: duration }),
    });
  }

  /**
   * Log API error
   */
  apiError(method: string, path: string, error: Error | unknown, context?: LogContext): void {
    const errorObj = error instanceof Error ? error : new Error(String(error));

    this.error(`API Error: ${method} ${path}`, errorObj, {
      type: 'api_error',
      method,
      path,
      ...context,
    });
  }

  /**
   * Log authentication event
   */
  auth(event: string, success: boolean, context?: LogContext): void {
    const level = success ? LOG_LEVELS.INFO : LOG_LEVELS.WARN;
    this.log(level, `Auth: ${event} - ${success ? 'SUCCESS' : 'FAILED'}`, {
      type: 'auth',
      event,
      success,
      ...context,
    });
  }

  /**
   * Log database query
   */
  dbQuery(table: string, operation: string, context?: LogContext): void {
    this.debug(`Database Query: ${operation} on ${table}`, {
      type: 'db_query',
      table,
      operation,
      ...context,
    });
  }

  /**
   * Log database error
   */
  dbError(table: string, operation: string, error: Error | unknown, context?: LogContext): void {
    const errorObj = error instanceof Error ? error : new Error(String(error));

    this.error(`Database Error: ${operation} on ${table}`, errorObj, {
      type: 'db_error',
      table,
      operation,
      ...context,
    });
  }

  /**
   * Log payment event
   */
  payment(event: string, context?: LogContext): void {
    this.info(`Payment: ${event}`, {
      type: 'payment',
      event,
      ...context,
    });
  }

  /**
   * Log email event
   */
  email(event: string, recipient: string, template?: string, context?: LogContext): void {
    this.info(`Email: ${event}`, {
      type: 'email',
      event,
      recipient: this.maskEmail(recipient),
      template,
      ...context,
    });
  }

  /**
   * Log email error
   */
  emailError(event: string, recipient: string, error: Error | unknown, context?: LogContext): void {
    const errorObj = error instanceof Error ? error : new Error(String(error));

    this.error(`Email Error: ${event}`, errorObj, {
      type: 'email_error',
      event,
      recipient: this.maskEmail(recipient),
      ...context,
    });
  }

  /**
   * Mask sensitive data (email)
   */
  maskEmail(email: string): string {
    if (!email || !email.includes('@')) return '***';

    const [local, domain] = email.split('@');
    const maskedLocal = local.length > 2
      ? local.substring(0, 2) + '***'
      : '***';

    return `${maskedLocal}@${domain}`;
  }

  /**
   * Mask sensitive data (sponsor code)
   */
  maskSponsorCode(code: string): string {
    if (!code || code.length < 8) return '***';
    return code.substring(0, 8) + '***';
  }

  /**
   * Create a child logger with additional context
   */
  child(baseContext: LogContext): Logger {
    const childLogger = new Logger();

    // Override log method to include base context
    const originalLog = childLogger.log.bind(childLogger);
    childLogger.log = (level: LogLevel, message: string, context?: LogContext, error?: Error) => {
      originalLog(level, message, { ...baseContext, ...context }, error);
    };

    return childLogger;
  }
}

// Export singleton instance
export const logger = new Logger();

// Export class for testing or custom instances
export { Logger };

/**
 * Performance measurement utility
 */
export class PerformanceTimer {
  private startTime: number;
  private label: string;

  constructor(label: string) {
    this.label = label;
    this.startTime = Date.now();
  }

  /**
   * End timing and log duration
   */
  end(context?: LogContext): number {
    const duration = Date.now() - this.startTime;

    logger.debug(`Performance: ${this.label}`, {
      type: 'performance',
      label: this.label,
      duration_ms: duration,
      ...context,
    });

    return duration;
  }
}

/**
 * Create a performance timer
 */
export function startTimer(label: string): PerformanceTimer {
  return new PerformanceTimer(label);
}
