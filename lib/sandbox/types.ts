/**
 * B-01/06 黄瓜睦·架构师 - 沙盒内核类型定义
 * 
 * 沙盒系统类型定义 - 五重隔离架构基础
 * @version 1.0.0
 * @module lib/sandbox/types
 */

import type { Pattern } from '@/patterns/types';
import type { Proposal, AgentRole } from '@/lib/core/governance/types';

// ============================================================================
// 基础枚举定义
// ============================================================================

/**
 * 沙盒风险等级枚举
 * 用于标识代码执行的风险级别
 */
export enum SandboxRiskLevel {
  /** 低风险：纯计算，无系统调用 */
  LOW = 'LOW',
  /** 中风险：有限文件访问，只读操作 */
  MEDIUM = 'MEDIUM',
  /** 高风险：文件写入，网络请求 */
  HIGH = 'HIGH',
  /** 极高风险：系统调用，敏感操作 */
  CRITICAL = 'CRITICAL',
}

/**
 * 沙盒隔离级别枚举
 * 定义沙盒的隔离强度
 */
export enum IsolationLevel {
  /** 进程级隔离（最轻量） */
  PROCESS = 'PROCESS',
  /** 容器级隔离 */
  CONTAINER = 'CONTAINER',
  /** 虚拟机级隔离（最重） */
  VM = 'VM',
  /** 硬件级隔离 */
  HARDWARE = 'HARDWARE',
}

/**
 * 沙盒执行状态枚举
 */
export enum SandboxExecutionStatus {
  /** 待执行 */
  PENDING = 'PENDING',
  /** 执行中 */
  RUNNING = 'RUNNING',
  /** 执行成功 */
  SUCCESS = 'SUCCESS',
  /** 执行失败 */
  FAILED = 'FAILED',
  /** 执行超时 */
  TIMEOUT = 'TIMEOUT',
  /** 被终止 */
  TERMINATED = 'TERMINATED',
  /** 被拦截（安全策略） */
  BLOCKED = 'BLOCKED',
}

/**
 * 审计事件类型枚举
 */
export enum AuditEventType {
  /** 系统调用 */
  SYSTEM_CALL = 'SYSTEM_CALL',
  /** 文件访问 */
  FILE_ACCESS = 'FILE_ACCESS',
  /** 网络尝试 */
  NETWORK_ATTEMPT = 'NETWORK_ATTEMPT',
  /** 内存访问 */
  MEMORY_ACCESS = 'MEMORY_ACCESS',
  /** 进程操作 */
  PROCESS_OPERATION = 'PROCESS_OPERATION',
  /** 沙盒创建 */
  SANDBOX_CREATE = 'SANDBOX_CREATE',
  /** 沙盒销毁 */
  SANDBOX_DESTROY = 'SANDBOX_DESTROY',
  /** 违规检测 */
  VIOLATION_DETECTED = 'VIOLATION_DETECTED',
}

/**
 * 文件访问模式枚举
 */
export enum FileAccessMode {
  /** 只读 */
  READ = 'READ',
  /** 只写 */
  WRITE = 'WRITE',
  /** 读写 */
  READ_WRITE = 'READ_WRITE',
  /** 执行 */
  EXECUTE = 'EXECUTE',
  /** 删除 */
  DELETE = 'DELETE',
}

/**
 * 网络协议枚举
 */
export enum NetworkProtocol {
  /** HTTP */
  HTTP = 'HTTP',
  /** HTTPS */
  HTTPS = 'HTTPS',
  /** WebSocket */
  WEBSOCKET = 'WEBSOCKET',
  /** TCP */
  TCP = 'TCP',
  /** UDP */
  UDP = 'UDP',
  /** DNS */
  DNS = 'DNS',
}

// ============================================================================
// 配置接口定义
// ============================================================================

/**
 * 资源限制配置
 */
export interface ResourceLimits {
  /** 最大CPU时间（毫秒） */
  maxCpuTimeMs: number;
  /** 最大内存（字节） */
  maxMemoryBytes: number;
  /** 最大堆内存（字节） */
  maxHeapBytes?: number;
  /** 最大栈内存（字节） */
  maxStackBytes?: number;
  /** 最大文件描述符数 */
  maxFileDescriptors: number;
  /** 最大子进程数 */
  maxProcesses: number;
  /** 最大网络连接数 */
  maxNetworkConnections: number;
  /** 最大磁盘使用量（字节） */
  maxDiskBytes: number;
}

