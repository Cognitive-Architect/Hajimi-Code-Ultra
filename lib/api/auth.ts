import { NextRequest, NextResponse } from 'next/server';
import { APIError, ErrorCode, ErrorSeverity, handleAPIError } from './error-handler';

/**
 * Agent角色类型
 */
export type AgentRole = 'pm' | 'arch' | 'qa' | 'engineer' | 'mike' | 'system';

/**
 * Token负载类型
 */
export interface TokenPayload {
  agentId: string;
  role: AgentRole;
  timestamp: number;
}

/**
 * 认证上下文
 */
export interface AuthContext {
  agentId: string;
  role: AgentRole;
  permissions: string[];
  level: number;
}

/**
 * 带认证的请求处理器
 */
export type AuthHandler = (
  request: NextRequest,
  auth: AuthContext
) => Promise<NextResponse> | NextResponse;

/**
 * 角色权限映射
 */
export const permissionMap: Record<AgentRole, string[]> = {
  pm: ['proposal:create', 'proposal:read', 'vote:submit', 'state:transition', 'a2a:send'],
  arch: ['proposal:read', 'vote:submit', 'state:transition', 'a2a:send'],
  qa: ['proposal:read', 'vote:submit', 'a2a:send'],
  engineer: ['proposal:read', 'vote:submit', 'a2a:send'],
  mike: ['proposal:read', 'vote:submit', 'a2a:send'],
  system: ['state:transition', 'a2a:send'],
};

/**
 * 角色层级
 */
export const ROLE_HIERARCHY: Record<AgentRole, number> = {
  pm: 100,
  arch: 80,
  qa: 60,
  engineer: 40,
  mike: 20,
  system: 0,
};

/**
 * Token有效期（毫秒）- 默认24小时
 */
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000;

/**
 * 从请求中提取Token
 * 支持: Authorization header (Bearer token), Query param (token), Cookie (auth_token)
 * 
 * @param request - Next.js请求对象
 * @returns 提取的token或null
 */
export function extractToken(request: NextRequest): string | null {
  // 1. 从Authorization header提取
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      return parts[1];
    }
  }

  // 2. 从Query param提取
  const url = new URL(request.url);
  const tokenFromQuery = url.searchParams.get('token');
  if (tokenFromQuery) {
    return tokenFromQuery;
  }

  // 3. 从Cookie提取
  const tokenFromCookie = request.cookies.get('auth_token')?.value;
  if (tokenFromCookie) {
    return tokenFromCookie;
  }

  return null;
}

/**
 * 验证Token有效性
 * Token格式: agentId:role:timestamp
 * 
 * @param token - Token字符串
 * @returns TokenPayload或null（验证失败）
 */
export function verifyToken(token: string): TokenPayload | null {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split(':');
  if (parts.length !== 3) {
    return null;
  }

  const [agentId, roleStr, timestampStr] = parts;

  // 验证agentId
  if (!agentId || agentId.trim() === '') {
    return null;
  }

  // 验证role
  const validRoles: AgentRole[] = ['pm', 'arch', 'qa', 'engineer', 'mike', 'system'];
  if (!validRoles.includes(roleStr as AgentRole)) {
    return null;
  }

  // 验证timestamp
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp) || timestamp <= 0) {
    return null;
  }

  // 检查token是否过期
  const now = Date.now();
  if (now - timestamp > TOKEN_EXPIRY) {
    return null;
  }

  return {
    agentId: agentId.trim(),
    role: roleStr as AgentRole,
    timestamp,
  };
}

/**
 * 生成认证Token
 * Token格式: agentId:role:timestamp
 * 
 * @param agentId - Agent ID
 * @param role - Agent角色
 * @returns 生成的token字符串
 */
