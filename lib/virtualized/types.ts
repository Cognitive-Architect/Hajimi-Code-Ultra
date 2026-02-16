/**
 * HAJIMI VIRTUALIZED - 核心类型定义
 * 
 * 参考: ID-85九维理论报告 + Wave1实验报告
 * 隔离有效性: p<0.017 (统计显著)
 * 
 * @module types
 * @version 1.0.0
 */

/**
 * BNF协议命令类型
 * 符合ID-85 BNF语法附录规范
 */
export type BNFCommandType = 'SPAWN' | 'TERMINATE' | 'VACUUM' | 'LIFECYCLE';

/**
 * BNF协议命令结构
 * [COMMAND:PARAM1:PARAM2:...]
 */
export interface BNFCommand {
  /** 命令类型 */
  type: BNFCommandType;
  /** 命令参数 */
  params: string[];
  /** 原始指令字符串 */
  raw: string;
  /** 解析位置（用于错误定位） */
  position?: number;
}

/**
 * Agent生命周期状态
 * ID-85三级锚定规范
 */
export type AgentState = 
  | 'SPAWNED'      // 已创建
  | 'RUNNING'      // 运行中
  | 'PAUSED'       // 已暂停
  | 'TERMINATED';  // 已终止

/**
 * Agent隔离级别
 * Wave1验证: 污染率<5%
 */
export type IsolationLevel = 
  | 'L0_MEMORY'    // 内存级隔离
  | 'L1_CONTEXT'   // 上下文级隔离
  | 'L2_PROCESS'   // 进程级隔离
  | 'L3_HARDWARE'; // 硬件级隔离

/**
 * VirtualAgent配置选项
 */
export interface VirtualAgentOptions {
  /** Agent唯一标识 */
  id: string;
  /** 重试次数限制 (默认: 3) */
  retryLimit?: number;
  /** 隔离级别 (默认: L1_CONTEXT) */
  isolationLevel?: IsolationLevel;
  /** 上下文边界哈希 (自动生成) */
  contextBoundary?: string;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * VirtualAgent实例接口
 */
export interface IVirtualAgent {
  /** Agent唯一标识 */
  readonly id: string;
  /** 上下文边界SHA256哈希 - 硬隔离标识 */
  readonly contextBoundary: string;
  /** 当前状态 */
  readonly state: AgentState;
  /** 重试次数限制 */
  readonly retryLimit: number;
  /** 当前重试计数 */
  readonly retryCount: number;
  /** 隔离级别 */
  readonly isolationLevel: IsolationLevel;
  /** 创建时间戳 */
  readonly createdAt: number;
  /** 元数据 */
  readonly metadata: Record<string, unknown>;

  /**
   * 激活Agent实例
   * Wave1数据回注点: 状态转换触发隔离边界验证
   */
  spawn(): IVirtualAgent;

  /**
   * 终止Agent实例
   * @param reason - 终止原因
   */
  terminate(reason: string): void;

  /**
   * 暂停Agent执行
   */
  pause(): void;

  /**
   * 恢复Agent执行
   */
  resume(): void;

  /**
   * 执行重试
   * @returns 是否重试成功
   */
  retry(): boolean;

  /**
   * 获取Agent快照
   */
  snapshot(): AgentSnapshot;
}

/**
 * Agent快照
 */
export interface AgentSnapshot {
  id: string;
  state: AgentState;
  contextBoundary: string;
  retryCount: number;
  timestamp: number;
  metadata: Record<string, unknown>;
}

/**
 * 隔离报告
 * Wave1实验数据: 污染率<5% (p<0.017)
 */
export interface IsolationReport {
  /** 总Agent数量 */
  totalAgents: number;
  /** 活跃Agent数量 */
  activeAgents: number;
  /** 终止Agent数量 */
  terminatedAgents: number;
  /** 
   * 污染率估计 (0-1)
   * 基于Wave1实验: 术语重叠率+引用相似度+风格指纹综合计算
   */
  contaminationRate: number;
  /** 统计显著性p值 */
  pValue: number;
  /** 是否通过隔离验证 */
  isValid: boolean;
  /** 隔离边界列表 */
  boundaries: string[];
  /** 潜在污染对 */
  contaminationPairs: Array<{ source: string; target: string; score: number }>;
}

/**
 * 协议错误
 * 含行号定位信息
 */
export class ProtocolError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly column: number,
    public readonly rawCommand?: string
  ) {
    super(`[Line ${line}, Col ${column}] ${message}${rawCommand ? `: "${rawCommand}"` : ''}`);
    this.name = 'ProtocolError';
  }
}