/**
 * 网络策略配置
 */
export interface NetworkPolicy {
  /** 是否允许出站连接 */
  allowOutbound: boolean;
  /** 允许的目标域名列表 */
  allowedDomains: string[];
  /** 允许的目标IP列表 */
  allowedIps: string[];
  /** 允许的端口列表 */
  allowedPorts: number[];
  /** 允许的协议列表 */
  allowedProtocols: NetworkProtocol[];
  /** 是否允许DNS解析 */
  allowDns: boolean;
}

/**
 * 文件系统策略配置
 */
export interface FilesystemPolicy {
  /** 只读目录列表 */
  readOnlyPaths: string[];
  /** 可写目录列表 */
  readWritePaths: string[];
  /** 禁止访问的路径列表 */
  forbiddenPaths: string[];
  /** 允许的文件扩展名 */
  allowedExtensions: string[];
  /** 最大文件大小（字节） */
  maxFileSizeBytes: number;
  /** 是否允许执行 */
  allowExecute: boolean;
}

/**
 * 系统调用策略配置
 */
export interface SyscallPolicy {
  /** 允许的系统调用列表 */
  allowedSyscalls: string[];
  /** 禁止的系统调用列表 */
  blockedSyscalls: string[];
  /** 需要审核的系统调用列表 */
  auditedSyscalls: string[];
  /** 是否使用默认白名单 */
  useDefaultWhitelist: boolean;
}

/**
 * 沙盒配置接口
 * 完整的沙盒运行配置
 */
export interface SandboxConfig {
  /** 沙盒唯一标识 */
  id: string;
  /** 沙盒名称 */
  name: string;
  /** 隔离级别 */
  isolationLevel: IsolationLevel;
  /** 风险等级 */
  riskLevel: SandboxRiskLevel;
  /** 资源限制 */
  resourceLimits: ResourceLimits;
  /** 网络策略 */
  networkPolicy: NetworkPolicy;
  /** 文件系统策略 */
  filesystemPolicy: FilesystemPolicy;
  /** 系统调用策略 */
  syscallPolicy: SyscallPolicy;
  /** 执行超时（毫秒） */
  executionTimeoutMs: number;
  /** 空闲超时（毫秒） */
  idleTimeoutMs: number;
  /** 关联的Pattern ID列表 */
  patternIds: string[];
  /** 关联的治理提案ID */
  proposalId?: string;
  /** 创建者角色 */
  creatorRole: AgentRole;
  /** 创建时间戳 */
  createdAt: number;
  /** 元数据 */
  metadata: Record<string, string | number | boolean>;
}

/**
 * 隔离配置文件
 * 预定义的隔离配置模板
 */
export interface IsolationProfile {
  /** 配置文件ID */
  id: string;
  /** 配置名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 适用风险等级 */
  applicableRiskLevels: SandboxRiskLevel[];
  /** 基础隔离级别 */
  baseIsolationLevel: IsolationLevel;
  /** 默认资源限制 */
  defaultResourceLimits: ResourceLimits;
  /** 默认网络策略 */
  defaultNetworkPolicy: NetworkPolicy;
  /** 默认文件系统策略 */
  defaultFilesystemPolicy: FilesystemPolicy;
  /** 默认系统调用策略 */
  defaultSyscallPolicy: SyscallPolicy;
  /** 默认执行超时 */
  defaultTimeoutMs: number;
  /** 版本 */
  version: string;
}

// ============================================================================
// 执行记录接口定义
// ============================================================================

/**
 * 系统调用记录
 */
export interface SystemCallRecord {
  /** 调用名称 */
  name: string;
  /** 调用参数 */
  args: unknown[];
  /** 返回值 */
  returnValue?: unknown;
  /** 是否被允许 */
  allowed: boolean;
  /** 调用时间戳 */
  timestamp: number;
  /** 进程ID */
  pid: number;
  /** 线程ID */
  tid?: number;
}

/**
 * 文件访问记录
 */
export interface FileAccessRecord {
  /** 文件路径 */
  path: string;
  /** 访问模式 */
  mode: FileAccessMode;
  /** 是否被允许 */
  allowed: boolean;
  /** 访问时间戳 */
  timestamp: number;
  /** 进程ID */
  pid: number;
  /** 文件大小变化（字节） */
  sizeDelta?: number;
}

