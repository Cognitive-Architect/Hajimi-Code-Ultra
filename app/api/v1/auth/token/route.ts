import { NextRequest, NextResponse } from 'next/server';
import { generateToken, AgentRole, verifyToken, buildAuthContext } from '@/lib/api/auth';
import { APIError, createSuccessResponse, handleAPIError } from '@/lib/api/error-handler';
import { z } from 'zod';

/**
 * Token请求验证Schema
 */
const TokenRequestSchema = z.object({
  agentId: z.string().min(1).max(64),
  role: z.enum(['pm', 'arch', 'qa', 'engineer', 'mike', 'system']),
});

/**
 * Token验证请求Schema
 */
const TokenVerifySchema = z.object({
  token: z.string().min(1),
});

/**
 * Token响应类型
 */
interface TokenResponse {
  token: string;
  expiresAt: number;
  agentId: string;
  role: AgentRole;
}

/**
 * POST /api/v1/auth/token
 * 生成新的认证Token
 * 
 * @request
 * ```json
 * {
 *   "agentId": "agent1",
 *   "role": "pm"
 * }
 * ```
 * 
 * @response
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "token": "agent1:pm:1707830400000",
 *     "expiresAt": 1707916800000,
 *     "agentId": "agent1",
 *     "role": "pm"
 *   },
 *   "meta": {
 *     "timestamp": 1707830400000,
 *     "requestId": "req_..."
 *   }
 * }
 * ```
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. 解析请求体
    const body = await request.json();

    // 2. 验证请求数据
    const validatedData = TokenRequestSchema.safeParse(body);
    if (!validatedData.success) {
      throw APIError.validation(
        'Invalid request data',
        { issues: validatedData.error.issues }
      );
    }

    const { agentId, role } = validatedData.data;

    // 3. 生成Token
    const token = generateToken(agentId, role);

    // 4. 计算过期时间（24小时）
    const TOKEN_EXPIRY = 24 * 60 * 60 * 1000;
    const expiresAt = Date.now() + TOKEN_EXPIRY;

    // 5. 构建响应
    const response: TokenResponse = {
      token,
      expiresAt,
      agentId,
      role,
    };

    // 6. 设置响应Cookie（可选）
    const jsonResponse = NextResponse.json(createSuccessResponse(response));
    jsonResponse.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60, // 24小时（秒）
      path: '/',
    });

    return jsonResponse;
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * GET /api/v1/auth/token
 * 验证Token有效性
 * 
 * @query token - 要验证的Token（可选，优先从Cookie读取）
 * 
 * @response
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "valid": true,
 *     "agentId": "agent1",
 *     "role": "pm",
 *     "permissions": ["proposal:create", "proposal:read", ...],
 *     "level": 100,
 *     "timestamp": 1707830400000
 *   }
 * }
 * ```
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. 从Query参数或Cookie获取token
    const url = new URL(request.url);
    let token = url.searchParams.get('token');

    // 如果没有提供token，尝试从Cookie获取
    if (!token) {
      token = request.cookies.get('auth_token')?.value || null;
    }

    if (!token) {
      throw APIError.validation(
        'Token is required. Provide via query param "token" or Cookie "auth_token"'
      );
    }

    // 2. 验证token格式
    const TokenVerifyResult = TokenVerifySchema.safeParse({ token });
    if (!TokenVerifyResult.success) {
      throw APIError.validation(
        'Invalid token format',
        { issues: TokenVerifyResult.error.issues }
      );
    }

    // 3. 验证token
    const payload = verifyToken(token);

    if (!payload) {
      return NextResponse.json(createSuccessResponse({
        valid: false,
        reason: 'Invalid or expired token',
      }));
    }

    // 4. 构建认证上下文获取权限信息
    const auth = buildAuthContext(payload);

    // 5. 返回验证结果
    return NextResponse.json(createSuccessResponse({
      valid: true,
      agentId: payload.agentId,
      role: payload.role,
      permissions: auth.permissions,
      level: auth.level,
      timestamp: payload.timestamp,
    }));
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * DELETE /api/v1/auth/token
 * 注销Token（清除Cookie）
 * 
 * @response
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "message": "Token revoked successfully"
 *   }
 * }
 * ```
 */
export async function DELETE(): Promise<NextResponse> {
  try {
    const response = NextResponse.json(createSuccessResponse({
      message: 'Token revoked successfully',
    }));

    // 清除Cookie
    response.cookies.delete('auth_token');

    return response;
  } catch (error) {
    return handleAPIError(error);
  }
}
