/**
 * B-09 测试体系 - 权限验证单元测试
 * 
 * 测试项:
 * API-001~005: API权限验证核心功能
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  extractToken,
  verifyToken,
  generateToken,
  buildAuthContext,
  hasPermission,
  hasMinLevel,
  withAuth,
  withOptionalAuth,
  requireRole,
  requirePermission,
  requireMinLevel,
  AgentRole,
  AuthContext,
  permissionMap,
  ROLE_HIERARCHY,
} from '@/lib/api/auth';
import {
  APIError,
  ErrorCode,
  ErrorSeverity,
  handleAPIError,
  createSuccessResponse,
} from '@/lib/api/error-handler';
import { ZodError, z } from 'zod';

describe('API Auth', () => {
  // ============================================================================
  // API-001: 统一错误格式
  // ============================================================================
  describe('API-001: 统一错误格式', () => {
    it('should create APIError with correct structure', () => {
      const error = new APIError(
        ErrorCode.VALIDATION_ERROR,
        'Validation failed',
        400,
        { severity: ErrorSeverity.WARNING }
      );

      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.message).toBe('Validation failed');
      expect(error.statusCode).toBe(400);
      expect(error.severity).toBe(ErrorSeverity.WARNING);
      expect(error.timestamp).toBeDefined();
      expect(error.requestId).toBeDefined();
    });

    it('should convert APIError to JSON correctly', () => {
      const error = new APIError(
        ErrorCode.NOT_FOUND,
        'Resource not found',
        404
      );

      const json = error.toJSON();

      expect(json.success).toBe(false);
      expect(json.error.code).toBe(ErrorCode.NOT_FOUND);
      expect(json.error.message).toBe('Resource not found');
      expect(json.error.status).toBe(404);
      expect(json.error.timestamp).toBeDefined();
      expect(json.error.requestId).toBeDefined();
    });

    it('should handle Zod validation errors', () => {
      const schema = z.object({
        name: z.string().min(3),
        age: z.number().positive(),
      });

      try {
        schema.parse({ name: 'ab', age: -1 });
      } catch (error) {
        if (error instanceof ZodError) {
          const response = handleAPIError(error);
          // 解析 JSON 响应体
          const body = JSON.parse(
            Buffer.from(response.body as unknown as ArrayBuffer).toString()
          );

          expect(response.status).toBe(400);
          expect(body.success).toBe(false);
          expect(body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
          expect(body.error.details.issues).toBeDefined();
        }
      }
    });

    it('should create success response with correct structure', () => {
      const response = createSuccessResponse({ id: 1, name: 'Test' });

      expect(response.success).toBe(true);
      expect(response.data).toEqual({ id: 1, name: 'Test' });
      expect(response.meta).toBeDefined();
      expect(response.meta!.timestamp).toBeDefined();
      expect(response.meta!.requestId).toBeDefined();
    });

    it('should handle standard Error instances', () => {
      const error = new Error('Standard error');
      const response = handleAPIError(error);

      expect(response.status).toBe(500);
    });

    it('should handle unknown errors', () => {
      const response = handleAPIError('unknown error string');

      expect(response.status).toBe(500);
    });
  });

  // ============================================================================
  // API-002: Token认证
  // ============================================================================
  describe('API-002: Token认证', () => {
    it('should extract token from Authorization header', () => {
      const request = new NextRequest('http://localhost/api/test', {
        headers: {
          authorization: 'Bearer agent123:pm:1704067200000',
        },
      });

      const token = extractToken(request);
      expect(token).toBe('agent123:pm:1704067200000');
    });

    it('should extract token from query parameter', () => {
      const request = new NextRequest(
        'http://localhost/api/test?token=agent123:pm:1704067200000'
      );

      const token = extractToken(request);
      expect(token).toBe('agent123:pm:1704067200000');
    });

    it('should extract token from cookie', () => {
      const request = new NextRequest('http://localhost/api/test', {
        headers: {
          cookie: 'auth_token=agent123:pm:1704067200000; other=value',
        },
      });

      const token = extractToken(request);
      expect(token).toBe('agent123:pm:1704067200000');
    });

    it('should return null when no token is present', () => {
      const request = new NextRequest('http://localhost/api/test');

      const token = extractToken(request);
      expect(token).toBeNull();
    });

    it('should generate valid token', () => {
      const token = generateToken('agent123', 'pm');
      const parts = token.split(':');

      expect(parts.length).toBe(3);
      expect(parts[0]).toBe('agent123');
      expect(parts[1]).toBe('pm');
      expect(parseInt(parts[2])).toBeGreaterThan(0);
    });

    it('should throw error for empty agent ID', () => {
      expect(() => generateToken('', 'pm')).toThrow(APIError);
    });

    it('should throw error for invalid role', () => {
      expect(() => generateToken('agent123', 'invalid' as AgentRole)).toThrow(
        APIError
      );
    });

    it('should verify valid token', () => {
      const token = generateToken('agent123', 'pm');
      const payload = verifyToken(token);

      expect(payload).not.toBeNull();
      expect(payload!.agentId).toBe('agent123');
      expect(payload!.role).toBe('pm');
      expect(payload!.timestamp).toBeGreaterThan(0);
    });

    it('should reject invalid token format', () => {
      const payload = verifyToken('invalid-token');
      expect(payload).toBeNull();
    });

    it('should reject token with invalid role', () => {
      const payload = verifyToken('agent123:invalid:1704067200000');
      expect(payload).toBeNull();
    });

    it('should reject token with invalid timestamp', () => {
      const payload = verifyToken('agent123:pm:invalid');
      expect(payload).toBeNull();
    });

    it('should reject expired token', () => {
      // 创建一个超过24小时的token
      const expiredTime = Date.now() - 25 * 60 * 60 * 1000;
      const token = `agent123:pm:${expiredTime}`;
      const payload = verifyToken(token);

      expect(payload).toBeNull();
    });

    it('should accept token within 24 hours', () => {
      // 创建一个23小时前的token
      const validTime = Date.now() - 23 * 60 * 60 * 1000;
      const token = `agent123:pm:${validTime}`;
      const payload = verifyToken(token);

      expect(payload).not.toBeNull();
      expect(payload!.agentId).toBe('agent123');
    });
  });

  // ============================================================================
  // API-003: 角色权限拦截
  // ============================================================================
  describe('API-003: 角色权限拦截', () => {
    it('should build correct auth context for PM', () => {
      const payload = {
        agentId: 'agent123',
        role: 'pm' as AgentRole,
        timestamp: Date.now(),
      };

      const auth = buildAuthContext(payload);

      expect(auth.agentId).toBe('agent123');
      expect(auth.role).toBe('pm');
      expect(auth.permissions).toEqual(permissionMap.pm);
      expect(auth.level).toBe(ROLE_HIERARCHY.pm);
    });

    it('should check permission correctly', () => {
      const auth: AuthContext = {
        agentId: 'agent123',
        role: 'pm',
        permissions: permissionMap.pm,
        level: ROLE_HIERARCHY.pm,
      };

      expect(hasPermission(auth, 'proposal:create')).toBe(true);
      expect(hasPermission(auth, 'vote:submit')).toBe(true);
      expect(hasPermission(auth, 'nonexistent:permission')).toBe(false);
    });

    it('should check role level correctly', () => {
      const pmAuth: AuthContext = {
        agentId: 'agent1',
        role: 'pm',
        permissions: permissionMap.pm,
        level: ROLE_HIERARCHY.pm,
      };
      const engineerAuth: AuthContext = {
        agentId: 'agent2',
        role: 'engineer',
        permissions: permissionMap.engineer,
        level: ROLE_HIERARCHY.engineer,
      };

      expect(hasMinLevel(pmAuth, 80)).toBe(true);
      expect(hasMinLevel(pmAuth, 100)).toBe(true);
      expect(hasMinLevel(engineerAuth, 80)).toBe(false);
      expect(hasMinLevel(engineerAuth, 40)).toBe(true);
    });

    it('should have correct role hierarchy', () => {
      expect(ROLE_HIERARCHY.pm).toBe(100);
      expect(ROLE_HIERARCHY.arch).toBe(80);
      expect(ROLE_HIERARCHY.qa).toBe(60);
      expect(ROLE_HIERARCHY.engineer).toBe(40);
      expect(ROLE_HIERARCHY.mike).toBe(20);
      expect(ROLE_HIERARCHY.system).toBe(0);
    });

    it('should have correct permission mappings', () => {
      expect(permissionMap.pm).toContain('proposal:create');
      expect(permissionMap.pm).toContain('state:transition');
      expect(permissionMap.arch).toContain('state:transition');
      expect(permissionMap.arch).not.toContain('proposal:create');
      expect(permissionMap.engineer).not.toContain('proposal:create');
      expect(permissionMap.engineer).not.toContain('state:transition');
      expect(permissionMap.system).toContain('state:transition');
      expect(permissionMap.system).not.toContain('vote:submit');
    });

    it('should create requireRole config', () => {
      const config = requireRole(['pm', 'arch']);
      expect(config.allowedRoles).toEqual(['pm', 'arch']);
    });

    it('should create requirePermission config', () => {
      const config = requirePermission(['proposal:create', 'vote:submit']);
      expect(config.permissions).toEqual(['proposal:create', 'vote:submit']);
    });

    it('should create requireMinLevel config', () => {
      const config = requireMinLevel(80);
      expect(config.minLevel).toBe(80);
    });
  });

  // ============================================================================
  // API-004: Zod请求验证
  // ============================================================================
  describe('API-004: Zod请求验证', () => {
    it('should validate simple schema', () => {
      const schema = z.object({
        name: z.string().min(1),
        age: z.number().int().positive(),
      });

      const valid = { name: 'John', age: 30 };
      const result = schema.safeParse(valid);

      expect(result.success).toBe(true);
    });

    it('should reject invalid data', () => {
      const schema = z.object({
        name: z.string().min(3),
        age: z.number().positive(),
      });

      const invalid = { name: 'Jo', age: -5 };
      const result = schema.safeParse(invalid);

      expect(result.success).toBe(false);
    });

    it('should provide detailed validation errors', () => {
      const schema = z.object({
        email: z.string().email(),
        password: z.string().min(8),
      });

      try {
        schema.parse({ email: 'invalid', password: 'short' });
      } catch (error) {
        if (error instanceof ZodError) {
          expect(error.issues.length).toBeGreaterThan(0);
          expect(error.issues[0]).toHaveProperty('path');
          expect(error.issues[0]).toHaveProperty('message');
          expect(error.issues[0]).toHaveProperty('code');
        }
      }
    });

    it('should validate agent role enum', () => {
      const roleSchema = z.enum(['pm', 'arch', 'qa', 'engineer', 'mike', 'system']);

      expect(roleSchema.safeParse('pm').success).toBe(true);
      expect(roleSchema.safeParse('invalid').success).toBe(false);
    });

    it('should validate complex nested objects', () => {
      const schema = z.object({
        user: z.object({
          id: z.string().uuid(),
          role: z.enum(['pm', 'arch', 'qa']),
        }),
        metadata: z.record(z.unknown()).optional(),
      });

      const valid = {
        user: { id: '550e8400-e29b-41d4-a716-446655440000', role: 'pm' },
        metadata: { key: 'value' },
      };

      expect(schema.safeParse(valid).success).toBe(true);
    });
  });

  // ============================================================================
  // API-005: 错误代码分类
  // ============================================================================
  describe('API-005: 错误代码分类', () => {
    it('should have correct common error codes', () => {
      expect(ErrorCode.UNKNOWN_ERROR).toBe('COMMON_UNKNOWN');
      expect(ErrorCode.INTERNAL_ERROR).toBe('COMMON_INTERNAL');
      expect(ErrorCode.NOT_FOUND).toBe('COMMON_NOT_FOUND');
      expect(ErrorCode.VALIDATION_ERROR).toBe('COMMON_VALIDATION');
      expect(ErrorCode.UNAUTHORIZED).toBe('COMMON_UNAUTHORIZED');
      expect(ErrorCode.FORBIDDEN).toBe('COMMON_FORBIDDEN');
    });

    it('should have correct A2A error codes', () => {
      expect(ErrorCode.A2A_SEND_FAILED).toBe('A2A_SEND_FAILED');
      expect(ErrorCode.A2A_INVALID_MESSAGE).toBe('A2A_INVALID_MESSAGE');
      expect(ErrorCode.A2A_AGENT_NOT_FOUND).toBe('A2A_AGENT_NOT_FOUND');
      expect(ErrorCode.A2A_RATE_LIMITED).toBe('A2A_RATE_LIMITED');
    });

    it('should have correct state machine error codes', () => {
      expect(ErrorCode.STATE_INVALID_TRANSITION).toBe('STATE_INVALID_TRANSITION');
      expect(ErrorCode.STATE_MACHINE_ERROR).toBe('STATE_MACHINE_ERROR');
    });

    it('should have correct governance error codes', () => {
      expect(ErrorCode.GOV_PROPOSAL_NOT_FOUND).toBe('GOV_PROPOSAL_NOT_FOUND');
      expect(ErrorCode.GOV_UNAUTHORIZED_CREATE).toBe('GOV_UNAUTHORIZED_CREATE');
      expect(ErrorCode.GOV_VOTE_FAILED).toBe('GOV_VOTE_FAILED');
      expect(ErrorCode.GOV_PROPOSAL_EXPIRED).toBe('GOV_PROPOSAL_EXPIRED');
    });

    it('should have correct storage error codes', () => {
      expect(ErrorCode.STORAGE_READ_ERROR).toBe('STORAGE_READ_ERROR');
      expect(ErrorCode.STORAGE_WRITE_ERROR).toBe('STORAGE_WRITE_ERROR');
      expect(ErrorCode.STORAGE_NOT_INITIALIZED).toBe('STORAGE_NOT_INITIALIZED');
    });

    it('should have correct error severity levels', () => {
      expect(ErrorSeverity.INFO).toBe('info');
      expect(ErrorSeverity.WARNING).toBe('warning');
      expect(ErrorSeverity.ERROR).toBe('error');
      expect(ErrorSeverity.CRITICAL).toBe('critical');
    });

    it('should create not found error', () => {
      const error = APIError.notFound('User');
      expect(error.code).toBe(ErrorCode.NOT_FOUND);
      expect(error.statusCode).toBe(404);
      expect(error.severity).toBe(ErrorSeverity.WARNING);
    });

    it('should create unauthorized error', () => {
      const error = APIError.unauthorized('Invalid token');
      expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(error.statusCode).toBe(401);
      expect(error.severity).toBe(ErrorSeverity.WARNING);
    });

    it('should create forbidden error', () => {
      const error = APIError.forbidden('Insufficient permissions');
      expect(error.code).toBe(ErrorCode.FORBIDDEN);
      expect(error.statusCode).toBe(403);
      expect(error.severity).toBe(ErrorSeverity.WARNING);
    });

    it('should create validation error', () => {
      const error = APIError.validation('Invalid input');
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.statusCode).toBe(400);
      expect(error.severity).toBe(ErrorSeverity.WARNING);
    });

    it('should create internal error', () => {
      const cause = new Error('Database error');
      const error = APIError.internal('Server error', cause);
      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.statusCode).toBe(500);
      expect(error.severity).toBe(ErrorSeverity.CRITICAL);
      expect(error.cause).toBe(cause);
    });
  });

  // ============================================================================
  // 额外测试：withAuth 中间件
  // ============================================================================
  describe('withAuth Middleware', () => {
    it('should reject request without token', async () => {
      const handler = withAuth(async () => {
        return new NextResponse('OK');
      });

      const request = new NextRequest('http://localhost/api/test');
      const response = await handler(request);

      expect(response.status).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      const handler = withAuth(async () => {
        return new NextResponse('OK');
      });

      const request = new NextRequest('http://localhost/api/test', {
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });
      const response = await handler(request);

      expect(response.status).toBe(401);
    });

    it('should reject request with disallowed role', async () => {
      const token = generateToken('agent123', 'engineer');
      const handler = withAuth(
        async () => new NextResponse('OK'),
        { allowedRoles: ['pm', 'arch'] }
      );

      const request = new NextRequest('http://localhost/api/test', {
        headers: { authorization: `Bearer ${token}` },
      });
      const response = await handler(request);

      expect(response.status).toBe(403);
    });

    it('should reject request with insufficient permissions', async () => {
      const token = generateToken('agent123', 'engineer');
      const handler = withAuth(
        async () => new NextResponse('OK'),
        { permissions: ['proposal:create'] }
      );

      const request = new NextRequest('http://localhost/api/test', {
        headers: { authorization: `Bearer ${token}` },
      });
      const response = await handler(request);

      expect(response.status).toBe(403);
    });

    it('should reject request with insufficient level', async () => {
      const token = generateToken('agent123', 'engineer');
      const handler = withAuth(
        async () => new NextResponse('OK'),
        { minLevel: 80 }
      );

      const request = new NextRequest('http://localhost/api/test', {
        headers: { authorization: `Bearer ${token}` },
      });
      const response = await handler(request);

      expect(response.status).toBe(403);
    });

    it('should allow request with valid token and permissions', async () => {
      const token = generateToken('agent123', 'pm');
      const handler = withAuth(
        async () => new NextResponse('OK'),
        { permissions: ['proposal:create'] }
      );

      const request = new NextRequest('http://localhost/api/test', {
        headers: { authorization: `Bearer ${token}` },
      });
      const response = await handler(request);

      expect(response.status).toBe(200);
    });
  });

  // ============================================================================
  // 额外测试：withOptionalAuth 中间件
  // ============================================================================
  describe('withOptionalAuth Middleware', () => {
    it('should allow request without token', async () => {
      const handler = withOptionalAuth(async (_req, auth) => {
        expect(auth).toBeNull();
        return new NextResponse('OK');
      });

      const request = new NextRequest('http://localhost/api/test');
      const response = await handler(request);

      expect(response.status).toBe(200);
    });

    it('should provide auth context when token is valid', async () => {
      const token = generateToken('agent123', 'pm');
      const handler = withOptionalAuth(async (_req, auth) => {
        expect(auth).not.toBeNull();
        expect(auth!.role).toBe('pm');
        return new NextResponse('OK');
      });

      const request = new NextRequest('http://localhost/api/test', {
        headers: { authorization: `Bearer ${token}` },
      });
      const response = await handler(request);

      expect(response.status).toBe(200);
    });

    it('should handle invalid token gracefully', async () => {
      const handler = withOptionalAuth(async (_req, auth) => {
        expect(auth).toBeNull();
        return new NextResponse('OK');
      });

      const request = new NextRequest('http://localhost/api/test', {
        headers: { authorization: 'Bearer invalid-token' },
      });
      const response = await handler(request);

      expect(response.status).toBe(200);
    });
  });
});
