# 第5章 API与权限（B-05）

> **工单编号**: B-05/09  
> **任务目标**: 统一错误处理、权限验证、请求验证  
> **基于**: 白皮书第8章API设计 + fix.md Task 5  
> **版本**: v1.0 | 日期: 2026-02-13

---

## 5.1 统一错误处理

### 5.1.1 APIError类设计

```typescript
// lib/api/error-handler.ts

import { NextResponse } from 'next/server';

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
  
  // 插件错误 (6xxx)
  PLUGIN_NOT_FOUND = 'PLUGIN_NOT_FOUND',
  PLUGIN_LOAD_FAILED = 'PLUGIN_LOAD_FAILED',
  PLUGIN_EXECUTION_FAILED = 'PLUGIN_EXECUTION_FAILED',
}

/**
 * 错误严重级别
 */
export enum ErrorSeverity {
  INFO = 'info',       // 信息性错误
  WARNING = 'warning', // 警告
  ERROR = 'error',     // 一般错误
  CRITICAL = 'critical', // 严重错误
}

/**
 * API错误类
 * 所有API错误统一使用此类
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
    
    // 保持堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, APIError);
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 转换为JSON响应格式
   */
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

  // ========== 预设错误工厂方法 ==========

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
 * 成功响应格式
 */
export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: {
    timestamp: number;
    requestId: string;
    pagination?: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  };
}

/**
 * 统一响应类型
 */
export type APIResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;
```

### 5.1.2 handleAPIError函数

```typescript
// lib/api/error-handler.ts (续)

import { ZodError } from 'zod';
import { AgentRole } from '@/lib/types/agent';

/**
 * 统一错误处理函数
 * 所有API路由的catch块都应调用此函数
 */
export function handleAPIError(error: unknown): NextResponse<ErrorResponse> {
  // 1. 处理已知的APIError
  if (error instanceof APIError) {
    logError(error);
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
    logError(apiError);
    return NextResponse.json(apiError.toJSON(), { status: 400 });
  }

  // 3. 处理标准Error
  if (error instanceof Error) {
    const apiError = APIError.internal(error.message, error);
    logError(apiError);
    return NextResponse.json(apiError.toJSON(), { status: 500 });
  }

  // 4. 处理未知错误
  const unknownError = new APIError(
    ErrorCode.UNKNOWN_ERROR,
    'An unknown error occurred',
    500,
    { severity: ErrorSeverity.CRITICAL, details: { rawError: String(error) } }
  );
  logError(unknownError);
  return NextResponse.json(unknownError.toJSON(), { status: 500 });
}

/**
 * 错误日志记录
 */
function logError(error: APIError): void {
  const logEntry = {
    timestamp: new Date(error.timestamp).toISOString(),
    requestId: error.requestId,
    code: error.code,
    status: error.statusCode,
    severity: error.severity,
    message: error.message,
    details: error.details,
    stack: error.stack,
  };

  // 根据严重级别选择日志级别
  switch (error.severity) {
    case ErrorSeverity.INFO:
      console.info('[API]', logEntry);
      break;
    case ErrorSeverity.WARNING:
      console.warn('[API]', logEntry);
      break;
    case ErrorSeverity.ERROR:
      console.error('[API]', logEntry);
      break;
    case ErrorSeverity.CRITICAL:
      console.error('[API] CRITICAL:', logEntry);
      // 这里可以添加告警通知
      break;
  }
}

/**
 * 创建成功响应
 */
export function createSuccessResponse<T>(
  data: T,
  meta?: Partial<SuccessResponse<T>['meta']>
): NextResponse<SuccessResponse<T>> {
  const response: SuccessResponse<T> = {
    success: true,
    data,
    meta: {
      timestamp: Date.now(),
      requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      ...meta,
    },
  };
  
  return NextResponse.json(response);
}

/**
 * 创建错误响应（快捷方式）
 */
export function createErrorResponse(
  code: ErrorCode,
  message: string,
  statusCode: number,
  details?: Record<string, unknown>
): NextResponse<ErrorResponse> {
  const error = new APIError(code, message, statusCode, { details });
  return NextResponse.json(error.toJSON(), { status: statusCode });
}
```

### 5.1.3 错误格式规范

```typescript
// lib/api/error-format.ts

/**
 * HTTP状态码与错误代码映射
 */
export const HTTP_STATUS_MAP: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

/**
 * 错误代码分类
 */
export const ERROR_CATEGORIES = {
  // 1xxx - 通用错误
  COMMON: /^COMMON_/,
  // 2xxx - A2A错误
  A2A: /^A2A_/,
  // 3xxx - 状态机错误
  STATE: /^STATE_/,
  // 4xxx - 治理引擎错误
  GOV: /^GOV_/,
  // 5xxx - 存储错误
  STORAGE: /^STORAGE_/,
  // 6xxx - 插件错误
  PLUGIN: /^PLUGIN_/,
} as const;

/**
 * 标准错误响应示例
 * 
 * 400 Bad Request:
 * {
 *   "success": false,
 *   "error": {
 *     "code": "COMMON_VALIDATION",
 *     "message": "Request validation failed",
 *     "status": 400,
 *     "severity": "warning",
 *     "details": {
 *       "issues": [
 *         { "path": "sender", "message": "Required", "code": "invalid_type" }
 *       ]
 *     },
 *     "timestamp": 1707830400000,
 *     "requestId": "req_1707830400000_abc123"
 *   }
 * }
 * 
 * 401 Unauthorized:
 * {
 *   "success": false,
 *   "error": {
 *     "code": "COMMON_UNAUTHORIZED",
 *     "message": "Authentication required",
 *     "status": 401,
 *     "severity": "warning",
 *     "timestamp": 1707830400000,
 *     "requestId": "req_1707830400000_def456"
 *   }
 * }
 * 
 * 403 Forbidden:
 * {
 *   "success": false,
 *   "error": {
 *     "code": "GOV_UNAUTHORIZED_CREATE",
 *     "message": "Only PM can create proposals",
 *     "status": 403,
 *     "severity": "warning",
 *     "details": { "requiredRole": "pm", "currentRole": "engineer" },
 *     "timestamp": 1707830400000,
 *     "requestId": "req_1707830400000_ghi789"
 *   }
 * }
 * 
 * 500 Internal Server Error:
 * {
 *   "success": false,
 *   "error": {
 *     "code": "COMMON_INTERNAL",
 *     "message": "Internal server error",
 *     "status": 500,
 *     "severity": "critical",
 *     "timestamp": 1707830400000,
 *     "requestId": "req_1707830400000_jkl012"
 *   }
 * }
 */
```