export function generateToken(agentId: string, role: AgentRole): string {
  if (!agentId || agentId.trim() === '') {
    throw new APIError(
      ErrorCode.VALIDATION_ERROR,
      'Agent ID is required',
      400,
      { severity: ErrorSeverity.WARNING }
    );
  }

  const validRoles: AgentRole[] = ['pm', 'arch', 'qa', 'engineer', 'mike', 'system'];
  if (!validRoles.includes(role)) {
    throw new APIError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid role: ${role}`,
      400,
      { severity: ErrorSeverity.WARNING }
    );
  }

  const timestamp = Date.now();
  return `${agentId.trim()}:${role}:${timestamp}`;
}

/**
 * 构建认证上下文
 * 
 * @param payload - Token负载
 * @returns AuthContext
 */
export function buildAuthContext(payload: TokenPayload): AuthContext {
  return {
    agentId: payload.agentId,
    role: payload.role,
    permissions: permissionMap[payload.role] || [],
    level: ROLE_HIERARCHY[payload.role] || 0,
  };
}

/**
 * 检查权限
 * 
 * @param auth - 认证上下文
 * @param permission - 需要的权限
 * @returns 是否有权限
 */
export function hasPermission(auth: AuthContext, permission: string): boolean {
  return auth.permissions.includes(permission);
}

/**
 * 检查角色层级
 * 
 * @param auth - 认证上下文
 * @param minLevel - 最低角色层级
 * @returns 是否满足层级要求
 */
export function hasMinLevel(auth: AuthContext, minLevel: number): boolean {
  return auth.level >= minLevel;
}

/**
 * 认证中间件配置
 */
export interface AuthConfig {
  /** 需要的权限列表 */
  permissions?: string[];
  /** 最低角色层级 */
  minLevel?: number;
  /** 允许的角色列表 */
  allowedRoles?: AgentRole[];
  /** 自定义验证函数 */
  customCheck?: (auth: AuthContext) => boolean | { allowed: boolean; reason?: string };
}

/**
 * 认证中间件包装器
 * 为API路由处理器添加认证检查
 * 
 * @param handler - 需要认证的处理器函数
 * @param config - 认证配置
 * @returns 包装后的处理器
 * 
 * @example
 * ```typescript
 * export const GET = withAuth(async (request, auth) => {
 *   // 已认证的处理逻辑
 *   return NextResponse.json({ data: 'protected' });
 * }, { permissions: ['proposal:read'] });
 * ```
 */
export function withAuth(
  handler: AuthHandler,
  config: AuthConfig = {}
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      // 1. 提取token
      const token = extractToken(request);
      if (!token) {
        throw APIError.unauthorized('Authentication required: missing token');
      }

      // 2. 验证token
      const payload = verifyToken(token);
      if (!payload) {
        throw APIError.unauthorized('Authentication failed: invalid or expired token');
      }

      // 3. 构建认证上下文
      const auth = buildAuthContext(payload);

      // 4. 检查允许的角色
      if (config.allowedRoles && config.allowedRoles.length > 0) {
        if (!config.allowedRoles.includes(auth.role)) {
          throw APIError.forbidden(
            `Role '${auth.role}' is not allowed for this operation`,
            { requiredRoles: config.allowedRoles }
          );
        }
      }

      // 5. 检查权限
      if (config.permissions && config.permissions.length > 0) {
        const missingPermissions = config.permissions.filter(
          perm => !hasPermission(auth, perm)
        );
        if (missingPermissions.length > 0) {
          throw APIError.forbidden(
            'Insufficient permissions',
            { missingPermissions, currentRole: auth.role }
          );
        }
      }

      // 6. 检查角色层级
      if (config.minLevel !== undefined) {
        if (!hasMinLevel(auth, config.minLevel)) {
          throw APIError.forbidden(
            `Role level ${auth.level} is insufficient. Minimum required: ${config.minLevel}`,
            { currentLevel: auth.level, requiredLevel: config.minLevel }
          );
        }
      }

      // 7. 自定义检查
      if (config.customCheck) {
        const result = config.customCheck(auth);
        const checkResult = typeof result === 'boolean' ? { allowed: result } : result;
        if (!checkResult.allowed) {
          throw APIError.forbidden(
            checkResult.reason || 'Custom authorization check failed'
          );
        }
      }

      // 8. 调用处理器
      return await handler(request, auth);
    } catch (error) {
      return handleAPIError(error);
    }
  };
}

/**
 * 可选认证中间件
 * 允许请求在提供token时获得认证上下文，不提供时也能访问
 * 
 * @param handler - 处理器函数
 * @returns 包装后的处理器
 * 
 * @example
 * ```typescript
 * export const GET = withOptionalAuth(async (request, auth) => {
 *   if (auth) {
 *     // 用户已认证
 *     return NextResponse.json({ data: 'personalized' });
 *   }
 *   // 用户未认证
 *   return NextResponse.json({ data: 'public' });
 * });
 * ```
 */
export function withOptionalAuth(
  handler: (request: NextRequest, auth: AuthContext | null) => Promise<NextResponse> | NextResponse
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      // 尝试提取和验证token
      const token = extractToken(request);
      let auth: AuthContext | null = null;

      if (token) {
        const payload = verifyToken(token);
        if (payload) {
          auth = buildAuthContext(payload);
        }
      }

      // 调用处理器，auth可能为null
      return await handler(request, auth);
    } catch (error) {
      return handleAPIError(error);
    }
  };
}

/**
 * 角色权限检查装饰器
 * 创建一个检查指定角色的中间件
 * 
 * @param allowedRoles - 允许的角色列表
 * @returns AuthConfig配置对象
 * 
 * @example
 * ```typescript
 * export const POST = withAuth(
 *   async (request, auth) => {
 *     return NextResponse.json({ success: true });
 *   },
 *   requireRole(['pm', 'arch'])
 * );
 * ```
 */
export function requireRole(allowedRoles: AgentRole[]): AuthConfig {
  return { allowedRoles };
}

/**
 * 权限检查装饰器
 * 创建一个检查指定权限的中间件配置
 * 
 * @param permissions - 需要的权限列表
 * @returns AuthConfig配置对象
 * 
 * @example
 * ```typescript
 * export const POST = withAuth(
 *   async (request, auth) => {
 *     return NextResponse.json({ success: true });
 *   },
 *   requirePermission(['proposal:create'])
 * );
 * ```
 */
export function requirePermission(permissions: string[]): AuthConfig {
  return { permissions };
}

/**
 * 角色层级检查装饰器
 * 创建一个检查角色层级的中间件配置
 * 
 * @param minLevel - 最低角色层级
 * @returns AuthConfig配置对象
 * 
 * @example
 * ```typescript
 * export const POST = withAuth(
 *   async (request, auth) => {
 *     return NextResponse.json({ success: true });
 *   },
 *   requireMinLevel(80)
 * );
 * ```
 */
export function requireMinLevel(minLevel: number): AuthConfig {
  return { minLevel };
}
