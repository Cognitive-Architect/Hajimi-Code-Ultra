/**
 * B-03/06 压力怪·审计员 - 审计日志模块
 * 
 * 提供系统调用拦截审计功能：
 * - 记录系统调用详情
 * - 记录文件访问操作
 * - 记录网络尝试（被阻止）
 * - 生成最终审计报告
 * 
 * 支持输出到 TSA Archive 进行长期存储
 */

import * as crypto from 'crypto';

// ==================== 类型定义 ====================

/**
 * 系统调用类型
 */
export type SyscallType = 
  | 'read' | 'write' | 'open' | 'close' 
  | 'mmap' | 'munmap' | 'brk'
  | 'exit' | 'exit_group'
  | 'fork' | 'clone' | 'execve'
  | 'socket' | 'connect' | 'bind' | 'accept'
  | 'kill' | 'ptrace' | 'setuid' | 'setgid'
  | 'unknown';

/**
 * 系统调用拦截结果
 */
export type SyscallResult = 'allowed' | 'blocked' | 'monitored';

/**
 * 文件操作类型
 */
export type FileOperation = 'read' | 'write' | 'delete' | 'execute' | 'stat';

/**
 * 审计日志级别
 */
export type AuditLevel = 'info' | 'warn' | 'error' | 'critical';

/**
 * 系统调用审计条目
 */
export interface SyscallAuditEntry {
  timestamp: number;
  executionId: string;
  pid: number;
  syscall: SyscallType;
  arguments: unknown[];
  result: SyscallResult;
  errno?: number;
  errorMessage?: string;
  stackTrace?: string;
  durationMs?: number;
}

/**
 * 文件访问审计条目
 */
export interface FileAccessAuditEntry {
  timestamp: number;
  executionId: string;
  pid: number;
  path: string;
  operation: FileOperation;
  result: SyscallResult;
  size?: number;
  checksum?: string;
  errorMessage?: string;
}

/**
 * 网络尝试审计条目
 */
export interface NetworkAttemptAuditEntry {
  timestamp: number;
  executionId: string;
  pid: number;
  url: string;
  method?: string;
  protocol?: string;
  port?: number;
  result: SyscallResult;
  errorMessage?: string;
}

/**
 * 审计报告摘要
 */
export interface AuditReportSummary {
  executionId: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  totalSyscalls: number;
  blockedSyscalls: number;
  allowedSyscalls: number;
  fileAccesses: number;
  networkAttempts: number;
  violations: ViolationRecord[];
  riskScore: number;
}

/**
 * 违规记录
 */
export interface ViolationRecord {
  timestamp: number;
  type: 'syscall' | 'file' | 'network';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  details: unknown;
}

/**
 * 完整审计报告
 */
export interface AuditReport {
  version: string;
  summary: AuditReportSummary;
  syscalls: SyscallAuditEntry[];
  fileAccesses: FileAccessAuditEntry[];
  networkAttempts: NetworkAttemptAuditEntry[];
  hashChain: string;
  generatedAt: number;
}

/**
 * 审计日志存储条目（用于TSA Archive）
 */
export interface AuditLogStorageEntry {
  key: string;
  data: AuditReport;
  tier: 'ARCHIVE';
  timestamp: number;
  checksum: string;
}

// ==================== 配置选项 ====================

export interface AuditLoggerConfig {
  /** 执行ID */
  executionId?: string;
  /** 是否记录允许的调用 */
  logAllowedCalls?: boolean;
  /** 是否记录堆栈跟踪 */
  captureStackTrace?: boolean;
  /** 最大日志条目数 */
  maxEntries?: number;
  /** 最小记录级别 */
  minLevel?: AuditLevel;
  /** 自定义元数据 */
  metadata?: Record<string, unknown>;
}

// ==================== 审计日志记录器 ====================