---

## 5.2 权限验证中间件

### 5.2.1 withAuth中间件

```typescript
// lib/api/auth.ts

import { NextRequest, NextResponse } from 'next/server';
import { APIError, ErrorCode, ErrorSeverity, ErrorResponse } from './error-handler';
import { AgentRole, AGENT_ROLES } from '@/lib/types/agent';

/**
 * 认证上下文
 */
export interface AuthContext {
  agentId: string;
  role: AgentRole;
  permissions: string[];
  sessionId?: string;
  iat: number;  // 签发时间
  exp: number;  // 过期时间
}

/**
 * 认证配置
 */
interface AuthConfig {
  required?: boolean;
  roles?: AgentRole[];
  permissions?: string[];
}

/**
 * 模拟Token验证（MVP阶段使用）
 * 生产环境应使用JWT或OAuth2
 */
function verifyToken(token: string): AuthContext | null {
  try {
    // MVP: 简单解析 token 格式 "agentId:role:timestamp"
    const [agentId, role, timestamp] = token.split(':');
    
    if (!agentId || !role || !timestamp) {
      return null;
    }

    // 验证角色有效性
    if (!AGENT_ROLES.includes(role as AgentRole)) {
      return null;
    }

    const iat = parseInt(timestamp, 10);
    const exp = iat + 24 * 60 * 60 * 1000; // 24小时过期

    // 检查是否过期
    if (Date.now() > exp) {
      return null;
    }

    return {
      agentId,
      role: role as AgentRole,
      permissions: getRolePermissions(role as AgentRole),
      iat,
      exp,
    };
  } catch {
    return null;
  }
}

/**
 * 获取角色权限
 */
function getRolePermissions(role: AgentRole): string[] {
  const permissionMap: Record<AgentRole, string[]> = {
    pm: ['proposal:create', 'proposal:read', 'vote:submit', 'state:transition', 'a2a:send'],
    arch: ['proposal:read', 'vote:submit', 'state:transition', 'a2a:send'],
    qa: ['proposal:read', 'vote:submit', 'a2a:send'],
    engineer: ['proposal:read', 'vote:submit', 'a2a:send'],
    mike: ['proposal:read', 'vote:submit', 'a2a:send'],
  };
  
  return permissionMap[role] || [];
}

/**
 * 从请求中提取Token
 */
function extractToken(request: NextRequest): string | null {
  // 1. 从Authorization头提取
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // 2. 从Cookie提取
  const tokenCookie = request.cookies.get('auth_token');
  if (tokenCookie) {
    return tokenCookie.value;
  }

  // 3. 从查询参数提取（仅用于开发/测试）
  const url = new URL(request.url);
  const tokenParam = url.searchParams.get('token');
  if (tokenParam) {
    return tokenParam;
  }

  return null;
}

/**
 * 认证中间件包装器
 * 
 * 使用示例:
 * ```typescript
 * export const GET = withAuth(async (request, context) => {
 *   // 已认证的处理逻辑
 *   return createSuccessResponse({ data: 'protected' });
 * });
 * 
 * export const POST = withAuth(
 *   async (request, context) => {
 *     // PM专属处理逻辑
 *     return createSuccessResponse({ data: 'proposal created' });
 *   },
 *   { roles: ['pm'] }
 * );
 * ```
 */
export function withAuth<
  T = unknown
>(
  handler: (request: NextRequest, context: AuthContext) => Promise<NextResponse<T>>,
  config: AuthConfig = {}
): (request: NextRequest) => Promise<NextResponse<T | ErrorResponse>> {
  return async (request: NextRequest) => {
    try {
      // 1. 提取Token
      const token = extractToken(request);

      // 2. 验证Token
      const authContext = token ? verifyToken(token) : null;

      // 3. 检查是否需要认证
      if (config.required !== false && !authContext) {
        const error = new APIError(
          ErrorCode.UNAUTHORIZED,
          'Authentication required',
          401,
          { severity: ErrorSeverity.WARNING }
        );
        return NextResponse.json(error.toJSON(), { status: 401 });
      }

      // 4. 检查角色权限
      if (config.roles && authContext) {
        if (!config.roles.includes(authContext.role)) {
          const error = new APIError(
            ErrorCode.FORBIDDEN,
            `Required role: ${config.roles.join(' or ')}`,
            403,
            {
              severity: ErrorSeverity.WARNING,
              details: {
                requiredRoles: config.roles,
                currentRole: authContext.role,
              },
            }
          );
          return NextResponse.json(error.toJSON(), { status: 403 });
        }
      }

      // 5. 检查具体权限
      if (config.permissions && authContext) {
        const hasPermission = config.permissions.every(p => 
          authContext.permissions.includes(p)
        );
        if (!hasPermission) {
          const error = new APIError(
            ErrorCode.FORBIDDEN,
            'Insufficient permissions',
            403,
            {
              severity: ErrorSeverity.WARNING,
              details: {
                requiredPermissions: config.permissions,
                currentPermissions: authContext.permissions,
              },
            }
          );
          return NextResponse.json(error.toJSON(), { status: 403 });
        }
      }

      // 6. 调用处理器（未认证时传入空上下文）
      return handler(request, authContext || {
        agentId: 'anonymous',
        role: 'mike' as AgentRole,  // 默认最低权限
        permissions: [],
        iat: Date.now(),
        exp: Date.now(),
      });
    } catch (error) {
      // 处理中间件内部错误
      if (error instanceof APIError) {
        return NextResponse.json(error.toJSON(), { status: error.statusCode });
      }
      
      const internalError = APIError.internal(
        'Authentication middleware error',
        error instanceof Error ? error : undefined
      );
      return NextResponse.json(internalError.toJSON(), { status: 500 });
    }
  };
}

/**
 * 可选认证中间件
 * 不强制要求认证，但会提取认证信息
 */
export function withOptionalAuth<T = unknown>(
  handler: (request: NextRequest, context: AuthContext | null) => Promise<NextResponse<T>>
): (request: NextRequest) => Promise<NextResponse<T | ErrorResponse>> {
  return withAuth(handler as any, { required: false });
}
```

