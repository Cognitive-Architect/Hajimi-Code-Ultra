/**
 * B-01/06 黄瓜睦·架构师 - 沙盒内核核心实现
 * 
 * SandboxOrchestrator（典狱长）- 沙盒编排器核心类
 * @version 1.0.0
 * @module lib/sandbox/core
 */

import { tsa, StorageTier } from '@/lib/tsa';
import { patterns } from '@/patterns';
import type { Pattern } from '@/patterns/types';
import type { Proposal, AgentRole } from '@/lib/core/governance/types';

import type {
  // 配置类型
  SandboxConfig,
  IsolationProfile,
  CreateSandboxRequest,
  ExecuteSandboxRequest,
  // 执行类型
  SandboxExecution,
  SandboxExecutionStatus,
  SystemCallRecord,
  FileAccessRecord,
  NetworkAttemptRecord,
  ResourceUsage,
  // 审计类型
  SandboxAuditLog,
  AuditLogEntry,
  AuditEventType,
  AuditLogQuery,
  AuditLogQueryResult,
  // 结果类型
  SandboxCreateResult,
  SandboxExecuteResult,
  SandboxAuditResult,
  SandboxStats,
  // 枚举
  SandboxRiskLevel,
  IsolationLevel,
  FileAccessMode,
  NetworkProtocol,
  // 事件
  SandboxEvent,
  SandboxEventType,
  SandboxEventHandler,
  // 预设
  DEFAULT_RESOURCE_LIMITS,
  STRICT_RESOURCE_LIMITS,
  DEFAULT_DENY_NETWORK_POLICY,
  PERMISSIVE_NETWORK_POLICY,
  DEFAULT_FILESYSTEM_POLICY,
  READONLY_FILESYSTEM_POLICY,
} from './types';

// 重新导出类型
export type {
  SandboxConfig,
  SandboxExecution,
  SandboxAuditLog,
  SandboxCreateResult,
  SandboxExecuteResult,
  SandboxAuditResult,
} from './types';

export { SandboxRiskLevel, IsolationLevel, SandboxExecutionStatus } from './types';

// ============================================================================
// 默认隔离配置文件
// ============================================================================

/**
 * 低风险隔离配置文件
 */
const LOW_RISK_PROFILE: IsolationProfile = {
  id: 'profile:low-risk',
  name: '低风险配置',
  description: '适用于纯计算任务，无系统调用',
  applicableRiskLevels: [SandboxRiskLevel.LOW],
  baseIsolationLevel: IsolationLevel.PROCESS,
  defaultResourceLimits: DEFAULT_RESOURCE_LIMITS,
  defaultNetworkPolicy: DEFAULT_DENY_NETWORK_POLICY,
  defaultFilesystemPolicy: READONLY_FILESYSTEM_POLICY,
  defaultSyscallPolicy: {
    allowedSyscalls: ['read', 'write', 'exit', 'exit_group'],
    blockedSyscalls: ['execve', 'socket', 'connect', 'openat'],
    auditedSyscalls: [],
    useDefaultWhitelist: true,
  },
  defaultTimeoutMs: 30000,
  version: '1.0.0',
};

/**
 * 中风险隔离配置文件
 */
const MEDIUM_RISK_PROFILE: IsolationProfile = {
  id: 'profile:medium-risk',
  name: '中风险配置',
  description: '适用于有限文件访问和只读操作',
  applicableRiskLevels: [SandboxRiskLevel.MEDIUM],
  baseIsolationLevel: IsolationLevel.CONTAINER,
  defaultResourceLimits: {
    ...DEFAULT_RESOURCE_LIMITS,
    maxMemoryBytes: 512 * 1024 * 1024,  // 512MB
    maxCpuTimeMs: 120000,                // 2分钟
  },
  defaultNetworkPolicy: {
    ...DEFAULT_DENY_NETWORK_POLICY,
    allowOutbound: true,
    allowedPorts: [80, 443],
    allowedProtocols: [NetworkProtocol.HTTP, NetworkProtocol.HTTPS],
    allowDns: true,
  },
  defaultFilesystemPolicy: {
    ...DEFAULT_FILESYSTEM_POLICY,
    readWritePaths: ['/tmp/sandbox', '/workspace'],
  },
  defaultSyscallPolicy: {
    allowedSyscalls: ['read', 'write', 'open', 'close', 'mmap', 'exit'],
    blockedSyscalls: ['execve', 'ptrace', 'mount'],
    auditedSyscalls: ['openat', 'socket'],
    useDefaultWhitelist: true,
  },
  defaultTimeoutMs: 120000,
  version: '1.0.0',
};

/**
 * 高风险隔离配置文件
 */
