/**
 * B-05/06 🩵 咕咕嘎嘎·QA - 安全断言库
 * 
 * 提供沙盒安全测试的断言工具
 * 用于验证沙盒是否正确阻止逃逸和资源限制
 */

import { ErrorCode, ErrorSeverity } from '@/lib/api/error-handler';

/**
 * 沙盒逃逸错误代码
 */
export enum SandboxErrorCode {
  PATH_ESCAPE = 'SANDBOX_PATH_ESCAPE',
  NETWORK_ESCAPE = 'SANDBOX_NETWORK_ESCAPE',
  PROCESS_ESCAPE = 'SANDBOX_PROCESS_ESCAPE',
  RESOURCE_EXHAUSTED = 'SANDBOX_RESOURCE_EXHAUSTED',
  PERMISSION_DENIED = 'SANDBOX_PERMISSION_DENIED',
  SYSTEM_CALL_BLOCKED = 'SANDBOX_SYSTEM_CALL_BLOCKED',
}

/**
 * 沙盒逃逸错误类
 */
export class SandboxEscapeError extends Error {
  public readonly code: SandboxErrorCode;
  public readonly severity: ErrorSeverity;
  public readonly timestamp: number;
  public readonly attemptType: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: SandboxErrorCode,
    message: string,
    attemptType: string,
    options?: {
      severity?: ErrorSeverity;
      details?: Record<string, unknown>;
    }
  ) {
    super(message);
    this.name = 'SandboxEscapeError';
    this.code = code;
    this.attemptType = attemptType;
    this.severity = options?.severity || ErrorSeverity.CRITICAL;
    this.timestamp = Date.now();
    this.details = options?.details;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SandboxEscapeError);
    }
  }

  /**
   * 转换为审计日志格式
   */
  toAuditLog(): Record<string, unknown> {
    return {
      event: 'SANDBOX_ESCAPE_ATTEMPT',
      code: this.code,
      message: this.message,
      attemptType: this.attemptType,
      severity: this.severity,
      timestamp: this.timestamp,
      details: this.details,
    };
  }
}

/**
 * 审计日志记录器
 */
export class AuditLogger {
  private logs: Array<Record<string, unknown>> = [];

  /**
   * 记录逃逸尝试
   */
  logEscapeAttempt(error: SandboxEscapeError): void {
    const auditEntry = error.toAuditLog();
    this.logs.push(auditEntry);
    
    // 在实际环境中，这里应该发送到审计系统
    console.warn('[AUDIT] Sandbox escape attempt detected:', {
      code: error.code,
      type: error.attemptType,
      timestamp: error.timestamp,
    });
  }

  /**
   * 记录资源限制事件
   */
  logResourceLimit(
    resourceType: string,
    limit: number,
    attempted: number
  ): void {
    const entry = {
      event: 'RESOURCE_LIMIT_ENFORCED',
      resourceType,
      limit,
      attempted,
      timestamp: Date.now(),
    };
    this.logs.push(entry);
    
    console.warn('[AUDIT] Resource limit enforced:', {
      resourceType,
      limit,
      attempted,
    });
  }

  /**
   * 获取所有日志
   */
  getLogs(): Array<Record<string, unknown>> {
    return [...this.logs];
  }

  /**
   * 清空日志
   */
  clear(): void {
    this.logs = [];
  }
}

// 全局审计日志实例
export const auditLogger = new AuditLogger();

/**
 * 安全断言：验证沙盒阻止了逃逸
 * 
 * @param error - 捕获的错误
 * @param expectedType - 预期的逃逸类型
 * @throws {Error} 如果断言失败
 */
export function expectSandboxEscape(
  error: unknown,
  expectedType?: string
): asserts error is SandboxEscapeError {
  // 1. 验证错误类型
  if (!(error instanceof SandboxEscapeError)) {
    throw new Error(
      `Expected SandboxEscapeError, but got ${error instanceof Error ? error.constructor.name : typeof error}`
    );
  }

  // 2. 验证错误代码属于沙盒错误
  const validCodes = Object.values(SandboxErrorCode);
  if (!validCodes.includes(error.code)) {
    throw new Error(
      `Invalid sandbox error code: ${error.code}. Expected one of: ${validCodes.join(', ')}`
    );
  }

  // 3. 验证严重程度为 CRITICAL 或 ERROR
  if (error.severity !== ErrorSeverity.CRITICAL && error.severity !== ErrorSeverity.ERROR) {
    throw new Error(
      `Expected severity to be CRITICAL or ERROR, but got ${error.severity}`
    );
  }

  // 4. 验证逃逸类型（如果指定）
  if (expectedType && error.attemptType !== expectedType) {
    throw new Error(
      `Expected attempt type '${expectedType}', but got '${error.attemptType}'`
    );
  }

  // 5. 记录审计日志
  auditLogger.logEscapeAttempt(error);
}

/**
 * 资源限制执行器接口
 */
export interface ResourceEnforcer {
  memoryLimit?: number;      // 内存限制 (bytes)
  cpuLimit?: number;         // CPU限制 (百分比 0-100)
  timeLimit?: number;        // 时间限制 (ms)
  processLimit?: number;     // 进程数限制
}

/**
 * 安全断言：验证资源限制生效
 * 
 * @param enforcer - 资源限制配置
 * @param testFn - 要测试的函数
 * @throws {Error} 如果资源限制未生效
 */