### 5.2.2 requireRole函数

```typescript
// lib/api/auth.ts (续)

/**
 * 角色权限检查装饰器
 * 
 * 使用示例:
 * ```typescript
 * const createProposal = requireRole(['pm'])(
 *   async (data, context) => {
 *     // 只有PM能执行
 *     return proposalService.create(data);
 *   }
 * );
 * ```
 */
export function requireRole<TArgs extends unknown[], TReturn>(
  allowedRoles: AgentRole[]
): (
  fn: (context: AuthContext, ...args: TArgs) => Promise<TReturn>
) => (context: AuthContext | null, ...args: TArgs) => Promise<TReturn> {
  return (fn) => {
    return async (context: AuthContext | null, ...args: TArgs) => {
      if (!context) {
        throw new APIError(
          ErrorCode.UNAUTHORIZED,
          'Authentication required',
          401
        );
      }

      if (!allowedRoles.includes(context.role)) {
        throw new APIError(
          ErrorCode.FORBIDDEN,
          `This operation requires one of the following roles: ${allowedRoles.join(', ')}`,
          403,
          {
            severity: ErrorSeverity.WARNING,
            details: {
              requiredRoles: allowedRoles,
              currentRole: context.role,
            },
          }
        );
      }

      return fn(context, ...args);
    };
  };
}

/**
 * 权限检查函数
 */
export function checkPermission(
  context: AuthContext | null,
  permission: string
): boolean {
  if (!context) return false;
  return context.permissions.includes(permission) || 
         context.permissions.includes('*');
}

/**
 * 生成认证Token（MVP版本）
 * 生产环境应使用JWT
 */
export function generateToken(
  agentId: string,
  role: AgentRole
): string {
  const timestamp = Date.now().toString();
  // MVP: 简单格式 "agentId:role:timestamp"
  return `${agentId}:${role}:${timestamp}`;
}

/**
 * 角色层级（用于权限继承）
 */
export const ROLE_HIERARCHY: Record<AgentRole, number> = {
  pm: 100,      // 最高权限
  arch: 80,
  qa: 60,
  engineer: 40,
  mike: 20,     // 最低权限
};

/**
 * 检查角色级别是否满足要求
 */
export function hasMinimumRole(
  context: AuthContext | null,
  minRole: AgentRole
): boolean {
  if (!context) return false;
  return ROLE_HIERARCHY[context.role] >= ROLE_HIERARCHY[minRole];
}

/**
 * 组合多个权限检查
 */
export function requireAll<TArgs extends unknown[], TReturn>(
  ...checks: ((context: AuthContext | null) => boolean)[]
): (
  fn: (context: AuthContext, ...args: TArgs) => Promise<TReturn>
) => (context: AuthContext | null, ...args: TArgs) => Promise<TReturn> {
  return (fn) => {
    return async (context: AuthContext | null, ...args: TArgs) => {
      const allPassed = checks.every(check => check(context));
      
      if (!allPassed) {
        throw new APIError(
          ErrorCode.FORBIDDEN,
          'All permission checks must pass',
          403
        );
      }

      if (!context) {
        throw new APIError(
          ErrorCode.UNAUTHORIZED,
          'Authentication required',
          401
        );
      }

      return fn(context, ...args);
    };
  };
}

/**
 * 任一权限检查通过
 */
export function requireAny<TArgs extends unknown[], TReturn>(
  ...checks: ((context: AuthContext | null) => boolean)[]
): (
  fn: (context: AuthContext, ...args: TArgs) => Promise<TReturn>
) => (context: AuthContext | null, ...args: TArgs) => Promise<TReturn> {
  return (fn) => {
    return async (context: AuthContext | null, ...args: TArgs) => {
      const anyPassed = checks.some(check => check(context));
      
      if (!anyPassed) {
        throw new APIError(
          ErrorCode.FORBIDDEN,
          'At least one permission check must pass',
          403
        );
      }

      if (!context) {
        throw new APIError(
          ErrorCode.UNAUTHORIZED,
          'Authentication required',
          401
        );
      }

      return fn(context, ...args);
    };
  };
}
```