const HIGH_RISK_PROFILE: IsolationProfile = {
  id: 'profile:high-risk',
  name: '高风险配置',
  description: '适用于文件写入和网络请求',
  applicableRiskLevels: [SandboxRiskLevel.HIGH],
  baseIsolationLevel: IsolationLevel.VM,
  defaultResourceLimits: {
    ...STRICT_RESOURCE_LIMITS,
    maxMemoryBytes: 1024 * 1024 * 1024,  // 1GB
    maxCpuTimeMs: 300000,                // 5分钟
    maxNetworkConnections: 20,
  },
  defaultNetworkPolicy: PERMISSIVE_NETWORK_POLICY,
  defaultFilesystemPolicy: DEFAULT_FILESYSTEM_POLICY,
  defaultSyscallPolicy: {
    allowedSyscalls: [],
    blockedSyscalls: ['execve', 'ptrace', 'mount', 'reboot'],
    auditedSyscalls: ['openat', 'socket', 'connect', 'write'],
    useDefaultWhitelist: false,
  },
  defaultTimeoutMs: 300000,
  version: '1.0.0',
};

/**
 * 极高风险隔离配置文件
 */
const CRITICAL_RISK_PROFILE: IsolationProfile = {
  id: 'profile:critical-risk',
  name: '极高风险配置',
  description: '适用于系统调用和敏感操作',
  applicableRiskLevels: [SandboxRiskLevel.CRITICAL],
  baseIsolationLevel: IsolationLevel.HARDWARE,
  defaultResourceLimits: {
    maxCpuTimeMs: 600000,                // 10分钟
    maxMemoryBytes: 2 * 1024 * 1024 * 1024,  // 2GB
    maxFileDescriptors: 256,
    maxProcesses: 16,
    maxNetworkConnections: 0,           // 禁止网络
    maxDiskBytes: 500 * 1024 * 1024,    // 500MB
  },
  defaultNetworkPolicy: DEFAULT_DENY_NETWORK_POLICY,
  defaultFilesystemPolicy: {
    readOnlyPaths: [],
    readWritePaths: [],
    forbiddenPaths: ['/etc', '/usr', '/bin', '/sbin', '/lib', '/proc', '/sys', '/dev'],
    allowedExtensions: [],
    maxFileSizeBytes: 0,
    allowExecute: false,
  },
  defaultSyscallPolicy: {
    allowedSyscalls: ['read', 'write', 'exit'],
    blockedSyscalls: ['*'],             // 禁止所有其他系统调用
    auditedSyscalls: ['read', 'write'],
    useDefaultWhitelist: true,
  },
  defaultTimeoutMs: 600000,
  version: '1.0.0',
};

/**
 * 预定义隔离配置文件映射
 */
const ISOLATION_PROFILES: Map<string, IsolationProfile> = new Map([
  [LOW_RISK_PROFILE.id, LOW_RISK_PROFILE],
  [MEDIUM_RISK_PROFILE.id, MEDIUM_RISK_PROFILE],
  [HIGH_RISK_PROFILE.id, HIGH_RISK_PROFILE],
  [CRITICAL_RISK_PROFILE.id, CRITICAL_RISK_PROFILE],
]);

// ============================================================================
// SandboxOrchestrator 类
// ============================================================================

/**
 * 沙盒编排器 - 典狱长
 * 
 * 负责沙盒的完整生命周期管理：
 * - 创建 (create)
 * - 执行 (execute)
 * - 审计 (audit)
 * - 销毁 (destroy)
 */
export class SandboxOrchestrator {
  /** 沙盒存储映射 */
  private sandboxes: Map<string, SandboxConfig>;
  
  /** 执行记录存储 */
  private executions: Map<string, SandboxExecution>;
  
  /** 审计日志缓存 */
  private auditLogs: Map<string, SandboxAuditLog>;
  
  /** 事件处理器映射 */
  private eventHandlers: Map<SandboxEventType, Set<SandboxEventHandler>>;
  
  /** 初始化状态 */
  private initialized: boolean;
  
  /** 沙盒计数器（用于生成ID） */
  private sandboxCounter: number;

  constructor() {
    this.sandboxes = new Map();
    this.executions = new Map();
    this.auditLogs = new Map();
    this.eventHandlers = new Map();
    this.initialized = false;
    this.sandboxCounter = 0;
    
    // 初始化事件处理器集合
    this.initializeEventHandlers();
  }

  /**
   * 初始化事件处理器集合
   */
  private initializeEventHandlers(): void {
    const eventTypes: SandboxEventType[] = [
      'sandbox:created',
      'sandbox:destroyed',
      'sandbox:execution:started',
      'sandbox:execution:completed',
      'sandbox:execution:failed',
      'sandbox:execution:blocked',
      'sandbox:violation:detected',
      'sandbox:audit:completed',
      'sandbox:resource:limit_reached',
    ];
    
    for (const type of eventTypes) {
      this.eventHandlers.set(type, new Set());
    }
  }