/**
 * 网络尝试记录
 */
export interface NetworkAttemptRecord {
  /** 目标地址 */
  target: string;
  /** 目标端口 */
  port: number;
  /** 协议 */
  protocol: NetworkProtocol;
  /** 是否被允许 */
  allowed: boolean;
  /** 尝试时间戳 */
  timestamp: number;
  /** 进程ID */
  pid: number;
  /** 数据大小（字节） */
  dataSize?: number;
}

/**
 * 资源使用统计
 */
export interface ResourceUsage {
  /** CPU使用时间（毫秒） */
  cpuTimeMs: number;
  /** 内存使用量（字节） */
  memoryBytes: number;
  /** 峰值内存（字节） */
  peakMemoryBytes: number;
  /** 磁盘读取字节数 */
  diskReadBytes: number;
  /** 磁盘写入字节数 */
  diskWriteBytes: number;
  /** 网络发送字节数 */
  networkSentBytes: number;
  /** 网络接收字节数 */
  networkReceivedBytes: number;
}

/**
 * 沙盒执行记录接口
 */
export interface SandboxExecution {
  /** 执行ID */
  id: string;
  /** 关联的沙盒ID */
  sandboxId: string;
  /** 执行状态 */
  status: SandboxExecutionStatus;
  /** 执行代码/命令 */
  code: string;
  /** 代码类型 */
  codeType: 'javascript' | 'typescript' | 'python' | 'shell' | 'wasm' | 'binary';
  /** 输入参数 */
  input: Record<string, unknown>;
  /** 输出结果 */
  output?: unknown;
  /** 错误信息 */
  error?: {
    message: string;
    stack?: string;
    type: string;
  };
  /** 资源使用统计 */
  resourceUsage: ResourceUsage;
  /** 系统调用记录列表 */
  systemCalls: SystemCallRecord[];
  /** 文件访问记录列表 */
  fileAccess: FileAccessRecord[];
  /** 网络尝试记录列表 */
  networkAttempts: NetworkAttemptRecord[];
  /** 执行开始时间 */
  startedAt: number;
  /** 执行结束时间 */
  endedAt?: number;
  /** 执行耗时（毫秒） */
  durationMs?: number;
  /** 关联的审计日志ID列表 */
  auditLogIds: string[];
  /** 触发的Pattern列表 */
  triggeredPatterns: string[];
}

// ============================================================================
// 审计日志接口定义
// ============================================================================

/**
 * 审计日志条目
 */
export interface AuditLogEntry {
  /** 条目ID */
  id: string;
  /** 事件类型 */
  eventType: AuditEventType;
  /** 关联的沙盒ID */
  sandboxId: string;
  /** 关联的执行ID */
  executionId?: string;
  /** 事件详情 */
  details: 
    | SystemCallRecord
    | FileAccessRecord
    | NetworkAttemptRecord
    | Record<string, unknown>;
  /** 风险评分（0-100） */
  riskScore: number;
  /** 是否触发告警 */
  triggeredAlert: boolean;
  /** 时间戳 */
  timestamp: number;
  /** 进程ID */
  pid: number;
}

/**
 * 沙盒审计日志接口
 * 符合 B-01/06 规范，包含 systemCalls, fileAccess, networkAttempts
 */
export interface SandboxAuditLog {
  /** 日志ID */
  id: string;
  /** 关联的沙盒ID */
  sandboxId: string;
  /** 关联的执行ID */
  executionId: string;
  /** 系统调用记录 */
  systemCalls: SystemCallRecord[];
  /** 文件访问记录 */
  fileAccess: FileAccessRecord[];
  /** 网络尝试记录 */
  networkAttempts: NetworkAttemptRecord[];
  /** 日志条目列表（完整时间线） */
  entries: AuditLogEntry[];
  /** 总体风险评分 */
  overallRiskScore: number;
  /** 最高风险等级 */
  maxRiskLevel: SandboxRiskLevel;
  /** 违规次数 */
  violationCount: number;
  /** 创建时间 */
  createdAt: number;
  /** 归档时间（移入TSA Archive） */
  archivedAt?: number;
  /** TSA Archive存储键 */
  archiveKey?: string;
}