---

## 5.3 请求验证

### 5.3.1 Zod Schema设计

```typescript
// lib/api/schemas/index.ts

import { z } from 'zod';
import { AgentRole, AGENT_ROLES } from '@/lib/types/agent';
import { PowerState, POWER_STATES } from '@/lib/types/state';

// ========== 基础Schema ==========

/**
 * UUID Schema
 */
export const UUIDSchema = z.string().uuid();

/**
 * 时间戳 Schema
 */
export const TimestampSchema = z.number().int().positive();

/**
 * Agent角色 Schema
 */
export const AgentRoleSchema = z.enum(
  AGENT_ROLES as [AgentRole, ...AgentRole[]]
);

/**
 * 七权状态 Schema
 */
export const PowerStateSchema = z.enum(
  POWER_STATES as [PowerState, ...PowerState[]]
);

// ========== A2A消息 Schema ==========

/**
 * 消息类型
 */
export const MessageTypeSchema = z.enum(['chat', 'proposal', 'vote', 'system']);

/**
 * 发送消息请求 Schema
 */
export const SendMessageSchema = z.object({
  sender: AgentRoleSchema,
  receiver: AgentRoleSchema,
  content: z.string()
    .min(1, 'Message content cannot be empty')
    .max(10000, 'Message content too long (max 10000 characters)'),
  type: MessageTypeSchema.default('chat'),
  sessionId: z.string().optional(),
  replyTo: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type SendMessageRequest = z.infer<typeof SendMessageSchema>;

/**
 * 消息历史查询 Schema
 */
export const MessageHistoryQuerySchema = z.object({
  sessionId: z.string(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  before: TimestampSchema.optional(),
  after: TimestampSchema.optional(),
  type: MessageTypeSchema.optional(),
});

export type MessageHistoryQuery = z.infer<typeof MessageHistoryQuerySchema>;

// ========== 治理引擎 Schema ==========

/**
 * 提案状态
 */
export const ProposalStatusSchema = z.enum([
  'pending',
  'voting',
  'approved',
  'rejected',
  'expired',
]);

/**
 * 投票选项
 */
export const VoteChoiceSchema = z.enum(['approve', 'reject', 'abstain']);

/**
 * 创建提案请求 Schema
 */
export const CreateProposalSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title too long (max 200 characters)'),
  description: z.string()
    .min(1, 'Description is required')
    .max(5000, 'Description too long (max 5000 characters)'),
  targetState: PowerStateSchema.optional(),
  expiresIn: z.number().int().min(60000).max(86400000).default(1800000), // 默认30分钟
});

export type CreateProposalRequest = z.infer<typeof CreateProposalSchema>;

/**
 * 投票请求 Schema
 */
export const VoteRequestSchema = z.object({
  proposalId: UUIDSchema,
  choice: VoteChoiceSchema,
  reason: z.string().max(500).optional(),
});

export type VoteRequest = z.infer<typeof VoteRequestSchema>;

/**
 * 提案列表查询 Schema
 */
export const ProposalListQuerySchema = z.object({
  status: ProposalStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export type ProposalListQuery = z.infer<typeof ProposalListQuerySchema>;

// ========== 状态机 Schema ==========

/**
 * 状态流转请求 Schema
 */
export const StateTransitionSchema = z.object({
  to: PowerStateSchema,
  reason: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type StateTransitionRequest = z.infer<typeof StateTransitionSchema>;

/**
 * 批量状态流转请求 Schema
 */
export const BatchTransitionSchema = z.object({
  transitions: z.array(StateTransitionSchema).min(1).max(10),
});

export type BatchTransitionRequest = z.infer<typeof BatchTransitionSchema>;

// ========== 存储 Schema ==========

/**
 * 存储层级
 */
export const StorageTierSchema = z.enum(['transient', 'staging', 'archive']);

/**
 * 存储设置 Schema
 */
export const StorageSetSchema = z.object({
  key: z.string().min(1).max(256),
  value: z.unknown(),
  tier: StorageTierSchema.default('transient'),
  ttl: z.number().int().positive().optional(),
});

export type StorageSetRequest = z.infer<typeof StorageSetSchema>;

/**
 * 存储查询 Schema
 */
export const StorageGetSchema = z.object({
  key: z.string().min(1).max(256),
});

export type StorageGetRequest = z.infer<typeof StorageGetSchema>;

// ========== 插件 Schema ==========

/**
 * 插件模式
 */
export const PluginModeSchema = z.enum(['http', 'iframe', 'mcp']);

/**
 * 插件清单 Schema（与lib/plugins/types.ts一致）
 */
export const PluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/).min(3).max(64),
  name: z.string().min(1).max(128),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().max(512).optional(),
  author: z.string().max(128).optional(),
  homepage: z.string().url().optional(),
  icon: z.string().url().optional(),
  mode: PluginModeSchema,
  entry: z.string(),
  permissions: z.array(z.string()).default([]),
  configSchema: z.record(z.any()).optional(),
  defaultConfig: z.record(z.any()).optional(),
  hooks: z.array(z.string()).default([]),
  dependencies: z.record(z.string()).optional(),
  minRuntimeVersion: z.string().optional(),
  maxRuntimeVersion: z.string().optional(),
});

export type PluginManifestInput = z.infer<typeof PluginManifestSchema>;

/**
 * 插件执行请求 Schema
 */
export const PluginExecuteSchema = z.object({
  pluginId: z.string(),
  action: z.string(),
  payload: z.record(z.unknown()).default({}),
});

export type PluginExecuteRequest = z.infer<typeof PluginExecuteSchema>;

// ========== 通用 Schema ==========

/**
 * 分页查询 Schema
 */
export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationParams = z.infer<typeof PaginationSchema>;

/**
 * ID参数 Schema
 */
export const IdParamSchema = z.object({
  id: UUIDSchema,
});

export type IdParam = z.infer<typeof IdParamSchema>;
```

