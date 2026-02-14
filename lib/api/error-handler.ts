import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

/**
 * 错误代码枚举
 * 格式: [模块]_[类型]_[具体错误]
 */
export enum ErrorCode {
  // 通用错误 (1xxx)
  UNKNOWN_ERROR = 'COMMON_UNKNOWN',
  INTERNAL_ERROR = 'COMMON_INTERNAL',
  NOT_FOUND = 'COMMON_NOT_FOUND',
  VALIDATION_ERROR = 'COMMON_VALIDATION',
  UNAUTHORIZED = 'COMMON_UNAUTHORIZED',
  FORBIDDEN = 'COMMON_FORBIDDEN',
  
  // A2A模块错误 (2xxx)
  A2A_SEND_FAILED = 'A2A_SEND_FAILED',
  A2A_INVALID_MESSAGE = 'A2A_INVALID_MESSAGE',
  A2A_AGENT_NOT_FOUND = 'A2A_AGENT_NOT_FOUND',
  A2A_RATE_LIMITED = 'A2A_RATE_LIMITED',
  
  // 状态机错误 (3xxx)
  STATE_INVALID_TRANSITION = 'STATE_INVALID_TRANSITION',
  STATE_MACHINE_ERROR = 'STATE_MACHINE_ERROR',
  
  // 治理引擎错误 (4xxx)
  GOV_PROPOSAL_NOT_FOUND = 'GOV_PROPOSAL_NOT_FOUND',
  GOV_UNAUTHORIZED_CREATE = 'GOV_UNAUTHORIZED_CREATE',
  GOV_VOTE_FAILED = 'GOV_VOTE_FAILED',
  GOV_PROPOSAL_EXPIRED = 'GOV_PROPOSAL_EXPIRED',
  
  // 存储错误 (5xxx)
  STORAGE_READ_ERROR = 'STORAGE_READ_ERROR',
  STORAGE_WRITE_ERROR = 'STORAGE_WRITE_ERROR',
  STORAGE_NOT_INITIALIZED = 'STORAGE_NOT_INITIALIZED',
}

/**
 * 错误严重级别
 */
export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * 错误响应格式
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    status: number;
    severity: ErrorSeverity;
    details?: Record<string, unknown>;
    timestamp: number;
    requestId: string;
  };
}

/**
 * API错误类
 */
export class APIError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly severity: ErrorSeverity;
  public readonly details?: Record<string, unknown>;
  public readonly timestamp: number;
  public readonly requestId: string;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number = 500,
    options?: {
      severity?: ErrorSeverity;
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'APIError';
    this.code = code;
    this.statusCode = statusCode;
    this.severity = options?.severity || ErrorSeverity.ERROR;
    this.details = options?.details;
    this.timestamp = Date.now();
    this.requestId = this.generateRequestId();
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, APIError);
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  toJSON(): ErrorResponse {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        status: this.statusCode,
        severity: this.severity,
        details: this.details,
        timestamp: this.timestamp,
        requestId: this.requestId,
      },
    };
  }

  static notFound(resource: string, details?: Record<string, unknown>): APIError {
    return new APIError(
      ErrorCode.NOT_FOUND,
      `${resource} not found`,
      404,
      { severity: ErrorSeverity.WARNING, details }
    );
  }

  static unauthorized(message = 'Unauthorized', details?: Record<string, unknown>): APIError {
    return new APIError(
      ErrorCode.UNAUTHORIZED,
      message,
      401,
      { severity: ErrorSeverity.WARNING, details }
    );
  }

  static forbidden(message = 'Forbidden', details?: Record<string, unknown>): APIError {
    return new APIError(
      ErrorCode.FORBIDDEN,
      message,
      403,
      { severity: ErrorSeverity.WARNING, details }
    );
  }

  static validation(message: string, details?: Record<string, unknown>): APIError {
    return new APIError(
      ErrorCode.VALIDATION_ERROR,
      message,
      400,
      { severity: ErrorSeverity.WARNING, details }
    );
  }

  static internal(message = 'Internal server error', cause?: Error): APIError {
    return new APIError(
      ErrorCode.INTERNAL_ERROR,
      message,
      500,
      { severity: ErrorSeverity.CRITICAL, cause }
    );
  }
}

/**
 * 统一错误处理函数
 */
export function handleAPIError(error: unknown): NextResponse<ErrorResponse> {
  // 1. 处理已知的APIError
  if (error instanceof APIError) {
    return NextResponse.json(error.toJSON(), { status: error.statusCode });
  }

  // 2. 处理Zod验证错误
  if (error instanceof ZodError) {
    const apiError = new APIError(
      ErrorCode.VALIDATION_ERROR,
      'Request validation failed',
      400,
      {
        severity: ErrorSeverity.WARNING,
        details: {
          issues: error.issues.map(issue => ({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          })),
        },
      }
    );
    return NextResponse.json(apiError.toJSON(), { status: 400 });
  }

  // 3. 处理标准Error
  if (error instanceof Error) {
    const apiError = APIError.internal(error.message, error);
    return NextResponse.json(apiError.toJSON(), { status: 500 });
  }

  // 4. 处理未知错误
  const unknownError = new APIError(
    ErrorCode.UNKNOWN_ERROR,
    'An unknown error occurred',
    500,
    { severity: ErrorSeverity.CRITICAL, details: { rawError: String(error) } }
  );
  return NextResponse.json(unknownError.toJSON(), { status: 500 });
}

/**
 * 成功响应格式
 */
export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: {
    timestamp: number;
    requestId: string;
  };
}

/**
 * 创建成功响应
 */
export function createSuccessResponse<T>(data: T): SuccessResponse<T> {
  return {
    success: true,
    data,
    meta: {
      timestamp: Date.now(),
      requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    },
  };
}