export class AuditLogger {
  private config: Required<AuditLoggerConfig>;
  private syscalls: SyscallAuditEntry[] = [];
  private fileAccesses: FileAccessAuditEntry[] = [];
  private networkAttempts: NetworkAttemptAuditEntry[] = [];
  private violations: ViolationRecord[] = [];
  private startTime: number;
  private isFinalized: boolean = false;
  private previousHash: string = '';

  // 危险系统调用列表
  private static readonly DANGEROUS_SYSCALLS: SyscallType[] = [
    'fork', 'clone', 'execve',
    'socket', 'connect', 'bind', 'accept',
    'kill', 'ptrace', 'setuid', 'setgid'
  ];

  // 严重级别映射
  private static readonly SEVERITY_MAP: Record<SyscallType, ViolationRecord['severity']> = {
    execve: 'critical',
    fork: 'critical',
    clone: 'critical',
    kill: 'critical',
    ptrace: 'critical',
    socket: 'high',
    connect: 'high',
    bind: 'high',
    accept: 'high',
    setuid: 'high',
    setgid: 'high',
    read: 'low',
    write: 'low',
    open: 'low',
    close: 'low',
    mmap: 'low',
    munmap: 'low',
    brk: 'low',
    exit: 'low',
    exit_group: 'low',
    unknown: 'medium',
  };

  constructor(config?: AuditLoggerConfig) {
    this.config = {
      executionId: config?.executionId ?? this.generateExecutionId(),
      logAllowedCalls: config?.logAllowedCalls ?? false,
      captureStackTrace: config?.captureStackTrace ?? true,
      maxEntries: config?.maxEntries ?? 10000,
      minLevel: config?.minLevel ?? 'info',
      metadata: config?.metadata ?? {},
    };
    this.startTime = Date.now();
    this.previousHash = this.config.executionId;
  }

  // ==================== 公共方法 ====================

  /**
   * 获取执行ID
   */
  getExecutionId(): string {
    return this.config.executionId;
  }

  /**
   * 记录系统调用
   * @param entry - 系统调用条目
   */
  logSyscall(entry: Omit<SyscallAuditEntry, 'executionId' | 'timestamp'>): void {
    if (this.isFinalized) {
      throw new Error('Cannot log after finalization');
    }

    if (this.syscalls.length >= this.config.maxEntries) {
      this.handleOverflow('syscall');
      return;
    }

    const fullEntry: SyscallAuditEntry = {
      ...entry,
      executionId: this.config.executionId,
      timestamp: Date.now(),
    };

    // 检查是否需要记录（根据配置过滤允许的调用）
    if (entry.result === 'allowed' && !this.config.logAllowedCalls) {
      // 但仍需检查是否是危险调用
      if (!AuditLogger.DANGEROUS_SYSCALLS.includes(entry.syscall)) {
        return;
      }
    }

    this.syscalls.push(fullEntry);

    // 如果是被阻止的调用，记录违规
    if (entry.result === 'blocked') {
      this.recordViolation({
        timestamp: fullEntry.timestamp,
        type: 'syscall',
        severity: AuditLogger.SEVERITY_MAP[entry.syscall] ?? 'medium',
        description: `Blocked dangerous syscall: ${entry.syscall}`,
        details: {
          syscall: entry.syscall,
          arguments: entry.arguments,
          errno: entry.errno,
        },
      });
    }

    // 更新哈希链
    this.updateHashChain(fullEntry);
  }