### 5.3.2 验证中间件

```typescript
// lib/api/validation.ts

import { NextRequest, NextResponse } from 'next/server';
import { z, ZodSchema, ZodError } from 'zod';
import { APIError, ErrorCode, ErrorSeverity, ErrorResponse } from './error-handler';
import { AuthContext } from './auth';

/**
 * 验证来源类型
 */
export type ValidationSource = 'body' | 'query' | 'params' | 'headers';

/**
 * 验证配置
 */
interface ValidationConfig<TBody = unknown, TQuery = unknown, TParams = unknown> {
  body?: ZodSchema<TBody>;
  query?: ZodSchema<TQuery>;
  params?: ZodSchema<TParams>;
  headers?: ZodSchema<Record<string, string>>;
}

/**
 * 验证结果
 */
interface ValidationResult<TBody, TQuery, TParams> {
  body: TBody;
  query: TQuery;
  params: TParams;
  headers: Record<string, string>;
}

/**
 * 从请求中提取数据
 */
async function extractData(
  request: NextRequest,
  source: ValidationSource
): Promise<unknown> {
  switch (source) {
    case 'body':
      try {
        return await request.clone().json();
      } catch {
        throw new APIError(
          ErrorCode.VALIDATION_ERROR,
          'Invalid JSON in request body',
          400,
          { severity: ErrorSeverity.WARNING }
        );
      }
    
    case 'query':
      const url = new URL(request.url);
      return Object.fromEntries(url.searchParams);
    
    case 'params':
      // 从URL路径中提取参数（需要在路由中配置）
      return {};
    
    case 'headers':
      return Object.fromEntries(request.headers.entries());
    
    default:
      return {};
  }
}

/**
 * 验证数据
 */
function validateData<T>(
  data: unknown,
  schema: ZodSchema<T>,
  source: ValidationSource
): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
        source,
      }));

      throw new APIError(
        ErrorCode.VALIDATION_ERROR,
        `Validation failed for ${source}`,
        400,
        {
          severity: ErrorSeverity.WARNING,
          details: { issues },
        }
      );
    }
    throw error;
  }
}

/**
 * 验证中间件包装器
 * 
 * 使用示例:
 * ```typescript
 * export const POST = withValidation(
 *   async (request, data, context) => {
 *     // data.body 已验证为 SendMessageRequest 类型
 *     const { sender, receiver, content } = data.body;
 *     return createSuccessResponse({ message: 'sent' });
 *   },
 *   {
 *     body: SendMessageSchema,
 *   }
 * );
 * ```
 */
export function withValidation<
  TBody = unknown,
  TQuery = unknown,
  TParams = unknown,
  TResponse = unknown
>(
  handler: (
    request: NextRequest,
    data: ValidationResult<TBody, TQuery, TParams>,
    context: AuthContext | null
  ) => Promise<NextResponse<TResponse>>,
  config: ValidationConfig<TBody, TQuery, TParams>
): (request: NextRequest) => Promise<NextResponse<TResponse | ErrorResponse>> {
  return async (request: NextRequest) => {
    try {
      const result: ValidationResult<unknown, unknown, unknown> = {
        body: undefined,
        query: undefined,
        params: undefined,
        headers: {},
      };

      // 验证请求体
      if (config.body) {
        const bodyData = await extractData(request, 'body');
        result.body = validateData(bodyData, config.body, 'body');
      }

      // 验证查询参数
      if (config.query) {
        const queryData = await extractData(request, 'query');
        result.query = validateData(queryData, config.query, 'query');
      }

      // 验证路径参数
      if (config.params) {
        const paramsData = await extractData(request, 'params');
        result.params = validateData(paramsData, config.params, 'params');
      }

      // 验证请求头
      if (config.headers) {
        const headersData = await extractData(request, 'headers');
        result.headers = validateData(headersData, config.headers, 'headers');
      }

      // 提取认证上下文（如果有）
      const authContext = extractAuthContext(request);

      // 调用处理器
      return handler(
        request,
        result as ValidationResult<TBody, TQuery, TParams>,
        authContext
      );
    } catch (error) {
      if (error instanceof APIError) {
        return NextResponse.json(error.toJSON(), { status: error.statusCode });
      }
      
      const internalError = APIError.internal(
        'Validation middleware error',
        error instanceof Error ? error : undefined
      );
      return NextResponse.json(internalError.toJSON(), { status: 500 });
    }
  };
}

/**
 * 从请求中提取认证上下文
 */
function extractAuthContext(request: NextRequest): AuthContext | null {
  // 从自定义header中提取（由withAuth中间件设置）
  const authHeader = request.headers.get('x-auth-context');
  if (authHeader) {
    try {
      return JSON.parse(authHeader);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * 组合验证和认证中间件
 * 
 * 使用示例:
 * ```typescript
 * export const POST = withAuthAndValidation(
 *   async (request, data, context) => {
 *     // 已认证且已验证
 *     return createSuccessResponse({ data: 'success' });
 *   },
 *   { roles: ['pm'] },
 *   { body: CreateProposalSchema }
 * );
 * ```
 */
export function withAuthAndValidation<
  TBody = unknown,
  TQuery = unknown,
  TParams = unknown,
  TResponse = unknown
>(
  handler: (
    request: NextRequest,
    data: ValidationResult<TBody, TQuery, TParams>,
    context: AuthContext
  ) => Promise<NextResponse<TResponse>>,
  authConfig: { roles?: string[]; permissions?: string[] },
  validationConfig: ValidationConfig<TBody, TQuery, TParams>
): (request: NextRequest) => Promise<NextResponse<TResponse | ErrorResponse>> {
  return async (request: NextRequest) => {
    // 这里需要导入withAuth
    const { withAuth } = await import('./auth');
    
    return withAuth(
      async (req, context) => {
        // 在认证后执行验证
        const validationHandler = withValidation(
          async (r, data) => handler(r, data, context),
          validationConfig
        );
        return validationHandler(req) as Promise<NextResponse<TResponse>>;
      },
      authConfig
    )(request);
  };
}

/**
 * 快速验证函数（用于非路由场景）
 */
export function validate<T>(data: unknown, schema: ZodSchema<T>): T {
  return schema.parse(data);
}

/**
 * 安全验证函数（返回结果而非抛出）
 */
export function safeValidate<T>(
  data: unknown,
  schema: ZodSchema<T>
): { success: true; data: T } | { success: false; error: ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * 部分验证（允许部分字段）
 */
export function partialValidate<T>(
  data: unknown,
  schema: ZodSchema<T>
): Partial<T> {
  const partialSchema = schema instanceof z.ZodObject
    ? schema.partial()
    : schema;
  return partialSchema.parse(data);
}
```

