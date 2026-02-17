/**
 * API中间件层
 * 
 * Zod校验 + RBAC权限 + 速率限制
 * 
 * @module lib/api/middleware
 * @version 1.3.0
 */

import { z } from 'zod';
import { HajimiError, createValidationError, createUnauthorizedError, createForbiddenError, createRateLimitError } from './errors';

// ========== RBAC权限系统 ==========

export type Permission = 
  | 'agent:read'
  | 'agent:write'
  | 'agent:delete'
  | 'proposal:read'
  | 'proposal:create'
  | 'proposal:vote'
  | 'proposal:admin'
  | 'system:admin';

export interface RolePermissions {
  PM: Permission[];
  ARCHITECT: Permission[];
  QA: Permission[];
  ENGINEER: Permission[];
  AUDIT: Permission[];
  ORCHESTRATOR: Permission[];
}

/**
 * 七权角色权限矩阵
 */
export const ROLE_PERMISSIONS: RolePermissions = {
  PM: ['agent:read', 'agent:write', 'proposal:read', 'proposal:create', 'proposal:vote', 'system:admin'],
  ARCHITECT: ['agent:read', 'agent:write', 'agent:delete', 'proposal:read', 'proposal:create', 'proposal:vote'],
  QA: ['agent:read', 'agent:write', 'proposal:read', 'proposal:vote'],
  ENGINEER: ['agent:read', 'agent:write', 'proposal:read', 'proposal:vote'],
  AUDIT: ['agent:read', 'proposal:read', 'proposal:vote', 'proposal:admin'],
  ORCHESTRATOR: ['agent:read', 'proposal:read', 'system:admin'],
};

export interface UserContext {
  id: string;
  role: keyof RolePermissions;
  permissions: Permission[];
}

/**
 * 检查权限
 */
export function hasPermission(user: UserContext, permission: Permission): boolean {
  return user.permissions.includes(permission) || user.permissions.includes('system:admin');
}

/**
 * 创建用户上下文
 */
export function createUserContext(id: string, role: keyof RolePermissions): UserContext {
  return {
    id,
    role,
    permissions: ROLE_PERMISSIONS[role] || [],
  };
}

// ========== Zod校验中间件 ==========

export interface ValidationOptions {
  body?: z.ZodSchema;
  query?: z.ZodSchema;
  params?: z.ZodSchema;
}

export interface RequestContext {
  body?: unknown;
  query?: Record<string, unknown>;
  params?: Record<string, string>;
  user?: UserContext;
}

export interface MiddlewareResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: HajimiError;
}

/**
 * Zod校验中间件
 */
export function createValidationMiddleware(options: ValidationOptions) {
  return async (ctx: RequestContext): Promise<MiddlewareResponse> => {
    try {
      if (options.body && ctx.body !== undefined) {
        options.body.parse(ctx.body);
      }
      
      if (options.query && ctx.query !== undefined) {
        options.query.parse(ctx.query);
      }
      
      if (options.params && ctx.params !== undefined) {
        options.params.parse(ctx.params);
      }

      return { success: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: createValidationError({
            errors: error.errors.map((e) => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          }),
        };
      }
      
      return {
        success: false,
        error: createValidationError({ error: String(error) }),
      };
    }
  };
}

// ========== 速率限制（Token Bucket） ==========

export interface RateLimitConfig {
  capacity: number;      // 桶容量
  refillRate: number;    // 每秒填充速率
  keyPrefix?: string;
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

export class TokenBucketRateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = {
      keyPrefix: 'ratelimit:',
      ...config,
    };
  }

  /**
   * 检查并消耗令牌
   */
  async consume(key: string, tokens: number = 1): Promise<{
    allowed: boolean;
    remaining: number;
    retryAfter?: number;
  }> {
    const bucketKey = `${this.config.keyPrefix}${key}`;
    const now = Date.now();
    
    let bucket = this.buckets.get(bucketKey);
    
    if (!bucket) {
      bucket = {
        tokens: this.config.capacity,
        lastRefill: now,
      };
      this.buckets.set(bucketKey, bucket);
    }

    // 填充令牌
    const timePassed = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = timePassed * this.config.refillRate;
    bucket.tokens = Math.min(this.config.capacity, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    // 检查并消耗
    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
      };
    }

    // 计算重试时间
    const tokensNeeded = tokens - bucket.tokens;
    const retryAfter = Math.ceil(tokensNeeded / this.config.refillRate);

    return {
      allowed: false,
      remaining: 0,
      retryAfter,
    };
  }

  /**
   * 创建速率限制中间件
   */
  createMiddleware(getKey: (ctx: RequestContext) => string) {
    return async (ctx: RequestContext): Promise<MiddlewareResponse> => {
      const key = getKey(ctx);
      const result = await this.consume(key);

      if (!result.allowed) {
        return {
          success: false,
          error: createRateLimitError(result.retryAfter),
        };
      }

      return { success: true };
    };
  }
}

// ========== RBAC中间件 ==========

export function createRBACMiddleware(requiredPermission: Permission) {
  return async (ctx: RequestContext): Promise<MiddlewareResponse> => {
    if (!ctx.user) {
      return {
        success: false,
        error: createUnauthorizedError({ reason: 'User not authenticated' }),
      };
    }

    if (!hasPermission(ctx.user, requiredPermission)) {
      return {
        success: false,
        error: createForbiddenError({
          required: requiredPermission,
          userRole: ctx.user.role,
        }),
      };
    }

    return { success: true };
  };
}

// ========== 中间件组合 ==========

export type MiddlewareFn = (ctx: RequestContext) => Promise<MiddlewareResponse>;

export function composeMiddleware(...middlewares: MiddlewareFn[]) {
  return async (ctx: RequestContext): Promise<MiddlewareResponse> => {
    for (const middleware of middlewares) {
      const result = await middleware(ctx);
      if (!result.success) {
        return result;
      }
    }
    return { success: true };
  };
}

// ========== 导出 ==========

export { HajimiError };
export * from './errors';

// 默认导出：中间件组合函数
export { composeMiddleware as default };
