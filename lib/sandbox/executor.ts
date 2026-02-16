/**
 * B-04/06 沙盒执行器 - Atoms代码投递 + 结果回收
 * 唐音·工程师 - 沙盒执行核心
 */

import type { AgentRole } from '@/lib/types/state';
import type { 
  Proposal, 
  VoteResult,
  CreateProposalRequest,
} from '@/lib/core/governance/types';

// ============================================================================
// 类型定义
// ============================================================================

/** 执行风险等级 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** 沙盒执行上下文 */
export interface ExecutionContext {
  /** 执行超时时间(ms) */
  timeoutMs?: number;
  /** 内存限制(MB) */
  memoryLimitMB?: number;
  /** 允许的API白名单 */
  allowedAPIs?: string[];
  /** 执行环境变量 */
  env?: Record<string, string>;
  /** 执行ID */
  executionId?: string;
}

/** 风险评估结果 */
export interface RiskAssessment {
  level: RiskLevel;
  score: number; // 0-100
  warnings: string[];
  blockedAPIs: string[];
  requiresGovernance: boolean;
}

/** 执行结果 */
export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  executionTimeMs: number;
  memoryUsedMB?: number;
  executionId: string;
  terminated?: boolean;
  terminationReason?: string;
}

/** 审计日志条目 */
export interface AuditLogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  category: 'risk' | 'execution' | 'governance' | 'result';
  message: string;
  details?: Record<string, unknown>;
}

/** 执行状态 */
export type ExecutionStatus = 
  | 'idle'
  | 'assessing'
  | 'pending_governance'
  | 'voting'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'terminated';

/** 沙盒执行记录 */
export interface SandboxExecution {
  id: string;
  code: string;
  context: ExecutionContext;
  status: ExecutionStatus;
  riskAssessment?: RiskAssessment;
  proposalId?: string;
  result?: ExecutionResult;
  auditLogs: AuditLogEntry[];
  createdAt: number;
  updatedAt: number;
  executedAt?: number;
  completedAt?: number;
}

/** 治理接口 */
export interface GovernanceAdapter {
  createProposal(request: CreateProposalRequest): Promise<Proposal>;
  getVoteStats(proposalId: string): Promise<VoteResult | null>;
  castVote(proposalId: string, voter: AgentRole, choice: 'approve' | 'reject' | 'abstain'): Promise<VoteResult>;
}

/** 沙盒隔离接口 */
export interface JailorAdapter {
  createSandbox(context: ExecutionContext): Promise<string>; // 返回沙盒ID
  executeCode(sandboxId: string, code: string): Promise<ExecutionResult>;
  destroySandbox(sandboxId: string): Promise<void>;
  getSandboxStatus(sandboxId: string): Promise<'idle' | 'running' | 'terminated'>;
  terminateSandbox(sandboxId: string, reason: string): Promise<void>;
}

/** 审计日志接口 */
export interface AuditLogger {
  log(entry: AuditLogEntry): void;
  getLogs(executionId?: string): AuditLogEntry[];
  clearLogs(executionId?: string): void;
}

// ============================================================================
// 默认配置
// ============================================================================

/** 危险API黑名单 */
export const DANGEROUS_APIS = [
  // 文件系统
  'fs\\.',
  'readFile',
  'writeFile',
  'unlink',
  'rmdir',
  'mkdir',
  // 网络
  'fetch\\(',
  'XMLHttpRequest',
  'WebSocket',
  'navigator\\.sendBeacon',
  // 系统
  'process\\.',
  'child_process',
  'exec',
  'spawn',
  // DOM操作（危险）
  'eval\\(',
  'Function\\(',
  'setInterval\\(',
  // 存储
  'localStorage',
  'sessionStorage',
  'indexedDB',
  // 其他
  'import\\s*\\(',
  'require\\s*\\(',
];

