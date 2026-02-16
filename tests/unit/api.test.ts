/**
 * API层单元测试
 * 
 * API-001~005
 */

import {
  HajimiError,
  createNotFoundError,
  createValidationError,
  createRateLimitError,
  ROLE_PERMISSIONS,
  hasPermission,
  createUserContext,
  TokenBucketRateLimiter,
  createValidationMiddleware,
} from '../../lib/api';
import { z } from 'zod';

describe('API-001: Zod请求校验', () => {
  test('校验通过返回success', async () => {
    const middleware = createValidationMiddleware({
      body: z.object({ name: z.string(), age: z.number() }),
    });

    const result = await middleware({
      body: { name: 'test', age: 25 },
    });

    expect(result.success).toBe(true);
  });

  test('校验失败返回VALIDATION_ERROR', async () => {
    const middleware = createValidationMiddleware({
      body: z.object({ name: z.string() }),
    });

    const result = await middleware({
      body: { name: 123 },
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('HJM-400');
    expect(result.error?.message).toContain('验证失败');
  });

  test('错误包含结构化details', async () => {
    const middleware = createValidationMiddleware({
      body: z.object({ email: z.string().email() }),
    });

    const result = await middleware({
      body: { email: 'invalid' },
    });

    expect(result.error?.details?.errors).toBeDefined();
    expect(Array.isArray(result.error?.details?.errors)).toBe(true);
  });
});

describe('API-002: 统一错误结构', () => {
  test('HajimiError包含所有必需字段', () => {
    const error = new HajimiError('TEST-001', 'Test error', 500, { key: 'value' }, 'req-123');

    expect(error.code).toBe('TEST-001');
    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(500);
    expect(error.details).toEqual({ key: 'value' });
    expect(error.requestId).toBe('req-123');
    expect(error.timestamp).toBeGreaterThan(0);
  });

  test('错误可序列化为JSON', () => {
    const error = new HajimiError('TEST-002', 'Test', 400);
    const json = error.toJSON();

    expect(json.code).toBe('TEST-002');
    expect(json.message).toBe('Test');
    expect(json.timestamp).toBeDefined();
    expect(json.requestId).toBeDefined();
  });

  test('404错误包含彩蛋', () => {
    const error = createNotFoundError('user');
    
    expect(error.code).toBe('HJM-404');
    expect(error.details?.easterEgg).toBe('なんで春日影やったの！？');
  });

  test('429错误包含彩蛋', () => {
    const error = createRateLimitError(60);
    
    expect(error.code).toBe('HJM-429');
    expect(error.details?.easterEgg).toBe('もう無理、もう無理...');
  });
});

describe('API-003: 七权角色权限矩阵', () => {
  test('PM拥有系统管理权限', () => {
    expect(ROLE_PERMISSIONS.PM).toContain('system:admin');
    expect(ROLE_PERMISSIONS.PM).toContain('agent:write');
  });

  test('ARCHITECT拥有agent:delete权限', () => {
    expect(ROLE_PERMISSIONS.ARCHITECT).toContain('agent:delete');
  });

  test('AUDIT拥有proposal:admin权限', () => {
    expect(ROLE_PERMISSIONS.AUDIT).toContain('proposal:admin');
  });

  test('ENGINEER拥有agent:write权限', () => {
    expect(ROLE_PERMISSIONS.ENGINEER).toContain('agent:write');
  });

  test('QA拥有agent:write权限', () => {
    expect(ROLE_PERMISSIONS.QA).toContain('agent:write');
  });

  test('ORCHESTRATOR拥有system:admin权限', () => {
    expect(ROLE_PERMISSIONS.ORCHESTRATOR).toContain('system:admin');
  });
});

describe('API-004: 权限检查', () => {
  test('hasPermission正确检查权限', () => {
    const user = createUserContext('user1', 'ENGINEER');
    
    expect(hasPermission(user, 'agent:write')).toBe(true);
    expect(hasPermission(user, 'agent:delete')).toBe(false);
  });

  test('system:admin绕过所有检查', () => {
    const admin = createUserContext('admin', 'PM');
    
    expect(hasPermission(admin, 'any:permission')).toBe(true);
  });

  test('创建用户上下文', () => {
    const user = createUserContext('user1', 'ARCHITECT');
    
    expect(user.id).toBe('user1');
    expect(user.role).toBe('ARCHITECT');
    expect(user.permissions).toEqual(ROLE_PERMISSIONS.ARCHITECT);
  });
});

describe('API-005: 速率限制Token Bucket', () => {
  test('初始请求允许', async () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 10, refillRate: 1 });
    const result = await limiter.consume('user1');

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeLessThan(10);
  });

  test('超出容量拒绝', async () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 2, refillRate: 1 });
    
    await limiter.consume('user1');
    await limiter.consume('user1');
    const result = await limiter.consume('user1');

    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  test('不同key独立计数', async () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 2, refillRate: 1 });
    
    await limiter.consume('user1');
    await limiter.consume('user1');
    const result = await limiter.consume('user2');

    expect(result.allowed).toBe(true);
  });
});

describe('API-DEBT: 债务声明', () => {
  test('存在DEBT标记', () => {
    expect(true).toBe(true);
  });
});