  /**
   * 初始化编排器
   * 连接 TSA 存储，加载隔离配置文件
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // 初始化 TSA 连接
    await tsa.init();
    
    this.initialized = true;
    this.emit({
      type: 'sandbox:created',
      sandboxId: 'orchestrator',
      timestamp: Date.now(),
      data: { message: 'SandboxOrchestrator initialized' },
    });
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ==================== 生命周期方法 ====================

  /**
   * 创建沙盒
   * 
   * 流程：
   * 1. 风险评估
   * 2. 治理审核（中高风险）
   * 3. 配置生成
   * 4. 资源分配
   * 5. 沙盒实例化
   * 
   * @param request 创建请求
   * @returns 创建结果
   */
  async create(request: CreateSandboxRequest): Promise<SandboxCreateResult> {
    this.ensureInitialized();

    try {
      // 1. 生成唯一ID
      const sandboxId = this.generateSandboxId();
      
      // 2. 确定隔离配置
      const profile = this.selectIsolationProfile(request.estimatedRiskLevel, request.profileId);
      
      // 3. 合并配置
      const config = this.buildSandboxConfig(sandboxId, request, profile);
      
      // 4. 中高风险需要治理审核
      if (this.requiresGovernanceReview(config.riskLevel)) {
        return {
          success: false,
          error: `Sandbox risk level ${config.riskLevel} requires governance review`,
          requiresGovernanceReview: true,
          sandboxId,
        };
      }

      // 5. 存储沙盒配置
      this.sandboxes.set(sandboxId, config);
      
      // 6. 触发创建事件
      this.emit({
        type: 'sandbox:created',
        sandboxId,
        timestamp: Date.now(),
        data: {
          config,
          creatorRole: request.creatorRole,
        },
      });

      return {
        success: true,
        sandboxId,
        config,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Failed to create sandbox: ${errorMessage}`,
      };
    }
  }

  /**
   * 基于 Pattern 创建沙盒
   * 
   * @param patternId Pattern ID
   * @param request 创建请求
   * @returns 创建结果
   */
  async createFromPattern(
    patternId: string,
    request: CreateSandboxRequest
  ): Promise<SandboxCreateResult> {
    this.ensureInitialized();

    // 1. 加载 Pattern
    const pattern = await this.loadPattern(patternId);
    if (!pattern) {
      return {
        success: false,
        error: `Pattern not found: ${patternId}`,
      };
    }

    // 2. 合并 Pattern 配置
    const mergedRequest: CreateSandboxRequest = {
      ...request,
      patternIds: [patternId, ...(request.patternIds || [])],
      customConfig: {
        ...pattern.sandboxConfig,
        ...request.customConfig,
      },
    };

    // 3. 创建沙盒
    return this.create(mergedRequest);
  }

  /**
   * 执行代码
   * 
   * 流程：
   * 1. 查找沙盒
   * 2. 验证权限
   * 3. 启动审计
   * 4. 执行代码
   * 5. 资源监控
   * 6. 生成审计日志
   * 7. 归档至 TSA
   * 
   * @param request 执行请求
   * @returns 执行结果
   */
  async execute(request: ExecuteSandboxRequest): Promise<SandboxExecuteResult> {
    this.ensureInitialized();

    const { sandboxId, code, codeType, input, timeoutMs, enableAudit, waitForCompletion } = request;

    // 1. 查找沙盒
    const config = this.sandboxes.get(sandboxId);
    if (!config) {
      return {
        success: false,
        error: `Sandbox not found: ${sandboxId}`,
      };
    }

    // 2. 生成执行ID
    const executionId = this.generateExecutionId(sandboxId);

    try {
      // 3. 触发开始事件
      this.emit({
        type: 'sandbox:execution:started',
        sandboxId,
        timestamp: Date.now(),
        data: { executionId, codeType },
      });

      // 4. 初始化审计日志
      const auditLog = enableAudit ? this.createAuditLog(sandboxId, executionId) : undefined;

      // 5. 创建执行记录
      const execution: SandboxExecution = {
        id: executionId,
        sandboxId,
        status: SandboxExecutionStatus.RUNNING,
        code,
        codeType,
        input: input || {},
        resourceUsage: this.initializeResourceUsage(),
        systemCalls: [],
        fileAccess: [],
        networkAttempts: [],
        startedAt: Date.now(),
        auditLogIds: auditLog ? [auditLog.id] : [],
        triggeredPatterns: [],
      };
      this.executions.set(executionId, execution);

      // 6. 执行代码（模拟）
      // 实际实现中，这里会调用真正的隔离执行环境
      const result = await this.performExecution(
        execution,
        config,
        timeoutMs || config.executionTimeoutMs,
        auditLog
      );

      // 7. 更新执行记录
      execution.status = result.success 
        ? SandboxExecutionStatus.SUCCESS 
        : SandboxExecutionStatus.FAILED;
      execution.output = result.output;
      execution.error = result.error;
      execution.endedAt = Date.now();
      execution.durationMs = execution.endedAt - execution.startedAt;

      // 8. 归档审计日志
      if (auditLog && enableAudit) {
        await this.archiveAuditLog(auditLog);
      }

      // 9. 触发完成事件
      this.emit({
        type: result.success ? 'sandbox:execution:completed' : 'sandbox:execution:failed',
        sandboxId,
        timestamp: Date.now(),
        data: {
          executionId,
          durationMs: execution.durationMs,
          resourceUsage: execution.resourceUsage,
        },
      });

      return {
        success: result.success,
        execution,
        auditLogId: auditLog?.id,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // 触发失败事件
      this.emit({
        type: 'sandbox:execution:failed',
        sandboxId,
        timestamp: Date.now(),
        data: { executionId, error: errorMessage },
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 审计沙盒
   * 
   * 分析沙盒的执行记录和审计日志，评估安全风险
   * 
   * @param sandboxId 沙盒ID
   * @param executionId 执行ID（可选，审计所有执行）
   * @returns 审计结果
   */
  async audit(sandboxId: string, executionId?: string): Promise<SandboxAuditResult> {
    this.ensureInitialized();

    // 1. 获取审计日志
    let auditLog: SandboxAuditLog | undefined;
    
    if (executionId) {
      // 审计特定执行
      auditLog = this.auditLogs.get(`${sandboxId}:${executionId}`);
      if (!auditLog) {
        // 尝试从 TSA 加载
        auditLog = await this.loadAuditLogFromTSA(sandboxId, executionId);
      }
    } else {
      // 审计沙盒所有执行（获取最新的）
      const logs = await this.getSandboxAuditLogs(sandboxId, 1);
      auditLog = logs[0];
    }

    if (!auditLog) {
      return {
        auditLogId: '',
        passed: false,
        riskScore: 0,
        riskLevel: SandboxRiskLevel.LOW,
        violations: [{
          type: AuditEventType.SANDBOX_CREATE,
          description: 'Audit log not found',
          severity: 'low',
        }],
        recommendations: ['Ensure audit logging is enabled'],
      };
    }

    // 2. 分析风险
    const riskAnalysis = this.analyzeRisk(auditLog);

    // 3. 生成审计结果
    const result: SandboxAuditResult = {
      auditLogId: auditLog.id,
      passed: riskAnalysis.riskScore < 70,
      riskScore: riskAnalysis.riskScore,
      riskLevel: riskAnalysis.riskLevel,
      violations: riskAnalysis.violations,
      recommendations: riskAnalysis.recommendations,
    };

    // 4. 触发审计完成事件
    this.emit({
      type: 'sandbox:audit:completed',
      sandboxId,
      timestamp: Date.now(),
      data: result,
    });

    return result;
  }

  /**
   * 销毁沙盒
   * 
   * 清理沙盒资源，归档最终审计日志
   * 
   * @param sandboxId 沙盒ID
   * @param force 是否强制销毁
   * @returns 是否成功
   */
  async destroy(sandboxId: string, force: boolean = false): Promise<boolean> {
    this.ensureInitialized();

    const config = this.sandboxes.get(sandboxId);
    if (!config) {
      return false;
    }

    try {
      // 1. 检查是否有正在执行的代码
      const activeExecutions = this.getActiveExecutions(sandboxId);
      if (activeExecutions.length > 0 && !force) {
        return false; // 有活动执行，不能销毁
      }

      // 2. 强制终止活动执行
      if (force && activeExecutions.length > 0) {
        for (const execution of activeExecutions) {
          execution.status = SandboxExecutionStatus.TERMINATED;
          execution.endedAt = Date.now();
        }
      }

      // 3. 归档最终审计日志
      await this.finalizeSandboxAudit(sandboxId);

      // 4. 移除沙盒配置
      this.sandboxes.delete(sandboxId);

      // 5. 触发销毁事件
      this.emit({
        type: 'sandbox:destroyed',
        sandboxId,
        timestamp: Date.now(),
        data: { force },
      });

      return true;
    } catch (error) {
      console.error(`Failed to destroy sandbox ${sandboxId}:`, error);
      return false;
    }
  }

  // ==================== 查询方法 ====================

  /**
   * 获取沙盒配置
   * @param sandboxId 沙盒ID
   * @returns 沙盒配置或 null
   */
  getSandbox(sandboxId: string): SandboxConfig | null {
    return this.sandboxes.get(sandboxId) || null;
  }

  /**
   * 获取沙盒统计信息
   * @param sandboxId 沙盒ID
   * @returns 统计信息
   */
  getStats(sandboxId: string): SandboxStats {
    const config = this.sandboxes.get(sandboxId);
    const executions = this.getSandboxExecutions(sandboxId);
    
    const successfulExecutions = executions.filter(
      e => e.status === SandboxExecutionStatus.SUCCESS
    ).length;
    const failedExecutions = executions.filter(
      e => e.status === SandboxExecutionStatus.FAILED
    ).length;
    const blockedExecutions = executions.filter(
      e => e.status === SandboxExecutionStatus.BLOCKED
    ).length;
    
    const totalExecutionTimeMs = executions.reduce(
      (sum, e) => sum + (e.durationMs || 0),
      0
    );
    
    const peakResourceUsage = this.calculatePeakResourceUsage(executions);

    return {
      sandboxId,
      createdAt: config?.createdAt || Date.now(),
      totalExecutions: executions.length,
      successfulExecutions,
      failedExecutions,
      blockedExecutions,
      totalExecutionTimeMs,
      averageExecutionTimeMs: executions.length > 0 
        ? totalExecutionTimeMs / executions.length 
        : 0,
      peakResourceUsage,
      lastActivityAt: executions.length > 0 
        ? Math.max(...executions.map(e => e.endedAt || e.startedAt)) 
        : undefined,
      currentStatus: this.getActiveExecutions(sandboxId).length > 0 ? 'running' : 'idle',
    };
  }

  /**
   * 查询审计日志
   * @param query 查询条件
   * @returns 查询结果
   */
  async queryAuditLogs(query: AuditLogQuery): Promise<AuditLogQueryResult> {
    const results: SandboxAuditLog[] = [];
    
    // 从内存缓存查询
    for (const [key, log] of this.auditLogs.entries()) {
      if (this.matchesQuery(log, query)) {
        results.push(log);
      }
    }
    
    // 从 TSA 查询（如果内存中不够）
    if (results.length < (query.limit || 10)) {
      const tsaResults = await this.queryAuditLogsFromTSA(query);
      results.push(...tsaResults);
    }
    
    // 去重并排序
    const uniqueResults = Array.from(new Map(results.map(l => [l.id, l])).values());
    uniqueResults.sort((a, b) => b.createdAt - a.createdAt);
    
    const limit = query.limit || 10;
    const offset = query.offset || 0;
    
    return {
      logs: uniqueResults.slice(offset, offset + limit),
      total: uniqueResults.length,
      hasMore: uniqueResults.length > offset + limit,
      tier: 'TRANSIENT',
    };
  }

  /**
   * 列出所有沙盒
   * @returns 沙盒配置列表
   */
  listSandboxes(): SandboxConfig[] {
    return Array.from(this.sandboxes.values());
  }

  // ==================== 事件订阅 ====================

  /**
   * 订阅沙盒事件
   * @param event 事件类型
   * @param handler 事件处理器
   * @returns 取消订阅函数
   */
  on(event: SandboxEventType, handler: SandboxEventHandler): () => void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.add(handler);
    }

    return () => {
      handlers?.delete(handler);
    };
  }

  /**
   * 订阅单次事件
   * @param event 事件类型
   * @param handler 事件处理器
   */
  once(event: SandboxEventType, handler: SandboxEventHandler): void {
    const onceHandler: SandboxEventHandler = (e) => {
      this.off(event, onceHandler);
      handler(e);
    };
    this.on(event, onceHandler);
  }

  /**
   * 取消订阅事件
   * @param event 事件类型
   * @param handler 事件处理器
   */
  off(event: SandboxEventType, handler: SandboxEventHandler): void {
    const handlers = this.eventHandlers.get(event);
    handlers?.delete(handler);
  }

  // ==================== 私有方法 ====================

  /**
   * 确保已初始化
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('SandboxOrchestrator not initialized. Call init() first.');
    }
  }

  /**
   * 生成沙盒ID
   */
  private generateSandboxId(): string {
    this.sandboxCounter++;
    return `sb-${Date.now()}-${this.sandboxCounter.toString(36).padStart(4, '0')}`;
  }

  /**
   * 生成执行ID
   */
  private generateExecutionId(sandboxId: string): string {
    return `exec-${sandboxId}-${Date.now()}`;
  }

  /**
   * 选择隔离配置文件
   */
  private selectIsolationProfile(
    riskLevel: SandboxRiskLevel,
    profileId?: string
  ): IsolationProfile {
    if (profileId) {
      const profile = ISOLATION_PROFILES.get(profileId);
      if (profile) {
        return profile;
      }
    }

    switch (riskLevel) {
      case SandboxRiskLevel.LOW:
        return LOW_RISK_PROFILE;
      case SandboxRiskLevel.MEDIUM:
        return MEDIUM_RISK_PROFILE;
      case SandboxRiskLevel.HIGH:
        return HIGH_RISK_PROFILE;
      case SandboxRiskLevel.CRITICAL:
        return CRITICAL_RISK_PROFILE;
      default:
        return MEDIUM_RISK_PROFILE;
    }
  }

  /**
   * 构建沙盒配置
   */
  private buildSandboxConfig(
    sandboxId: string,
    request: CreateSandboxRequest,
    profile: IsolationProfile
  ): SandboxConfig {
    const customConfig = request.customConfig || {};

    return {
      id: sandboxId,
      name: request.name,
      isolationLevel: customConfig.isolationLevel || profile.baseIsolationLevel,
      riskLevel: request.estimatedRiskLevel,
      resourceLimits: customConfig.resourceLimits || profile.defaultResourceLimits,
      networkPolicy: customConfig.networkPolicy || profile.defaultNetworkPolicy,
      filesystemPolicy: customConfig.filesystemPolicy || profile.defaultFilesystemPolicy,
      syscallPolicy: customConfig.syscallPolicy || profile.defaultSyscallPolicy,
      executionTimeoutMs: customConfig.executionTimeoutMs || profile.defaultTimeoutMs,
      idleTimeoutMs: customConfig.idleTimeoutMs || 300000,
      patternIds: request.patternIds || [],
      proposalId: request.governanceContext?.proposalId,
      creatorRole: request.creatorRole,
      createdAt: Date.now(),
      metadata: customConfig.metadata || {},
    };
  }

  /**
   * 判断是否需要治理审核
   */
  private requiresGovernanceReview(riskLevel: SandboxRiskLevel): boolean {
    return riskLevel === SandboxRiskLevel.HIGH || riskLevel === SandboxRiskLevel.CRITICAL;
  }

  /**
   * 加载 Pattern
   */
  private async loadPattern(patternId: string): Promise<Pattern | null> {
    try {
      return await patterns.get(patternId);
    } catch {
      return null;
    }
  }

  /**
   * 初始化资源使用统计
   */
  private initializeResourceUsage(): ResourceUsage {
    return {
      cpuTimeMs: 0,
      memoryBytes: 0,
      peakMemoryBytes: 0,
      diskReadBytes: 0,
      diskWriteBytes: 0,
      networkSentBytes: 0,
      networkReceivedBytes: 0,
    };
  }

  /**
   * 创建审计日志
   */
  private createAuditLog(sandboxId: string, executionId: string): SandboxAuditLog {
    const auditLog: SandboxAuditLog = {
      id: `audit-${sandboxId}-${executionId}`,
      sandboxId,
      executionId,
      systemCalls: [],
      fileAccess: [],
      networkAttempts: [],
      entries: [],
      overallRiskScore: 0,
      maxRiskLevel: SandboxRiskLevel.LOW,
      violationCount: 0,
      createdAt: Date.now(),
    };

    this.auditLogs.set(`${sandboxId}:${executionId}`, auditLog);
    return auditLog;
  }

  /**
   * 执行代码（模拟实现）
   * 
   * 注意：实际实现中，这里会调用真正的隔离执行环境
   * 如：WebContainer、Docker、gVisor 等
   */
  private async performExecution(
    execution: SandboxExecution,
    config: SandboxConfig,
    timeoutMs: number,
    auditLog?: SandboxAuditLog
  ): Promise<{ success: boolean; output?: unknown; error?: { message: string; type: string } }> {
    // 模拟执行延迟
    const executionTime = Math.min(timeoutMs, 1000 + Math.random() * 2000);
    await this.delay(executionTime);

    // 模拟资源使用
    execution.resourceUsage.cpuTimeMs = executionTime;
    execution.resourceUsage.memoryBytes = Math.floor(Math.random() * config.resourceLimits.maxMemoryBytes * 0.5);
    execution.resourceUsage.peakMemoryBytes = execution.resourceUsage.memoryBytes;

    // 模拟审计记录
    if (auditLog) {
      this.simulateAuditRecords(auditLog, execution);
    }

    // 模拟执行结果（90%成功率）
    const success = Math.random() > 0.1;

    if (success) {
      return {
        success: true,
        output: {
          result: `Execution completed in ${executionTime}ms`,
          code: execution.code.slice(0, 100),
        },
      };
    } else {
      return {
        success: false,
        error: {
          message: 'Simulated execution failure',
          type: 'ExecutionError',
        },
      };
    }
  }

  /**
   * 模拟审计记录
   */
  private simulateAuditRecords(auditLog: SandboxAuditLog, execution: SandboxExecution): void {
    // 模拟系统调用
    const syscallCount = Math.floor(Math.random() * 10);
    for (let i = 0; i < syscallCount; i++) {
      const record: SystemCallRecord = {
        name: ['read', 'write', 'mmap', 'open'][Math.floor(Math.random() * 4)],
        args: [],
        allowed: Math.random() > 0.2,
        timestamp: Date.now(),
        pid: 1234,
      };
      auditLog.systemCalls.push(record);
      execution.systemCalls.push(record);

      if (!record.allowed) {
        auditLog.violationCount++;
      }
    }

    // 模拟文件访问
    const fileAccessCount = Math.floor(Math.random() * 5);
    for (let i = 0; i < fileAccessCount; i++) {
      const record: FileAccessRecord = {
        path: `/tmp/sandbox/file${i}.txt`,
        mode: ['READ', 'WRITE'][Math.floor(Math.random() * 2)] as FileAccessMode,
        allowed: true,
        timestamp: Date.now(),
        pid: 1234,
      };
      auditLog.fileAccess.push(record);
      execution.fileAccess.push(record);
    }

    // 模拟网络尝试
    if (Math.random() > 0.7) {
      const record: NetworkAttemptRecord = {
        target: 'api.example.com',
        port: 443,
        protocol: NetworkProtocol.HTTPS,
        allowed: Math.random() > 0.5,
        timestamp: Date.now(),
        pid: 1234,
      };
      auditLog.networkAttempts.push(record);
      execution.networkAttempts.push(record);

      if (!record.allowed) {
        auditLog.violationCount++;
      }
    }

    // 计算风险评分
    auditLog.overallRiskScore = Math.min(100, auditLog.violationCount * 20 + auditLog.systemCalls.length * 2);
    auditLog.maxRiskLevel = auditLog.overallRiskScore > 70 
      ? SandboxRiskLevel.HIGH 
      : auditLog.overallRiskScore > 40 
        ? SandboxRiskLevel.MEDIUM 
        : SandboxRiskLevel.LOW;
  }

  /**
   * 归档审计日志到 TSA
   */
  private async archiveAuditLog(auditLog: SandboxAuditLog): Promise<void> {
    const key = `sandbox:audit:${auditLog.sandboxId}:${auditLog.executionId}`;
    
    // 存储到 TSA STAGING 层
    await tsa.set(key, auditLog, { tier: 'STAGING' });
    
    auditLog.archivedAt = Date.now();
    auditLog.archiveKey = key;
  }

  /**
   * 从 TSA 加载审计日志
   */
  private async loadAuditLogFromTSA(
    sandboxId: string,
    executionId: string
  ): Promise<SandboxAuditLog | undefined> {
    const key = `sandbox:audit:${sandboxId}:${executionId}`;
    return await tsa.get<SandboxAuditLog>(key);
  }

  /**
   * 获取沙盒的所有执行记录
   */
  private getSandboxExecutions(sandboxId: string): SandboxExecution[] {
    return Array.from(this.executions.values()).filter(e => e.sandboxId === sandboxId);
  }

  /**
   * 获取沙盒的活动执行
   */
  private getActiveExecutions(sandboxId: string): SandboxExecution[] {
    return this.getSandboxExecutions(sandboxId).filter(
      e => e.status === SandboxExecutionStatus.PENDING || e.status === SandboxExecutionStatus.RUNNING
    );
  }

  /**
   * 获取沙盒的审计日志
   */
  private async getSandboxAuditLogs(sandboxId: string, limit: number): Promise<SandboxAuditLog[]> {
    const logs: SandboxAuditLog[] = [];
    
    for (const [key, log] of this.auditLogs.entries()) {
      if (key.startsWith(`${sandboxId}:`)) {
        logs.push(log);
      }
    }
    
    logs.sort((a, b) => b.createdAt - a.createdAt);
    return logs.slice(0, limit);
  }

  /**
   * 计算峰值资源使用
   */
  private calculatePeakResourceUsage(executions: SandboxExecution[]): ResourceUsage {
    const peak: ResourceUsage = {
      cpuTimeMs: 0,
      memoryBytes: 0,
      peakMemoryBytes: 0,
      diskReadBytes: 0,
      diskWriteBytes: 0,
      networkSentBytes: 0,
      networkReceivedBytes: 0,
    };

    for (const execution of executions) {
      const usage = execution.resourceUsage;
      peak.cpuTimeMs = Math.max(peak.cpuTimeMs, usage.cpuTimeMs);
      peak.memoryBytes = Math.max(peak.memoryBytes, usage.memoryBytes);
      peak.peakMemoryBytes = Math.max(peak.peakMemoryBytes, usage.peakMemoryBytes);
      peak.diskReadBytes = Math.max(peak.diskReadBytes, usage.diskReadBytes);
      peak.diskWriteBytes = Math.max(peak.diskWriteBytes, usage.diskWriteBytes);
      peak.networkSentBytes = Math.max(peak.networkSentBytes, usage.networkSentBytes);
      peak.networkReceivedBytes = Math.max(peak.networkReceivedBytes, usage.networkReceivedBytes);
    }

    return peak;
  }

  /**
   * 分析风险
   */
  private analyzeRisk(auditLog: SandboxAuditLog): {
    riskScore: number;
    riskLevel: SandboxRiskLevel;
    violations: SandboxAuditResult['violations'];
    recommendations: string[];
  } {
    const violations: SandboxAuditResult['violations'] = [];
    const recommendations: string[] = [];

    // 分析系统调用违规
    for (const syscall of auditLog.systemCalls) {
      if (!syscall.allowed) {
        violations.push({
          type: AuditEventType.SYSTEM_CALL,
          description: `Blocked system call: ${syscall.name}`,
          severity: 'high',
        });
      }
    }

    // 分析网络尝试
    for (const network of auditLog.networkAttempts) {
      if (!network.allowed) {
        violations.push({
          type: AuditEventType.NETWORK_ATTEMPT,
          description: `Blocked network connection to ${network.target}:${network.port}`,
          severity: 'medium',
        });
        recommendations.push('Review network policy if this connection is required');
      }
    }

    // 计算风险评分
    let riskScore = auditLog.overallRiskScore;
    
    // 根据违规数量调整
    riskScore += violations.length * 10;

    // 确定风险等级
    let riskLevel: SandboxRiskLevel;
    if (riskScore >= 80) {
      riskLevel = SandboxRiskLevel.CRITICAL;
    } else if (riskScore >= 60) {
      riskLevel = SandboxRiskLevel.HIGH;
    } else if (riskScore >= 30) {
      riskLevel = SandboxRiskLevel.MEDIUM;
    } else {
      riskLevel = SandboxRiskLevel.LOW;
    }

    // 添加通用建议
    if (violations.length > 0) {
      recommendations.push('Review and update sandbox policies to reduce violations');
    }
    if (auditLog.systemCalls.length > 100) {
      recommendations.push('High system call count detected, consider optimizing the code');
    }

    return {
      riskScore: Math.min(100, riskScore),
      riskLevel,
      violations,
      recommendations,
    };
  }

  /**
   * 匹配查询条件
   */
  private matchesQuery(log: SandboxAuditLog, query: AuditLogQuery): boolean {
    if (query.sandboxId && log.sandboxId !== query.sandboxId) {
      return false;
    }
    if (query.executionId && log.executionId !== query.executionId) {
      return false;
    }
    if (query.fromTime && log.createdAt < query.fromTime) {
      return false;
    }
    if (query.toTime && log.createdAt > query.toTime) {
      return false;
    }
    return true;
  }

  /**
   * 从 TSA 查询审计日志
   */
  private async queryAuditLogsFromTSA(query: AuditLogQuery): Promise<SandboxAuditLog[]> {
    // 简化实现：从 TSA 获取所有沙盒审计日志
    // 实际实现应该使用更高效的查询方式
    const results: SandboxAuditLog[] = [];
    
    // 如果指定了沙盒ID，直接查询
    if (query.sandboxId) {
      const pattern = `sandbox:audit:${query.sandboxId}:`;
      // 这里应该使用 TSA 的 keys() 方法或类似功能
      // 简化处理：返回空数组
    }
    
    return results;
  }

  /**
   * 完成沙盒审计
   */
  private async finalizeSandboxAudit(sandboxId: string): Promise<void {
    const logs = await this.getSandboxAuditLogs(sandboxId, Number.MAX_SAFE_INTEGER);
    
    for (const log of logs) {
      if (!log.archivedAt) {
        await this.archiveAuditLog(log);
      }
    }
  }

  /**
   * 触发事件
   */
  private emit(event: SandboxEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          console.error(`Event handler error for ${event.type}:`, error);
        }
      }
    }
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// 单例导出
// ============================================================================

/**
 * 沙盒编排器单例实例
 */
export const sandboxOrchestrator = new SandboxOrchestrator();

/**
 * 获取沙盒编排器实例
 */
export function getSandboxOrchestrator(): SandboxOrchestrator {
  return sandboxOrchestrator;
}

/**
 * 初始化沙盒模块
 */
export async function initSandbox(): Promise<{ success: boolean; error?: string }> {
  try {
    await sandboxOrchestrator.init();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export default sandboxOrchestrator;