/** 风险评分规则 */
export const RISK_RULES: { pattern: RegExp; score: number; message: string }[] = [
  { pattern: /eval\s*\(/i, score: 50, message: '检测到eval使用' },
  { pattern: /Function\s*\(/i, score: 40, message: '检测到Function构造器使用' },
  { pattern: /while\s*\(\s*true\s*\)/i, score: 30, message: '检测到潜在无限循环' },
  { pattern: /for\s*\(\s*;;\s*\)/i, score: 30, message: '检测到潜在无限循环' },
  { pattern: /setInterval\s*\(/i, score: 20, message: '检测到定时器使用' },
  { pattern: /fetch\s*\(/i, score: 25, message: '检测到网络请求' },
  { pattern: /XMLHttpRequest/i, score: 25, message: '检测到XHR请求' },
  { pattern: /localStorage|sessionStorage/i, score: 15, message: '检测到存储访问' },
  { pattern: /document\./i, score: 10, message: '检测到DOM访问' },
  { pattern: /window\./i, score: 10, message: '检测到window访问' },
];

/** 默认执行配置 */
export const DEFAULT_EXECUTION_CONTEXT: ExecutionContext = {
  timeoutMs: 30000, // 30秒超时
  memoryLimitMB: 128,
  allowedAPIs: ['console'],
  env: {},
};

// ============================================================================
// 沙盒执行器类
// ============================================================================

export class SandboxExecutor {
  private executions: Map<string, SandboxExecution> = new Map();
  private governance: GovernanceAdapter;
  private jailor: JailorAdapter;
  private auditLogger: AuditLogger;

  constructor(
    governance: GovernanceAdapter,
    jailor: JailorAdapter,
    auditLogger: AuditLogger
  ) {
    this.governance = governance;
    this.jailor = jailor;
    this.auditLogger = auditLogger;
  }

  /**
   * 风险评估
   * 扫描代码中的危险API和模式
   */
  assessRisk(code: string): RiskAssessment {
    const warnings: string[] = [];
    const blockedAPIs: string[] = [];
    let totalScore = 0;

    // 检查危险API
    for (const pattern of DANGEROUS_APIS) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(code)) {
        blockedAPIs.push(pattern.replace(/\\/g, '').replace(/\./g, ''));
      }
    }

    // 风险评分
    for (const rule of RISK_RULES) {
      if (rule.pattern.test(code)) {
        warnings.push(rule.message);
        totalScore += rule.score;
      }
    }

    // 代码长度风险（过长的代码可能有问题）
    const lineCount = code.split('\n').length;
    if (lineCount > 1000) {
      warnings.push(`代码行数过多(${lineCount}行)`);
      totalScore += 10;
    }

    // 确定风险等级
    let level: RiskLevel;
    if (totalScore >= 80) level = 'critical';
    else if (totalScore >= 50) level = 'high';
    else if (totalScore >= 20) level = 'medium';
    else level = 'low';

    const assessment: RiskAssessment = {
      level,
      score: Math.min(totalScore, 100),
      warnings: [...new Set(warnings)],
      blockedAPIs: [...new Set(blockedAPIs)],
      requiresGovernance: level === 'high' || level === 'critical' || blockedAPIs.length > 0,
    };

    this.logAudit({
      timestamp: Date.now(),
      level: assessment.level === 'critical' || assessment.level === 'high' ? 'error' : 'info',
      category: 'risk',
      message: `风险评估完成: ${assessment.level}(得分${assessment.score})`,
      details: { ...assessment },
    });

    return assessment;
  }

  /**
   * 提交执行提案到治理系统
   */
  async proposeExecution(
    code: string, 
    context: ExecutionContext = {},
    proposer: AgentRole = 'engineer'
  ): Promise<Proposal> {
    const executionId = this.generateExecutionId();
    const mergedContext = { ...DEFAULT_EXECUTION_CONTEXT, ...context, executionId };

    // 风险评估
    const riskAssessment = this.assessRisk(code);

    // 创建执行记录
    const execution: SandboxExecution = {
      id: executionId,
      code,
      context: mergedContext,
      status: riskAssessment.requiresGovernance ? 'pending_governance' : 'approved',
      riskAssessment,
      auditLogs: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.executions.set(executionId, execution);

    // 低风险直接执行，高风险需要治理
    if (!riskAssessment.requiresGovernance) {
      this.logAudit({
        timestamp: Date.now(),
        level: 'info',
        category: 'governance',
        message: `低风险代码，跳过治理流程: ${executionId}`,
      });
      return Promise.resolve({
        id: `auto_${executionId}`,
        title: '自动批准低风险执行',
        description: code.slice(0, 200),
        proposer,
        targetState: 'CODE',
        status: 'approved',
        votes: [],
        createdAt: Date.now(),
        expiresAt: Date.now() + 60000,
        type: 'custom',
      } as Proposal);
    }

    // 提交治理提案
    const request: CreateProposalRequest = {
      proposer,
      title: `沙盒代码执行请求: ${executionId}`,
      description: this.buildProposalDescription(code, riskAssessment),
      targetState: 'CODE',
      type: 'custom',
      context: {
        executionId,
        riskLevel: riskAssessment.level,
        riskScore: riskAssessment.score,
        blockedAPIs: riskAssessment.blockedAPIs,
      },
    };

    const proposal = await this.governance.createProposal(request);
    
    execution.proposalId = proposal.id;
    execution.status = 'voting';
    execution.updatedAt = Date.now();

    this.logAudit({
      timestamp: Date.now(),
      level: 'info',
      category: 'governance',
      message: `治理提案已创建: ${proposal.id}`,
      details: { executionId, proposalId: proposal.id },
    });

    return proposal;
  }

  /**
   * 执行代码（需投票通过）
   */
  async execute(
    code: string,
    context: ExecutionContext = {},
    proposalId?: string
  ): Promise<ExecutionResult> {
    const executionId = context.executionId || this.generateExecutionId();
    const mergedContext = { ...DEFAULT_EXECUTION_CONTEXT, ...context, executionId };

    // 检查是否需要治理批准
    if (proposalId) {
      const voteResult = await this.governance.getVoteStats(proposalId);
      if (!voteResult || !voteResult.shouldExecute) {
        const error = '提案未通过投票，无法执行';
        this.logAudit({
          timestamp: Date.now(),
          level: 'error',
          category: 'governance',
          message: error,
          details: { executionId, proposalId, voteResult },
        });
        throw new Error(error);
      }
    }

    // 创建或更新执行记录
    let execution = this.executions.get(executionId);
    if (!execution) {
      const riskAssessment = this.assessRisk(code);
      execution = {
        id: executionId,
        code,
        context: mergedContext,
        status: 'executing',
        riskAssessment,
        auditLogs: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        proposalId,
      };
      this.executions.set(executionId, execution);
    } else {
      execution.status = 'executing';
      execution.updatedAt = Date.now();
      execution.executedAt = Date.now();
    }

    this.logAudit({
      timestamp: Date.now(),
      level: 'info',
      category: 'execution',
      message: `开始执行代码: ${executionId}`,
    });

    // 创建沙盒并执行
    let sandboxId: string | null = null;
    const startTime = Date.now();

    try {
      sandboxId = await this.jailor.createSandbox(mergedContext);
      
      // 设置执行超时
      const timeoutPromise = new Promise<ExecutionResult>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`执行超时(${mergedContext.timeoutMs}ms)`));
        }, mergedContext.timeoutMs);
      });

      // 执行代码
      const executionPromise = this.jailor.executeCode(sandboxId, code);
      
      // 竞速执行与超时
      let result = await Promise.race([executionPromise, timeoutPromise]);

      // 如果超时触发了，手动终止沙盒
      if (result.terminated && result.terminationReason?.includes('超时')) {
        await this.jailor.terminateSandbox(sandboxId, 'timeout');
      }

      // 标记为完成
      result = {
        ...result,
        executionTimeMs: Date.now() - startTime,
        executionId,
      };

      execution.result = result;
      execution.status = result.success ? 'completed' : 'failed';
      execution.completedAt = Date.now();
      execution.updatedAt = Date.now();

      this.logAudit({
        timestamp: Date.now(),
        level: result.success ? 'info' : 'error',
        category: 'result',
        message: `执行完成: ${result.success ? '成功' : '失败'}`,
        details: { ...result },
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const result: ExecutionResult = {
        success: false,
        error: errorMessage,
        executionTimeMs: Date.now() - startTime,
        executionId,
        terminated: true,
        terminationReason: errorMessage,
      };

      execution.result = result;
      execution.status = 'failed';
      execution.completedAt = Date.now();
      execution.updatedAt = Date.now();

      this.logAudit({
        timestamp: Date.now(),
        level: 'error',
        category: 'result',
        message: `执行异常: ${errorMessage}`,
        details: { error: errorMessage },
      });

      return result;

    } finally {
      // 清理沙盒
      if (sandboxId) {
        await this.jailor.destroySandbox(sandboxId).catch(console.error);
      }
    }
  }

  /**
   * 回收执行结果
   */
  collectResult(executionId: string): ExecutionResult | null {
    const execution = this.executions.get(executionId);
    if (!execution) return null;

    return execution.result || null;
  }

  /**
   * 获取完整执行记录
   */
  getExecution(executionId: string): SandboxExecution | null {
    return this.executions.get(executionId) || null;
  }

  /**
   * 获取所有执行记录
   */
  getAllExecutions(): SandboxExecution[] {
    return Array.from(this.executions.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * 获取审计日志
   */
  getAuditLogs(executionId?: string): AuditLogEntry[] {
    if (executionId) {
      const execution = this.executions.get(executionId);
      return execution?.auditLogs || [];
    }
    return this.auditLogger.getLogs();
  }

  /**
   * 检查执行状态
   */
  getExecutionStatus(executionId: string): ExecutionStatus | null {
    const execution = this.executions.get(executionId);
    return execution?.status || null;
  }

  /**
   * 投票辅助方法
   */
  async voteOnExecution(
    executionId: string,
    voter: AgentRole,
    choice: 'approve' | 'reject' | 'abstain'
  ): Promise<VoteResult | null> {
    const execution = this.executions.get(executionId);
    if (!execution?.proposalId) return null;

    return await this.governance.castVote(execution.proposalId, voter, choice);
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private buildProposalDescription(code: string, risk: RiskAssessment): string {
    return `
## 沙盒代码执行请求

### 风险等级
- 等级: ${risk.level.toUpperCase()}
- 评分: ${risk.score}/100

### 风险提示
${risk.warnings.map(w => `- ⚠️ ${w}`).join('\n') || '- 无'}

### 阻止的API
${risk.blockedAPIs.map(api => `- 🚫 ${api}`).join('\n') || '- 无'}

### 代码预览
\`\`\`javascript
${code.slice(0, 500)}${code.length > 500 ? '\n... (已截断)' : ''}
\`\`\`

### 需要治理批准
该代码存在${risk.level === 'critical' ? '严重' : '高'}风险，需要七权治理投票通过后方可执行。
    `.trim();
  }

  private logAudit(entry: AuditLogEntry): void {
    this.auditLogger.log(entry);
  }
}

// ============================================================================
// 默认实现
// ============================================================================

/** 简单的内存审计日志实现 */
export class MemoryAuditLogger implements AuditLogger {
  private logs: AuditLogEntry[] = [];

  log(entry: AuditLogEntry): void {
    this.logs.push(entry);
    // 控制台输出
    const prefix = `[${entry.category.toUpperCase()}]`;
    const message = `${prefix} ${entry.message}`;
    if (entry.level === 'error') {
      console.error(message, entry.details || '');
    } else if (entry.level === 'warn') {
      console.warn(message, entry.details || '');
    } else {
      console.log(message, entry.details || '');
    }
  }

  getLogs(executionId?: string): AuditLogEntry[] {
    if (executionId) {
      return this.logs.filter(l => l.details?.executionId === executionId);
    }
    return [...this.logs];
  }

  clearLogs(executionId?: string): void {
    if (executionId) {
      this.logs = this.logs.filter(l => l.details?.executionId !== executionId);
    } else {
      this.logs = [];
    }
  }
}

/** Web Worker 沙盒实现 */
export class WebWorkerJailor implements JailorAdapter {
  private sandboxes: Map<string, Worker> = new Map();

  async createSandbox(context: ExecutionContext): Promise<string> {
    const sandboxId = `sandbox_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 创建 Worker 代码
    const workerCode = this.buildWorkerCode(context);
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    
    const worker = new Worker(workerUrl);
    this.sandboxes.set(sandboxId, worker);
    
    return sandboxId;
  }

  async executeCode(sandboxId: string, code: string): Promise<ExecutionResult> {
    const worker = this.sandboxes.get(sandboxId);
    if (!worker) {
      throw new Error(`沙盒不存在: ${sandboxId}`);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve({
          success: false,
          error: '执行超时',
          executionTimeMs: 30000,
          executionId: sandboxId,
          terminated: true,
          terminationReason: 'timeout',
        });
      }, 30000);

      worker.onmessage = (e) => {
        clearTimeout(timeout);
        if (e.data.type === 'result') {
          resolve({
            success: true,
            output: e.data.output,
            executionTimeMs: e.data.executionTimeMs,
            executionId: sandboxId,
          });
        } else if (e.data.type === 'error') {
          resolve({
            success: false,
            error: e.data.error,
            executionTimeMs: e.data.executionTimeMs,
            executionId: sandboxId,
          });
        }
      };

      worker.onerror = (error) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          error: error.message || 'Worker 错误',
          executionTimeMs: 0,
          executionId: sandboxId,
        });
      };

      worker.postMessage({ type: 'execute', code });
    });
  }

  async destroySandbox(sandboxId: string): Promise<void> {
    const worker = this.sandboxes.get(sandboxId);
    if (worker) {
      worker.terminate();
      this.sandboxes.delete(sandboxId);
    }
  }

  async getSandboxStatus(sandboxId: string): Promise<'idle' | 'running' | 'terminated'> {
    const worker = this.sandboxes.get(sandboxId);
    if (!worker) return 'terminated';
    return 'running';
  }

  async terminateSandbox(sandboxId: string, reason: string): Promise<void> {
    console.log(`[WebWorkerJailor] 终止沙盒: ${sandboxId}, 原因: ${reason}`);
    await this.destroySandbox(sandboxId);
  }

  private buildWorkerCode(context: ExecutionContext): string {
    return `
const console = {
  log: (...args) => self.postMessage({ type: 'log', data: args.map(a => String(a)).join(' ') }),
  error: (...args) => self.postMessage({ type: 'error', data: args.map(a => String(a)).join(' ') }),
  warn: (...args) => self.postMessage({ type: 'warn', data: args.map(a => String(a)).join(' ') }),
};

self.onmessage = function(e) {
  if (e.data.type === 'execute') {
    const startTime = Date.now();
    try {
      const result = eval(e.data.code);
      self.postMessage({
        type: 'result',
        output: String(result),
        executionTimeMs: Date.now() - startTime
      });
    } catch (err) {
      self.postMessage({
        type: 'error',
        error: err.message,
        executionTimeMs: Date.now() - startTime
      });
    }
  }
};
    `;
  }
}

// 导出单例（需要外部注入依赖）
export let sandboxExecutor: SandboxExecutor | null = null;

export function initSandboxExecutor(
  governance: GovernanceAdapter,
  jailor: JailorAdapter,
  auditLogger: AuditLogger = new MemoryAuditLogger()
): SandboxExecutor {
  sandboxExecutor = new SandboxExecutor(governance, jailor, auditLogger);
  return sandboxExecutor;
}

export function getSandboxExecutor(): SandboxExecutor {
  if (!sandboxExecutor) {
    throw new Error('沙盒执行器未初始化，请先调用 initSandboxExecutor');
  }
  return sandboxExecutor;
}