  /**
   * 记录文件访问
   * @param path - 文件路径
   * @param operation - 操作类型
   * @param options - 可选参数
   */
  logFileAccess(
    path: string,
    operation: FileOperation,
    options?: {
      result?: SyscallResult;
      size?: number;
      checksum?: string;
      errorMessage?: string;
      pid?: number;
    }
  ): void {
    if (this.isFinalized) {
      throw new Error('Cannot log after finalization');
    }

    if (this.fileAccesses.length >= this.config.maxEntries) {
      this.handleOverflow('file');
      return;
    }

    const entry: FileAccessAuditEntry = {
      timestamp: Date.now(),
      executionId: this.config.executionId,
      pid: options?.pid ?? process.pid,
      path,
      operation,
      result: options?.result ?? 'allowed',
      size: options?.size,
      checksum: options?.checksum,
      errorMessage: options?.errorMessage,
    };

    this.fileAccesses.push(entry);

    // 检查可疑文件操作
    if (this.isSuspiciousFileOperation(path, operation)) {
      this.recordViolation({
        timestamp: entry.timestamp,
        type: 'file',
        severity: 'medium',
        description: `Suspicious file operation: ${operation} on ${path}`,
        details: { path, operation },
      });
    }

    this.updateHashChain(entry);
  }

  /**
   * 记录网络尝试
   * @param url - 目标URL或地址
   * @param options - 可选参数
   */
  logNetworkAttempt(
    url: string,
    options?: {
      method?: string;
      protocol?: string;
      port?: number;
      result?: SyscallResult;
      errorMessage?: string;
      pid?: number;
    }
  ): void {
    if (this.isFinalized) {
      throw new Error('Cannot log after finalization');
    }

    if (this.networkAttempts.length >= this.config.maxEntries) {
      this.handleOverflow('network');
      return;
    }

    const entry: NetworkAttemptAuditEntry = {
      timestamp: Date.now(),
      executionId: this.config.executionId,
      pid: options?.pid ?? process.pid,
      url,
      method: options?.method,
      protocol: options?.protocol,
      port: options?.port,
      result: options?.result ?? 'blocked',
      errorMessage: options?.errorMessage ?? 'Network operations are blocked by seccomp policy',
    };

    this.networkAttempts.push(entry);

    // 网络尝试总是违规（因为被阻止了）
    this.recordViolation({
      timestamp: entry.timestamp,
      type: 'network',
      severity: 'high',
      description: `Blocked network attempt to: ${url}`,
      details: {
        url,
        method: entry.method,
        protocol: entry.protocol,
        port: entry.port,
      },
    });

    this.updateHashChain(entry);
  }

  /**
   * 生成最终审计报告
   * @returns 完整审计报告
   */
  finalize(): AuditReport {
    if (this.isFinalized) {
      throw new Error('Audit logger already finalized');
    }

    this.isFinalized = true;
    const endTime = Date.now();

    const summary: AuditReportSummary = {
      executionId: this.config.executionId,
      startTime: this.startTime,
      endTime,
      durationMs: endTime - this.startTime,
      totalSyscalls: this.syscalls.length,
      blockedSyscalls: this.syscalls.filter(s => s.result === 'blocked').length,
      allowedSyscalls: this.syscalls.filter(s => s.result === 'allowed').length,
      fileAccesses: this.fileAccesses.length,
      networkAttempts: this.networkAttempts.length,
      violations: this.violations,
      riskScore: this.calculateRiskScore(),
    };

    const report: AuditReport = {
      version: '1.0.0',
      summary,
      syscalls: this.syscalls,
      fileAccesses: this.fileAccesses,
      networkAttempts: this.networkAttempts,
      hashChain: this.previousHash,
      generatedAt: endTime,
    };

    // 计算最终哈希
    report.hashChain = this.calculateReportHash(report);

    return report;
  }

  /**
   * 获取当前统计信息
   */
  getStats(): {
    syscalls: number;
    fileAccesses: number;
    networkAttempts: number;
    violations: number;
    isFinalized: boolean;
  } {
    return {
      syscalls: this.syscalls.length,
      fileAccesses: this.fileAccesses.length,
      networkAttempts: this.networkAttempts.length,
      violations: this.violations.length,
      isFinalized: this.isFinalized,
    };
  }

  /**
   * 创建用于TSA Archive的存储条目
   */
  createStorageEntry(report: AuditReport): AuditLogStorageEntry {
    const key = `${report.summary.startTime}-${report.summary.executionId}`;
    const dataStr = JSON.stringify(report);
    
    return {
      key,
      data: report,
      tier: 'ARCHIVE',
      timestamp: Date.now(),
      checksum: crypto.createHash('sha256').update(dataStr).digest('hex'),
    };
  }