/**
 * 隔离违规错误
 */
export class IsolationViolationError extends Error {
  constructor(
    message: string,
    public readonly sourceBoundary: string,
    public readonly targetBoundary: string,
    public readonly contaminationScore: number
  ) {
    super(`Isolation Violation: ${message} (score: ${contaminationScore.toFixed(4)})`);
    this.name = 'IsolationViolationError';
  }
}

/**
 * Agent池配置
 */
export interface AgentPoolConfig {
  /** 最大Agent数量 */
  maxAgents: number;
  /** 默认重试次数 */
  defaultRetryLimit: number;
  /** 默认隔离级别 */
  defaultIsolationLevel: IsolationLevel;
  /** 污染率阈值 (默认: 0.05 = 5%) */
  contaminationThreshold: number;
  /** 是否启用自动隔离检测 */
  enableAutoIsolationCheck: boolean;
}

/**
 * 默认Agent池配置
 */
export const DEFAULT_POOL_CONFIG: AgentPoolConfig = {
  maxAgents: 100,
  defaultRetryLimit: 3,
  defaultIsolationLevel: 'L1_CONTEXT',
  contaminationThreshold: 0.05, // 5% - Wave1验证阈值
  enableAutoIsolationCheck: true,
};

/**
 * BNF解析器接口
 */
export interface IBNFParser {
  /**
   * 解析BNF指令
   * @param input - 输入字符串
   * @returns 解析后的命令数组
   * @throws ProtocolError - 无效指令时抛出
   * 
   * 性能要求: <10ms (不影响Checkpoint预算)
   */
  parse(input: string): BNFCommand[];

  /**
   * 解析单行BNF指令
   * @param line - 单行指令
   * @returns 解析后的命令
   */
  parseLine(line: string, lineNumber?: number): BNFCommand;

  /**
   * 验证BNF指令有效性
   * @param command - 待验证指令
   * @returns 是否有效
   */
  validate(command: string): boolean;
}

/**
 * Agent池接口
 */
export interface IVirtualAgentPool {
  /** Agent存储 */
  readonly agents: ReadonlyMap<string, IVirtualAgent>;
  /** 池配置 */
  readonly config: AgentPoolConfig;

  /**
   * 创建Agent实例
   * @param id - Agent标识
   * @param retryLimit - 重试次数限制
   * @returns 创建的Agent实例
   */
  spawnAgent(id: string, retryLimit?: number): IVirtualAgent;

  /**
   * 终止Agent实例
   * @param id - Agent标识
   * @param reason - 终止原因
   */
  terminateAgent(id: string, reason: string): void;

  /**
   * 获取Agent实例
   * @param id - Agent标识
   * @returns Agent实例或undefined
   */
  getAgent(id: string): IVirtualAgent | undefined;

  /**
   * 获取隔离报告
   * Wave1数据回注: 污染率<5% (p<0.017)
   * @returns 隔离报告
   */
  getIsolationReport(): IsolationReport;

  /**
   * 清理已终止的Agent
   */
  vacuum(scope?: 'ALL' | 'TERMINATED'): number;

  /**
   * 执行BNF指令
   * @param command - BNF命令
   */
  executeCommand(command: BNFCommand): void;

  /**
   * 清空Agent池
   */
  clear(): void;
}