// ============================================================================
// 治理集成接口定义
// ============================================================================

/**
 * 沙盒治理上下文
 * 七权治理集成所需信息
 */
export interface SandboxGovernanceContext {
  /** 关联的提案 */
  proposal?: Proposal;
  /** 创建者角色 */
  creatorRole: AgentRole;
  /** 需要审核的角色列表 */
  requiredReviewers: AgentRole[];
  /** 已审核的角色列表 */
  reviewedBy: AgentRole[];
  /** 审核状态 */
  reviewStatus: 'pending' | 'in_review' | 'approved' | 'rejected';
  /** 是否需要投票 */
  requiresVoting: boolean;
  /** 投票结果 */
  voteResult?: {
    approved: boolean;
    approvedBy: AgentRole[];
    rejectedBy: AgentRole[];
  };
}

/**
 * 沙盒创建请求
 */
export interface CreateSandboxRequest {
  /** 沙盒名称 */
  name: string;
  /** 隔离配置文件ID */
  profileId?: string;
  /** 自定义配置（覆盖配置文件） */
  customConfig?: Partial<SandboxConfig>;
  /** 预估风险等级 */
  estimatedRiskLevel: SandboxRiskLevel;
  /** 关联的Pattern ID列表 */
  patternIds?: string[];
  /** 是否需要治理审核 */
  requiresGovernance: boolean;
  /** 治理上下文 */
  governanceContext?: Partial<SandboxGovernanceContext>;
  /** 创建者角色 */
  creatorRole: AgentRole;
}

/**
 * 沙盒执行请求
 */
export interface ExecuteSandboxRequest {
  /** 目标沙盒ID */
  sandboxId: string;
  /** 执行代码 */
  code: string;
  /** 代码类型 */
  codeType: SandboxExecution['codeType'];
  /** 输入参数 */
  input?: Record<string, unknown>;
  /** 自定义超时（覆盖配置） */
  timeoutMs?: number;
  /** 是否需要审计 */
  enableAudit: boolean;
  /** 是否等待完成 */
  waitForCompletion: boolean;
}

// ============================================================================
// 结果与报告接口定义
// ============================================================================

/**
 * 沙盒创建结果
 */
export interface SandboxCreateResult {
  /** 是否成功 */
  success: boolean;
  /** 沙盒ID */
  sandboxId?: string;
  /** 沙盒配置 */
  config?: SandboxConfig;
  /** 错误信息 */
  error?: string;
  /** 是否需要治理审核 */
  requiresGovernanceReview?: boolean;
  /** 提案ID */
  proposalId?: string;
}

/**
 * 沙盒执行结果
 */
export interface SandboxExecuteResult {
  /** 是否成功 */
  success: boolean;
  /** 执行记录 */
  execution?: SandboxExecution;
  /** 错误信息 */
  error?: string;
  /** 审计日志ID */
  auditLogId?: string;
  /** 是否被安全策略拦截 */
  blockedByPolicy?: boolean;
  /** 拦截原因 */
  blockReason?: string;
}

/**
 * 沙盒审计结果
 */