---

## 5.4 自测点（必须包含验证命令）

### 5.4.1 自测点汇总表

| 自测ID | 验证命令 | 通过标准 | 状态 |
|--------|----------|----------|------|
| API-001 | `curl -X POST http://localhost:3000/api/v1/a2a/send -H "Content-Type: application/json" -d '{"invalid":"data"}'` | 返回统一错误格式，包含code/message/status/timestamp/requestId | 🔴 |
| API-002 | `curl -X POST http://localhost:3000/api/v1/governance/proposals -H "Content-Type: application/json" -H "Authorization: Bearer engineer:engineer:1234567890" -d '{"title":"Test","description":"Test"}'` | 返回403错误，提示需要PM角色 | 🔴 |
| API-003 | `curl -X POST http://localhost:3000/api/v1/a2a/send -H "Content-Type: application/json" -d '{"sender":"invalid","receiver":"pm","content":"test"}'` | 返回400错误，验证失败详细信息 | 🔴 |
| API-004 | `curl -X GET http://localhost:3000/api/v1/state/current -H "Authorization: Bearer pm:pm:1234567890"` | 返回200，包含正确数据结构 | 🔴 |
| API-005 | `curl -X POST http://localhost:3000/api/v1/governance/proposals -H "Authorization: Bearer pm:pm:$(date +%s)000" -H "Content-Type: application/json" -d '{"title":"Test Proposal","description":"Test description"}'` | 返回201，提案创建成功 | 🔴 |

### 5.4.2 详细验证命令

#### API-001: 统一错误格式返回

```bash
# 测试命令
TEST_RESULT=$(curl -s -X POST http://localhost:3000/api/v1/a2a/send \
  -H "Content-Type: application/json" \
  -d '{"invalid":"data"}')

echo "$TEST_RESULT" | jq .

# 预期输出格式:
{
  "success": false,
  "error": {
    "code": "COMMON_VALIDATION",
    "message": "Request validation failed",
    "status": 400,
    "severity": "warning",
    "details": {
      "issues": [
        {
          "path": "sender",
          "message": "Required",
          "code": "invalid_type",
          "source": "body"
        }
      ]
    },
    "timestamp": 1707830400000,
    "requestId": "req_1707830400000_abc123"
  }
}

# 通过标准检查脚本:
echo "$TEST_RESULT" | jq -e '.success == false' && \
echo "$TEST_RESULT" | jq -e '.error.code != null' && \
echo "$TEST_RESULT" | jq -e '.error.message != null' && \
echo "$TEST_RESULT" | jq -e '.error.status == 400' && \
echo "$TEST_RESULT" | jq -e '.error.timestamp != null' && \
echo "$TEST_RESULT" | jq -e '.error.requestId != null' && \
echo "✅ API-001 通过"
```

#### API-002: 角色权限验证拦截非法请求

```bash
# 测试命令 - 使用engineer角色尝试创建提案（需要PM角色）
TIMESTAMP=$(date +%s)000
curl -s -X POST http://localhost:3000/api/v1/governance/proposals \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer engineer:engineer:$TIMESTAMP" \
  -d '{"title":"Test","description":"Test"}' | jq .

# 预期输出:
{
  "success": false,
  "error": {
    "code": "COMMON_FORBIDDEN",
    "message": "Required role: pm",
    "status": 403,
    "severity": "warning",
    "details": {
      "requiredRoles": ["pm"],
      "currentRole": "engineer"
    },
    "timestamp": 1707830400000,
    "requestId": "req_1707830400000_def456"
  }
}

# 通过标准检查脚本:
RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/governance/proposals \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer engineer:engineer:$(date +%s)000" \
  -d '{"title":"Test","description":"Test"}')

echo "$RESPONSE" | jq -e '.success == false' && \
echo "$RESPONSE" | jq -e '.error.status == 403' && \
echo "$RESPONSE" | jq -e '.error.details.requiredRoles | contains(["pm"])' && \
echo "$RESPONSE" | jq -e '.error.details.currentRole == "engineer"' && \
echo "✅ API-002 通过"
```