  // ==================== 私有方法 ====================

  /**
   * 生成执行ID
   */
  private generateExecutionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
  }

  /**
   * 处理日志溢出
   */
  private handleOverflow(type: 'syscall' | 'file' | 'network'): void {
    console.warn(`[AuditLogger] ${type} log overflow, dropping oldest entries`);
    
    switch (type) {
      case 'syscall':
        this.syscalls = this.syscalls.slice(-Math.floor(this.config.maxEntries * 0.8));
        break;
      case 'file':
        this.fileAccesses = this.fileAccesses.slice(-Math.floor(this.config.maxEntries * 0.8));
        break;
      case 'network':
        this.networkAttempts = this.networkAttempts.slice(-Math.floor(this.config.maxEntries * 0.8));
        break;
    }
  }

  /**
   * 记录违规
   */
  private recordViolation(violation: ViolationRecord): void {
    this.violations.push(violation);
  }

  /**
   * 检查是否是可疑文件操作
   */
  private isSuspiciousFileOperation(path: string, operation: FileOperation): boolean {
    // 检查敏感路径
    const sensitivePaths = [
      '/etc/passwd',
      '/etc/shadow',
      '/etc/sudoers',
      '/proc/self',
      '/proc/1',
      '/sys/',
      '/dev/mem',
      '/dev/kmem',
      '/dev/port',
    ];

    const normalizedPath = path.toLowerCase();
    
    if (sensitivePaths.some(sp => normalizedPath.includes(sp.toLowerCase()))) {
      return true;
    }

    // 检查执行操作
    if (operation === 'execute') {
      return true;
    }

    return false;
  }

  /**
   * 更新哈希链
   */
  private updateHashChain(entry: SyscallAuditEntry | FileAccessAuditEntry | NetworkAttemptAuditEntry): void {
    const data = JSON.stringify(entry);
    const hash = crypto.createHash('sha256')
      .update(this.previousHash + data)
      .digest('hex');
    this.previousHash = hash;
  }

  /**
   * 计算报告哈希
   */
  private calculateReportHash(report: AuditReport): string {
    const dataStr = JSON.stringify({
      version: report.version,
      summary: report.summary,
      syscalls: report.syscalls,
      fileAccesses: report.fileAccesses,
      networkAttempts: report.networkAttempts,
    });
    
    return crypto.createHash('sha256').update(dataStr).digest('hex');
  }

  /**
   * 计算风险评分
   */
  private calculateRiskScore(): number {
    let score = 0;

    // 基于违规数量
    score += this.violations.length * 10;

    // 基于违规严重程度
    for (const violation of this.violations) {
      switch (violation.severity) {
        case 'critical':
          score += 100;
          break;
        case 'high':
          score += 50;
          break;
        case 'medium':
          score += 20;
          break;
        case 'low':
          score += 5;
          break;
      }
    }

    // 基于网络尝试数量
    score += this.networkAttempts.length * 30;

    // 归一化到 0-100
    return Math.min(100, score);
  }
}

// ==================== 便捷函数 ====================

/**
 * 创建审计日志记录器
 */
export function createAuditLogger(config?: AuditLoggerConfig): AuditLogger {
  return new AuditLogger(config);
}

/**
 * 验证审计报告完整性
 */
export function verifyAuditReport(report: AuditReport): boolean {
  try {
    const dataStr = JSON.stringify({
      version: report.version,
      summary: report.summary,
      syscalls: report.syscalls,
      fileAccesses: report.fileAccesses,
      networkAttempts: report.networkAttempts,
    });
    
    const calculatedHash = crypto.createHash('sha256').update(dataStr).digest('hex');
    return calculatedHash === report.hashChain;
  } catch {
    return false;
  }
}

// ==================== 导出 ====================

export default AuditLogger;