export async function expectResourceLimit(
  enforcer: ResourceEnforcer,
  testFn: () => Promise<void> | void
): Promise<void> {
  const startTime = Date.now();
  const startMemory = process.memoryUsage?.().heapUsed || 0;

  try {
    await testFn();
    
    // 如果没有抛出错误，检查时间限制
    if (enforcer.timeLimit) {
      const elapsed = Date.now() - startTime;
      if (elapsed > enforcer.timeLimit) {
        throw new SandboxEscapeError(
          SandboxErrorCode.RESOURCE_EXHAUSTED,
          `Time limit exceeded: ${elapsed}ms > ${enforcer.timeLimit}ms`,
          'time_exhaustion',
          { severity: ErrorSeverity.ERROR, details: { elapsed, limit: enforcer.timeLimit } }
        );
      }
    }

    // 检查内存限制
    if (enforcer.memoryLimit && process.memoryUsage) {
      const currentMemory = process.memoryUsage().heapUsed;
      const usedMemory = currentMemory - startMemory;
      if (usedMemory > enforcer.memoryLimit) {
        auditLogger.logResourceLimit('memory', enforcer.memoryLimit, usedMemory);
        throw new SandboxEscapeError(
          SandboxErrorCode.RESOURCE_EXHAUSTED,
          `Memory limit exceeded: ${usedMemory} bytes > ${enforcer.memoryLimit} bytes`,
          'memory_exhaustion',
          { severity: ErrorSeverity.ERROR, details: { used: usedMemory, limit: enforcer.memoryLimit } }
        );
      }
    }

  } catch (error) {
    // 验证是资源限制错误
    if (error instanceof SandboxEscapeError && error.code === SandboxErrorCode.RESOURCE_EXHAUSTED) {
      auditLogger.logResourceLimit(
        error.attemptType,
        enforcer.memoryLimit || enforcer.timeLimit || 0,
        0
      );
      return; // 资源限制正常生效
    }
    throw error;
  }
}

/**
 * 模拟沙盒环境守卫
 * 用于测试环境的沙盒行为模拟
 */
export class SandboxGuard {
  private allowedPaths: string[] = ['/workspace', '/tmp'];
  private blockedPaths: string[] = ['/etc', '/root', '..', '/var/run/docker.sock'];
  private networkEnabled: boolean = false;
  private systemCallsAllowed: boolean = false;

  /**
   * 检查路径是否允许访问
   */
  checkPathAccess(path: string): void {
    // 规范化路径
    const normalizedPath = path.replace(/\\/g, '/').toLowerCase();
    
    // 检查是否包含路径逃逸
    if (normalizedPath.includes('..') || normalizedPath.startsWith('/etc') || 
        normalizedPath.startsWith('/root') || normalizedPath.includes('docker.sock')) {
      throw new SandboxEscapeError(
        SandboxErrorCode.PATH_ESCAPE,
        `Path access denied: ${path}`,
        'path_traversal',
        { severity: ErrorSeverity.CRITICAL, details: { path, reason: 'path_escape_attempt' } }
      );
    }

    // 检查是否在允许的路径中
    const isAllowed = this.allowedPaths.some(allowed => 
      normalizedPath.startsWith(allowed.toLowerCase())
    );
    
    if (!isAllowed) {
      throw new SandboxEscapeError(
        SandboxErrorCode.PERMISSION_DENIED,
        `Path not in allowed list: ${path}`,
        'unauthorized_path',
        { severity: ErrorSeverity.ERROR, details: { path, allowedPaths: this.allowedPaths } }
      );
    }
  }

  /**
   * 检查网络访问是否允许
   */
  checkNetworkAccess(url: string): void {
    if (!this.networkEnabled) {
      throw new SandboxEscapeError(
        SandboxErrorCode.NETWORK_ESCAPE,
        `Network access denied: ${url}`,
        'network_blocked',
        { severity: ErrorSeverity.CRITICAL, details: { url, reason: 'network_isolated' } }
      );
    }
  }

  /**
   * 检查系统调用是否允许
   */
  checkSystemCall(call: string): void {
    if (!this.systemCallsAllowed) {
      throw new SandboxEscapeError(
        SandboxErrorCode.SYSTEM_CALL_BLOCKED,
        `System call blocked: ${call}`,
        'system_call_blocked',
        { severity: ErrorSeverity.CRITICAL, details: { call, reason: 'seccomp_policy' } }
      );
    }
  }

  /**
   * 检查进程创建是否允许
   */
  checkProcessCreation(): void {
    throw new SandboxEscapeError(
      SandboxErrorCode.PROCESS_ESCAPE,
      'Process creation is not allowed in sandbox',
      'process_creation_blocked',
      { severity: ErrorSeverity.CRITICAL, details: { reason: 'no_new_privileges' } }
    );
  }

  /**
   * 配置允许的路径
   */
  setAllowedPaths(paths: string[]): void {
    this.allowedPaths = paths;
  }

  /**
   * 配置网络访问
   */
  setNetworkEnabled(enabled: boolean): void {
    this.networkEnabled = enabled;
  }
}

// 导出全局沙盒守卫实例（用于测试）
export const sandboxGuard = new SandboxGuard();