#### API-003: 请求体验证失败返回400

```bash
# 测试命令 - 发送无效的角色值
RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/a2a/send \
  -H "Content-Type: application/json" \
  -d '{"sender":"invalid_role","receiver":"pm","content":"test"}')

echo "$RESPONSE" | jq .

# 预期输出:
{
  "success": false,
  "error": {
    "code": "COMMON_VALIDATION",
    "message": "Validation failed for body",
    "status": 400,
    "severity": "warning",
    "details": {
      "issues": [
        {
          "path": "sender",
          "message": "Invalid enum value. Expected 'pm' | 'arch' | 'qa' | 'engineer' | 'mike', received 'invalid_role'",
          "code": "invalid_enum_value",
          "source": "body"
        }
      ]
    },
    "timestamp": 1707830400000,
    "requestId": "req_1707830400000_ghi789"
  }
}

# 通过标准检查脚本:
echo "$RESPONSE" | jq -e '.success == false' && \
echo "$RESPONSE" | jq -e '.error.status == 400' && \
echo "$RESPONSE" | jq -e '.error.code == "COMMON_VALIDATION"' && \
echo "$RESPONSE" | jq -e '.error.details.issues | length > 0' && \
echo "$RESPONSE" | jq -e '.error.details.issues[0].path == "sender"' && \
echo "✅ API-003 通过"
```

#### API-004: 认证成功返回正确数据

```bash
# 测试命令 - PM角色获取当前状态
TIMESTAMP=$(date +%s)000
RESPONSE=$(curl -s -X GET http://localhost:3000/api/v1/state/current \
  -H "Authorization: Bearer pm:pm:$TIMESTAMP")

echo "$RESPONSE" | jq .

# 预期输出:
{
  "success": true,
  "data": {
    "state": "IDLE",
    "history": [],
    "updatedAt": 1707830400000
  },
  "meta": {
    "timestamp": 1707830400000,
    "requestId": "req_1707830400000_jkl012"
  }
}

# 通过标准检查脚本:
echo "$RESPONSE" | jq -e '.success == true' && \
echo "$RESPONSE" | jq -e '.data.state != null' && \
echo "$RESPONSE" | jq -e '.data.history != null' && \
echo "$RESPONSE" | jq -e '.meta.timestamp != null' && \
echo "$RESPONSE" | jq -e '.meta.requestId != null' && \
echo "✅ API-004 通过"
```

#### API-005: PM角色成功创建提案

```bash
# 测试命令 - PM创建提案
TIMESTAMP=$(date +%s)000
RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/governance/proposals \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pm:pm:$TIMESTAMP" \
  -d '{
    "title": "Test Proposal",
    "description": "This is a test proposal for API-005",
    "targetState": "DESIGN"
  }')

echo "$RESPONSE" | jq .

# 预期输出:
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Test Proposal",
    "description": "This is a test proposal for API-005",
    "proposer": "pm",
    "targetState": "DESIGN",
    "status": "pending",
    "votes": [],
    "createdAt": 1707830400000,
    "expiresAt": 1707832200000
  },
  "meta": {
    "timestamp": 1707830400000,
    "requestId": "req_1707830400000_mno345"
  }
}

# 通过标准检查脚本:
echo "$RESPONSE" | jq -e '.success == true' && \
echo "$RESPONSE" | jq -e '.data.id != null' && \
echo "$RESPONSE" | jq -e '.data.title == "Test Proposal"' && \
echo "$RESPONSE" | jq -e '.data.proposer == "pm"' && \
echo "$RESPONSE" | jq -e '.data.status == "pending"' && \
echo "✅ API-005 通过"
```

---

## 5.5 文件变更清单

### 5.5.1 新增文件

| 序号 | 文件路径 | 说明 | 代码行数(预估) |
|------|----------|------|----------------|
| 1 | `lib/api/error-handler.ts` | 统一错误处理、APIError类、handleAPIError函数 | ~280行 |
| 2 | `lib/api/auth.ts` | 认证中间件、withAuth、requireRole | ~350行 |
| 3 | `lib/api/validation.ts` | 请求验证中间件、withValidation | ~280行 |
| 4 | `lib/api/schemas/index.ts` | Zod Schema定义 | ~200行 |
| 5 | `lib/api/error-format.ts` | 错误格式规范文档 | ~80行 |

### 5.5.2 修改文件

| 序号 | 文件路径 | 修改说明 | 影响范围 |
|------|----------|----------|----------|
| 1 | `lib/types/agent.ts` | 添加AGENT_ROLES常量 | 认证模块依赖 |
| 2 | `lib/types/state.ts` | 添加POWER_STATES常量 | 验证模块依赖 |
| 3 | `app/api/v1/a2a/send/route.ts` | 集成错误处理和验证 | API路由层 |
| 4 | `app/api/v1/governance/proposals/route.ts` | 集成认证和验证 | API路由层 |
| 5 | `app/api/v1/governance/vote/route.ts` | 集成认证和验证 | API路由层 |
| 6 | `app/api/v1/state/current/route.ts` | 集成认证 | API路由层 |
| 7 | `app/api/v1/state/transition/route.ts` | 集成认证和验证 | API路由层 |

### 5.5.3 删除文件

无删除文件。

### 5.5.4 目录结构变更