export interface SandboxAuditResult {
  /** 审计日志ID */
  auditLogId: string;
  /** 是否通过审计 */
  passed: boolean;
  /** 风险评分 */
  riskScore: number;
  /** 风险等级 */
  riskLevel: SandboxRiskLevel;
  /** 违规项列表 */
  violations: Array<{
    type: AuditEventType;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
  /** 建议操作 */
  recommendations: string[];
}

/**
 * 沙盒统计信息
 */
export interface SandboxStats {
  /** 沙盒ID */
  sandboxId: string;
  /** 创建时间 */
  createdAt: number;
  /** 总执行次数 */
  totalExecutions: number;
  /** 成功执行次数 */
  successfulExecutions: number;
  /** 失败执行次数 */
  failedExecutions: number;
  /** 被拦截次数 */
  blockedExecutions: number;
  /** 总执行时间（毫秒） */
  totalExecutionTimeMs: number;
  /** 平均执行时间（毫秒） */
  averageExecutionTimeMs: number;
  /** 峰值资源使用 */
  peakResourceUsage: ResourceUsage;
  /** 最后活动时间 */
  lastActivityAt?: number;
  /** 当前状态 */
  currentStatus: 'idle' | 'running' | 'destroyed';
}

// ============================================================================
// 事件接口定义
// ============================================================================

/**
 * 沙盒事件类型
 */
export type SandboxEventType = 
  | 'sandbox:created'
  | 'sandbox:destroyed'
  | 'sandbox:execution:started'
  | 'sandbox:execution:completed'
  | 'sandbox:execution:failed'
  | 'sandbox:execution:blocked'
  | 'sandbox:violation:detected'
  | 'sandbox:audit:completed'
  | 'sandbox:resource:limit_reached';

/**
 * 沙盒事件处理器
 */
export type SandboxEventHandler = (event: SandboxEvent) => void;

/**
 * 沙盒事件
 */
export interface SandboxEvent {
  /** 事件类型 */
  type: SandboxEventType;
  /** 沙盒ID */
  sandboxId: string;
  /** 时间戳 */
  timestamp: number;
  /** 事件数据 */
  data: unknown;
}

/**
 * 沙盒创建事件
 */
export interface SandboxCreatedEvent extends SandboxEvent {
  type: 'sandbox:created';
  data: {
    config: SandboxConfig;
    creatorRole: AgentRole;
  };
}

/**
 * 沙盒执行完成事件
 */
export interface SandboxExecutionCompletedEvent extends SandboxEvent {
  type: 'sandbox:execution:completed';
  data: {
    executionId: string;
    durationMs: number;
    resourceUsage: ResourceUsage;
  };
}

/**
 * 沙盒违规检测事件
 */
export interface SandboxViolationEvent extends SandboxEvent {
  type: 'sandbox:violation:detected';
  data: {
    executionId: string;
    violationType: AuditEventType;
    description: string;
    riskScore: number;
  };
}

// ============================================================================
// 预设配置
// ============================================================================

/**
 * 默认资源限制
 */
export const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  maxCpuTimeMs: 30000,        // 30秒
  maxMemoryBytes: 128 * 1024 * 1024,  // 128MB
  maxFileDescriptors: 64,
  maxProcesses: 4,
  maxNetworkConnections: 10,
  maxDiskBytes: 100 * 1024 * 1024,    // 100MB
};

/**
 * 严格资源限制（高风险代码）
 */
export const STRICT_RESOURCE_LIMITS: ResourceLimits = {
  maxCpuTimeMs: 10000,        // 10秒
  maxMemoryBytes: 64 * 1024 * 1024,   // 64MB
  maxFileDescriptors: 16,
  maxProcesses: 1,
  maxNetworkConnections: 0,   // 禁止网络
  maxDiskBytes: 50 * 1024 * 1024,     // 50MB
};

/**
 * 默认网络策略（禁止所有出站）
 */
export const DEFAULT_DENY_NETWORK_POLICY: NetworkPolicy = {
  allowOutbound: false,
  allowedDomains: [],
  allowedIps: [],
  allowedPorts: [],
  allowedProtocols: [],
  allowDns: false,
};

/**
 * 宽松网络策略（允许HTTP/HTTPS）
 */
export const PERMISSIVE_NETWORK_POLICY: NetworkPolicy = {
  allowOutbound: true,
  allowedDomains: [],
  allowedIps: [],
  allowedPorts: [80, 443],
  allowedProtocols: [NetworkProtocol.HTTP, NetworkProtocol.HTTPS],
  allowDns: true,
};

/**
 * 默认文件系统策略
 */
export const DEFAULT_FILESYSTEM_POLICY: FilesystemPolicy = {
  readOnlyPaths: [],
  readWritePaths: ['/tmp/sandbox'],
  forbiddenPaths: ['/etc', '/usr', '/bin', '/sbin', '/lib', '/proc', '/sys'],
  allowedExtensions: ['.js', '.ts', '.json', '.txt', '.log'],
  maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
  allowExecute: false,
};

/**
 * 只读文件系统策略
 */
export const READONLY_FILESYSTEM_POLICY: FilesystemPolicy = {
  readOnlyPaths: ['/lib', '/usr/lib'],
  readWritePaths: [],
  forbiddenPaths: ['/etc', '/proc', '/sys', '/dev'],
  allowedExtensions: ['.js', '.ts', '.json'],
  maxFileSizeBytes: 0,
  allowExecute: false,
};
