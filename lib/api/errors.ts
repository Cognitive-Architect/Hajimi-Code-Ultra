/**
 * 统一错误处理
 * 
 * HajimiError + 错误码彩蛋
 * 
 * @module lib/api/errors
 * @version 1.3.0
 */

// ========== 基础错误类 ==========

export interface ErrorDetails {
  [key: string]: unknown;
}

export class HajimiError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details: ErrorDetails;
  readonly timestamp: number;
  readonly requestId: string;

  constructor(
    code: string,
    message: string,
    statusCode: number = 500,
    details: ErrorDetails = {},
    requestId: string = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  ) {
    super(message);
    this.name = 'HajimiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = Date.now();
    this.requestId = requestId;

    // 保持堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HajimiError);
    }
  }

  /**
   * 序列化为JSON
   */
  toJSON(): {
    code: string;
    message: string;
    statusCode: number;
    details: ErrorDetails;
    timestamp: number;
    requestId: string;
    stack?: string;
  } {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp,
      requestId: this.requestId,
      stack: process.env.NODE_ENV === 'development' ? this.stack : undefined,
    };
  }
}

// ========== 错误码定义 + 彩蛋 ==========

export const ErrorCodes = {
  // 400 - Bad Request
  VALIDATION_ERROR: {
    code: 'HJM-400',
    status: 400,
    message: '请求参数验证失败',
    easterEgg: '欸？参数错了？等等我查一下...',
  },
  
  // 401 - Unauthorized
  UNAUTHORIZED: {
    code: 'HJM-401',
    status: 401,
    message: '未授权访问',
    easterEgg: '凛酱...不见了...',
  },
  
  // 403 - Forbidden
  FORBIDDEN: {
    code: 'HJM-403',
    status: 403,
    message: '禁止访问',
    easterEgg: '哈？你以为你能访问这个？',
  },
  
  // 404 - Not Found
  NOT_FOUND: {
    code: 'HJM-404',
    status: 404,
    message: '资源不存在',
    easterEgg: 'なんで春日影やったの！？',
  },
  
  // 409 - Conflict
  CONFLICT: {
    code: 'HJM-409',
    status: 409,
    message: '资源冲突',
    easterEgg: 'このチーム、もう終わりだ...',
  },
  
  // 429 - Rate Limit
  RATE_LIMIT: {
    code: 'HJM-429',
    status: 429,
    message: '请求过于频繁',
    easterEgg: 'もう無理、もう無理...',
  },
  
  // 500 - Internal Server Error
  INTERNAL_ERROR: {
    code: 'HJM-500',
    status: 500,
    message: '服务器内部错误',
    easterEgg: '睦...壊れちゃった...',
  },
  
  // 502 - Bad Gateway
  BAD_GATEWAY: {
    code: 'HJM-502',
    status: 502,
    message: '网关错误',
    easterEgg: '接続...できない...',
  },
  
  // 503 - Service Unavailable
  SERVICE_UNAVAILABLE: {
    code: 'HJM-503',
    status: 503,
    message: '服务不可用',
    easterEgg: '私は...関与しない...',
  },
} as const;

// ========== 便捷错误创建 ==========

export function createValidationError(details?: ErrorDetails, requestId?: string): HajimiError {
  return new HajimiError(
    ErrorCodes.VALIDATION_ERROR.code,
    ErrorCodes.VALIDATION_ERROR.message,
    ErrorCodes.VALIDATION_ERROR.status,
    { ...details, easterEgg: ErrorCodes.VALIDATION_ERROR.easterEgg },
    requestId
  );
}

export function createUnauthorizedError(details?: ErrorDetails, requestId?: string): HajimiError {
  return new HajimiError(
    ErrorCodes.UNAUTHORIZED.code,
    ErrorCodes.UNAUTHORIZED.message,
    ErrorCodes.UNAUTHORIZED.status,
    { ...details, easterEgg: ErrorCodes.UNAUTHORIZED.easterEgg },
    requestId
  );
}

export function createForbiddenError(details?: ErrorDetails, requestId?: string): HajimiError {
  return new HajimiError(
    ErrorCodes.FORBIDDEN.code,
    ErrorCodes.FORBIDDEN.message,
    ErrorCodes.FORBIDDEN.status,
    { ...details, easterEgg: ErrorCodes.FORBIDDEN.easterEgg },
    requestId
  );
}

export function createNotFoundError(resource: string, requestId?: string): HajimiError {
  return new HajimiError(
    ErrorCodes.NOT_FOUND.code,
    `${ErrorCodes.NOT_FOUND.message}: ${resource}`,
    ErrorCodes.NOT_FOUND.status,
    { resource, easterEgg: ErrorCodes.NOT_FOUND.easterEgg },
    requestId
  );
}

export function createConflictError(details?: ErrorDetails, requestId?: string): HajimiError {
  return new HajimiError(
    ErrorCodes.CONFLICT.code,
    ErrorCodes.CONFLICT.message,
    ErrorCodes.CONFLICT.status,
    { ...details, easterEgg: ErrorCodes.CONFLICT.easterEgg },
    requestId
  );
}

export function createRateLimitError(retryAfter?: number, requestId?: string): HajimiError {
  return new HajimiError(
    ErrorCodes.RATE_LIMIT.code,
    ErrorCodes.RATE_LIMIT.message,
    ErrorCodes.RATE_LIMIT.status,
    { retryAfter, easterEgg: ErrorCodes.RATE_LIMIT.easterEgg },
    requestId
  );
}

export function createInternalError(details?: ErrorDetails, requestId?: string): HajimiError {
  return new HajimiError(
    ErrorCodes.INTERNAL_ERROR.code,
    ErrorCodes.INTERNAL_ERROR.message,
    ErrorCodes.INTERNAL_ERROR.status,
    { ...details, easterEgg: ErrorCodes.INTERNAL_ERROR.easterEgg },
    requestId
  );
}

// ========== 错误处理工具 ==========

/**
 * 判断是否为HajimiError
 */
export function isHajimiError(error: unknown): error is HajimiError {
  return error instanceof HajimiError;
}

/**
 * 转换未知错误为HajimiError
 */
export function toHajimiError(error: unknown, requestId?: string): HajimiError {
  if (isHajimiError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new HajimiError(
      ErrorCodes.INTERNAL_ERROR.code,
      error.message,
      ErrorCodes.INTERNAL_ERROR.status,
      { originalError: error.name },
      requestId
    );
  }

  return new HajimiError(
    ErrorCodes.INTERNAL_ERROR.code,
    'Unknown error',
    ErrorCodes.INTERNAL_ERROR.status,
    { error },
    requestId
  );
}

export { default } from './middleware';