```
lib/
├── api/                          # [新增] API工具库
│   ├── error-handler.ts          # 统一错误处理
│   ├── auth.ts                   # 认证中间件
│   ├── validation.ts             # 验证中间件
│   ├── schemas/                  # [新增] Schema定义
│   │   └── index.ts              # 所有Zod Schema
│   └── error-format.ts           # 错误格式规范
├── types/
│   ├── agent.ts                  # [修改] 添加AGENT_ROLES
│   └── state.ts                  # [修改] 添加POWER_STATES
└── ...

app/api/v1/                       # [修改] 路由集成
├── a2a/send/route.ts             # [修改] 集成错误处理+验证
├── governance/
│   ├── proposals/route.ts        # [修改] 集成认证+验证
│   └── vote/route.ts             # [修改] 集成认证+验证
└── state/
    ├── current/route.ts          # [修改] 集成认证
    └── transition/route.ts       # [修改] 集成认证+验证
```

---

## 5.6 技术债务声明

### 5.6.1 MVP阶段技术债务清单

| 债务ID | 债务项 | 严重程度 | 影响范围 | 清算计划 | 备注 |
|--------|--------|----------|----------|----------|------|
| DEBT-API-001 | Token使用简单字符串格式 | 🟡 中 | 认证模块 | Phase 6 | 应使用JWT |
| DEBT-API-002 | 角色权限硬编码 | 🟡 中 | 认证模块 | Phase 6 | 应使用RBAC数据库 |
| DEBT-API-003 | 缺少请求限流 | 🟡 中 | API路由 | Phase 6 | 应添加Rate Limiting |
| DEBT-API-004 | 错误日志仅输出到console | 🟡 中 | 错误处理 | Phase 6 | 应接入日志系统 |
| DEBT-API-005 | 缺少API版本协商 | 🟢 低 | API路由 | Phase 7 | 应支持Accept-Version头 |
| DEBT-API-006 | 认证Cookie未设置Secure/HttpOnly | 🔴 高 | 安全 | Phase 5 | 生产环境必须修复 |

### 5.6.2 Mock清单（MVP阶段使用）

| Mock项 | 位置 | 说明 | 替换计划 |
|--------|------|------|----------|
| `verifyToken()` | `lib/api/auth.ts:50` | 简单字符串解析Token | 替换为JWT验证 |
| `generateToken()` | `lib/api/auth.ts:250` | 简单字符串生成Token | 替换为JWT签发 |
| `getRolePermissions()` | `lib/api/auth.ts:80` | 硬编码角色权限映射 | 替换为数据库查询 |
| `ROLE_HIERARCHY` | `lib/api/auth.ts:270` | 硬编码角色层级 | 替换为配置中心 |

### 5.6.3 生产环境注意事项

```typescript
// ⚠️ 生产环境必须修改以下配置

// 1. Cookie安全设置
const cookieOptions = {
  httpOnly: true,      // 防止XSS
  secure: true,        // 仅HTTPS
  sameSite: 'strict',  // CSRF防护
  maxAge: 24 * 60 * 60, // 24小时
};

// 2. JWT配置（替换简单Token）
const JWT_CONFIG = {
  algorithm: 'RS256',  // 使用非对称加密
  expiresIn: '24h',
  issuer: 'hajimi-skills',
  audience: 'hajimi-api',
};

// 3. 速率限制配置
const RATE_LIMIT_CONFIG = {
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 每个IP最多100请求
};

// 4. CORS配置
const CORS_CONFIG = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
};
```

### 5.6.4 债务清算时间表

| 阶段 | 时间 | 清算债务 | 优先级 |
|------|------|----------|--------|
| Phase 5 | Day 34-36 | DEBT-API-006 (Cookie安全) | 🔴 P0 |
| Phase 6 | Day 37-42 | DEBT-API-001, 002, 003, 004 | 🟡 P1 |
| Phase 7 | Day 43-50 | DEBT-API-005 | 🟢 P2 |

---

## 附录：API路由集成示例

### 完整路由示例

```typescript
// app/api/v1/governance/proposals/route.ts

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api/auth';
import { withValidation, createSuccessResponse } from '@/lib/api/validation';
import { handleAPIError } from '@/lib/api/error-handler';
import { CreateProposalSchema, ProposalListQuerySchema } from '@/lib/api/schemas';
import { ProposalService } from '@/lib/core/governance/proposal-service';

const proposalService = new ProposalService();

// GET /api/v1/governance/proposals - 获取提案列表
export const GET = withAuth(
  withValidation(
    async (request, data) => {
      try {
        const { page, pageSize, status } = data.query;
        const proposals = await proposalService.getProposals({
          page,
          pageSize,
          status,
        });
        
        return createSuccessResponse(proposals, {
          pagination: {
            page,
            pageSize,
            total: proposals.total,
            totalPages: Math.ceil(proposals.total / pageSize),
          },
        });
      } catch (error) {
        return handleAPIError(error);
      }
    },
    { query: ProposalListQuerySchema }
  ),
  { required: false } // 列表查询允许匿名
);

// POST /api/v1/governance/proposals - 创建提案（仅PM）
export const POST = withAuth(
  withValidation(
    async (request, data, context) => {
      try {
        const proposal = await proposalService.createProposal(
          context,
          data.body
        );
        
        return createSuccessResponse(proposal);
      } catch (error) {
        return handleAPIError(error);
      }
    },
    { body: CreateProposalSchema }
  ),
  { roles: ['pm'] } // 仅PM可创建
);
```

---

**文档生成**: HAJIMI-V2.1 API路由与错误处理专家  
**审核状态**: 待审核  
**版本**: v1.0
