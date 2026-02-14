/**
 * B-04/06 沙盒执行治理集成
 * 唐音·工程师 - 七权治理流程集成
 * 
 * 治理流程:
 * 1. PM立法检查 - 提案创建权限
 * 2. QA司规扫描 - 代码规范检查
 * 3. Mike审计评级 - 安全风险评级
 * 4. 60%阈值投票 - 七权投票决策
 */

import type { AgentRole } from '@/lib/types/state';
import type { 
  Proposal, 
  VoteResult,
  CreateProposalRequest,
  GovernanceConfig,
} from '@/lib/core/governance/types';
import { 
  ProposalService, 
  VoteService,
  VOTING_RULES,
  ROLE_WEIGHTS,
  VOTABLE_ROLES,
} from '@/lib/core/governance';
import type { 
  RiskAssessment,
  ExecutionContext,
  GovernanceAdapter,
  AuditLogEntry,
} from './executor';

// ============================================================================
// 类型定义
// ============================================================================

/** 治理检查类型 */
export type GovernanceCheckType = 'pm_legislative' | 'qa_compliance' | 'mike_audit' | 'vote_threshold';

/** 治理检查结果 */
export interface GovernanceCheckResult {
  type: GovernanceCheckType;
  passed: boolean;
  role: AgentRole;
  score: number;
  message: string;
  details?: Record<string, unknown>;
}

/** 七权治理决策 */
export interface SevenPowersDecision {
  proposalId: string;
  checks: GovernanceCheckResult[];
  overallPassed: boolean;
  finalScore: number;
  requiredVotes: number;
  currentVotes: number;
  approvalRate: number;
  canExecute: boolean;
  reasons: string[];
}

/** 代码规范问题 */
export interface ComplianceIssue {
  severity: 'error' | 'warning' | 'info';
  line?: number;
  column?: number;
  message: string;
  rule?: string;
}

/** QA司规检查结果 */
export interface QAComplianceResult {
  passed: boolean;
  score: number;
  issues: ComplianceIssue[];
  checkedRules: string[];
}

/** Mike审计评级结果 */
export interface MikeAuditResult {
  rating: 'A' | 'B' | 'C' | 'D' | 'F';
  score: number;
  securityRisks: string[];
  recommendations: string[];
  auditLevel: 'basic' | 'standard' | 'strict';
}

// ============================================================================
// PM立法检查器
// ============================================================================

/**
 * PM立法检查 - 提案创建权限验证
 * 
 * 职责:
 * - 验证提案创建者权限
 * - 检查提案内容合法性
 * - 确保符合治理章程
 */
export class PMLegislativeChecker {
  private allowedCreators: AgentRole[] = ['pm'];
  private maxCodeLength: number = 10000;
  private forbiddenPatterns: RegExp[] = [
    /import\s+.*\s+from\s+['"][^'"]*['"]/i, // 外部导入检查
  ];

  /**
   * 检查提案合法性
   */
  checkLegislative(code: string, proposer: AgentRole): GovernanceCheckResult {
    // 1. 权限检查
    if (!this.allowedCreators.includes(proposer)) {
      return {
        type: 'pm_legislative',
        passed: false,
        role: 'pm',
        score: 0,
        message: '提案创建权限不足，仅PM可创建沙盒执行提案',
      };
    }

    // 2. 代码长度检查
    if (code.length > this.maxCodeLength) {
      return {
        type: 'pm_legislative',
        passed: false,
        role: 'pm',
        score: 30,
        message: `代码长度超过限制(${this.maxCodeLength}字符)`,
        details: { codeLength: code.length, maxLength: this.maxCodeLength },
      };
    }

    // 3. 禁止模式检查
    const violations: string[] = [];
    for (const pattern of this.forbiddenPatterns) {
      if (pattern.test(code)) {
        violations.push(pattern.source);
      }
    }

    if (violations.length > 0) {
      return {
        type: 'pm_legislative',
        passed: false,
        role: 'pm',
        score: 50,
        message: '代码包含禁止的模式',
        details: { violations },
      };
    }

    return {
      type: 'pm_legislative',
      passed: true,
      role: 'pm',
      score: 100,
      message: 'PM立法检查通过',
    };
  }

  /**
   * 设置允许的创建者
   */
  setAllowedCreators(creators: AgentRole[]): void {
    this.allowedCreators = creators;
  }
}

// ============================================================================
// QA司规检查器
// ============================================================================

/**
 * QA司规扫描 - 代码规范检查
 * 
 * 职责:
 * - 代码风格检查
 * - 潜在问题扫描
 * - 规范合规验证
 */
export class QAComplianceChecker {
  private rules: Array<{
    name: string;
    pattern: RegExp;
    severity: 'error' | 'warning' | 'info';
    message: string;
  }> = [
    {
      name: 'no_console_in_production',
      pattern: /console\.(log|debug)\(/g,
      severity: 'warning',
      message: '生产环境不建议使用console.log',
    },
    {
      name: 'no_var',
      pattern: /\bvar\s+/g,
      severity: 'warning',
      message: '建议使用let或const替代var',
    },
    {
      name: 'no_unused_vars',
      pattern: /var\s+\w+\s*;|let\s+\w+\s*;|const\s+\w+\s*;/g,
      severity: 'info',
      message: '检测到未初始化的变量',
    },
    {
      name: 'no_deep_nesting',
      pattern: /\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g,
      severity: 'warning',
      message: '嵌套层级过深，建议重构',
    },
    {
      name: 'function_naming',
      pattern: /function\s+[a-z]/g,
      severity: 'info',
      message: '函数名建议使用驼峰命名法',
    },
  ];

  /**
   * 执行司规扫描
   */
  checkCompliance(code: string): QAComplianceResult {
    const issues: ComplianceIssue[] = [];
    const lines = code.split('\n');
    let totalScore = 100;

    // 逐行检查
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      for (const rule of this.rules) {
        const matches = Array.from(line.matchAll(rule.pattern));
        for (const match of matches) {
          issues.push({
            severity: rule.severity,
            line: lineNum,
            column: match.index ? match.index + 1 : undefined,
            message: rule.message,
            rule: rule.name,
          });

          // 扣分
          if (rule.severity === 'error') totalScore -= 10;
          else if (rule.severity === 'warning') totalScore -= 5;
          else totalScore -= 1;
        }
      }
    }

    // 代码复杂度检查（简单估算）
    const complexity = this.estimateComplexity(code);
    if (complexity > 10) {
      issues.push({
        severity: 'warning',
        message: `代码复杂度较高(估算值: ${complexity})，建议拆分`,
        rule: 'complexity',
      });
      totalScore -= 10;
    }

    // 确保分数在0-100之间
    totalScore = Math.max(0, Math.min(100, totalScore));

    return {
      passed: totalScore >= 60,
      score: totalScore,
      issues,
      checkedRules: this.rules.map(r => r.name),
    };
  }

  /**
   * 获取治理检查结果
   */
  getGovernanceCheck(code: string): GovernanceCheckResult {
    const result = this.checkCompliance(code);
    
    return {
      type: 'qa_compliance',
      passed: result.passed,
      role: 'qa',
      score: result.score,
      message: result.passed 
        ? `QA司规检查通过(得分: ${result.score})`
        : `QA司规检查未通过(得分: ${result.score})`,
      details: {
        issueCount: result.issues.length,
        errorCount: result.issues.filter(i => i.severity === 'error').length,
        warningCount: result.issues.filter(i => i.severity === 'warning').length,
      },
    };
  }

  /**
   * 估算代码复杂度
   */
  private estimateComplexity(code: string): number {
    // 简单估算：条件语句数量 + 循环数量 + 函数数量
    const conditionals = (code.match(/\bif\b|\?\s*:/g) || []).length;
    const loops = (code.match(/\b(for|while|do)\b/g) || []).length;
    const functions = (code.match(/\bfunction\b|\b=>\b/g) || []).length;
    const switches = (code.match(/\bswitch\b/g) || []).length;
    
    return conditionals + loops * 2 + functions + switches * 2;
  }

  /**
   * 添加自定义规则
   */
  addRule(rule: typeof this.rules[0]): void {
    this.rules.push(rule);
  }
}

// ============================================================================
// Mike审计评级器
// ============================================================================

/**
 * Mike审计评级 - 安全风险评级
 * 
 * 职责:
 * - 安全风险扫描
 * - 威胁等级评估
 * - 执行建议生成
 */
export class MikeAuditor {
  private auditLevel: 'basic' | 'standard' | 'strict' = 'standard';

  // 风险规则定义
  private riskRules: Array<{
    pattern: RegExp;
    risk: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    description: string;
  }> = [
    {
      pattern: /eval\s*\(/i,
      risk: 'critical',
      category: '代码注入',
      description: '检测到eval()使用，存在代码注入风险',
    },
    {
      pattern: /Function\s*\(\s*["']/i,
      risk: 'critical',
      category: '代码注入',
      description: '检测到Function构造器使用',
    },
    {
      pattern: /while\s*\(\s*true\s*\)|for\s*\(\s*;;\s*\)/i,
      risk: 'high',
      category: '拒绝服务',
      description: '检测到潜在无限循环',
    },
    {
      pattern: /fetch\s*\(|XMLHttpRequest/i,
      risk: 'medium',
      category: '数据外泄',
      description: '检测到网络请求',
    },
    {
      pattern: /localStorage|sessionStorage/i,
      risk: 'low',
      category: '数据存储',
      description: '检测到浏览器存储访问',
    },
    {
      pattern: /document\.(cookie|write)/i,
      risk: 'high',
      category: 'XSS',
      description: '检测到危险DOM操作',
    },
    {
      pattern: /setInterval\s*\(/i,
      risk: 'medium',
      category: '资源消耗',
      description: '检测到定时器使用',
    },
    {
      pattern: /import\s*\(|require\s*\(/i,
      risk: 'high',
      category: '模块加载',
      description: '检测到动态模块加载',
    },
  ];

  /**
   * 执行审计评级
   */
  audit(riskAssessment: RiskAssessment): MikeAuditResult {
    const securityRisks: string[] = [];
    let totalRiskScore = 0;

    // 根据风险等级分配基础分
    const levelScores: Record<string, number> = {
      low: 10,
      medium: 30,
      high: 60,
      critical: 100,
    };
    totalRiskScore += levelScores[riskAssessment.level] || 0;

    // 统计具体风险
    for (const warning of riskAssessment.warnings) {
      securityRisks.push(warning);
    }

    for (const api of riskAssessment.blockedAPIs) {
      securityRisks.push(`使用了被阻止的API: ${api}`);
    }

    // 计算评级
    let rating: MikeAuditResult['rating'];
    let auditScore: number;

    if (totalRiskScore >= 80) {
      rating = 'F';
      auditScore = 0;
    } else if (totalRiskScore >= 60) {
      rating = 'D';
      auditScore = 40;
    } else if (totalRiskScore >= 40) {
      rating = 'C';
      auditScore = 60;
    } else if (totalRiskScore >= 20) {
      rating = 'B';
      auditScore = 80;
    } else {
      rating = 'A';
      auditScore = 100;
    }

    // 生成建议
    const recommendations = this.generateRecommendations(riskAssessment);

    return {
      rating,
      score: auditScore,
      securityRisks: [...new Set(securityRisks)],
      recommendations,
      auditLevel: this.auditLevel,
    };
  }

  /**
   * 获取治理检查结果
   */
  getGovernanceCheck(riskAssessment: RiskAssessment): GovernanceCheckResult {
    const audit = this.audit(riskAssessment);
    const passed = audit.rating !== 'F' && audit.rating !== 'D';

    return {
      type: 'mike_audit',
      passed,
      role: 'mike',
      score: audit.score,
      message: passed
        ? `Mike审计通过(评级: ${audit.rating}, 得分: ${audit.score})`
        : `Mike审计未通过(评级: ${audit.rating}, 得分: ${audit.score})`,
      details: {
        rating: audit.rating,
        riskCount: audit.securityRisks.length,
        recommendationCount: audit.recommendations.length,
      },
    };
  }

  /**
   * 设置审计级别
   */
  setAuditLevel(level: 'basic' | 'standard' | 'strict'): void {
    this.auditLevel = level;
  }

  /**
   * 生成安全建议
   */
  private generateRecommendations(riskAssessment: RiskAssessment): string[] {
    const recommendations: string[] = [];

    if (riskAssessment.level === 'critical' || riskAssessment.level === 'high') {
      recommendations.push('建议在受控环境中执行此代码');
      recommendations.push('考虑使用更严格的沙盒隔离');
    }

    if (riskAssessment.blockedAPIs.length > 0) {
      recommendations.push('移除或替换被阻止的API调用');
    }

    if (riskAssessment.warnings.some(w => w.includes('循环'))) {
      recommendations.push('添加循环退出条件防止无限循环');
    }

    if (riskAssessment.warnings.some(w => w.includes('eval') || w.includes('Function'))) {
      recommendations.push('使用JSON.parse替代eval进行数据解析');
    }

    recommendations.push('定期审查代码安全最佳实践');

    return recommendations;
  }
}

// ============================================================================
// 七权治理集成器
// ============================================================================

/**
 * 七权治理集成 - 完整的治理流程管理
 */
export class SevenPowersGovernanceIntegration implements GovernanceAdapter {
  private proposalService: ProposalService;
  private voteService: VoteService;
  private pmChecker: PMLegislativeChecker;
  private qaChecker: QAComplianceChecker;
  private mikeAuditor: MikeAuditor;
  private auditLogs: AuditLogEntry[] = [];

  constructor(
    proposalService: ProposalService,
    voteService: VoteService
  ) {
    this.proposalService = proposalService;
    this.voteService = voteService;
    this.pmChecker = new PMLegislativeChecker();
    this.qaChecker = new QAComplianceChecker();
    this.mikeAuditor = new MikeAuditor();
  }

  /**
   * 执行完整的七权治理检查
   */
  async runFullGovernanceCheck(
    code: string,
    proposer: AgentRole,
    riskAssessment: RiskAssessment
  ): Promise<SevenPowersDecision> {
    const checks: GovernanceCheckResult[] = [];
    const reasons: string[] = [];

    // 1. PM立法检查
    const pmCheck = this.pmChecker.checkLegislative(code, proposer);
    checks.push(pmCheck);
    if (!pmCheck.passed) {
      reasons.push(pmCheck.message);
    }
    this.logAudit('pm_legislative', pmCheck);

    // 2. QA司规检查
    const qaCheck = this.qaChecker.getGovernanceCheck(code);
    checks.push(qaCheck);
    if (!qaCheck.passed) {
      reasons.push(qaCheck.message);
    }
    this.logAudit('qa_compliance', qaCheck);

    // 3. Mike审计评级
    const mikeCheck = this.mikeAuditor.getGovernanceCheck(riskAssessment);
    checks.push(mikeCheck);
    if (!mikeCheck.passed) {
      reasons.push(mikeCheck.message);
    }
    this.logAudit('mike_audit', mikeCheck);

    // 4. 投票阈值检查（初始状态）
    const voteCheck: GovernanceCheckResult = {
      type: 'vote_threshold',
      passed: false,
      role: 'system',
      score: 0,
      message: '等待七权投票',
      details: {
        requiredThreshold: VOTING_RULES.APPROVAL_THRESHOLD,
        requiredQuorum: VOTING_RULES.QUORUM,
      },
    };
    checks.push(voteCheck);

    // 计算总体得分
    const finalScore = checks.slice(0, 3).reduce((sum, c) => sum + c.score, 0) / 3;

    // 是否可以通过（前三项都通过）
    const preChecksPassed = checks.slice(0, 3).every(c => c.passed);

    return {
      proposalId: '', // 待创建提案后填充
      checks,
      overallPassed: preChecksPassed,
      finalScore,
      requiredVotes: VOTING_RULES.QUORUM,
      currentVotes: 0,
      approvalRate: 0,
      canExecute: false,
      reasons,
    };
  }

  /**
   * 创建治理提案（实现GovernanceAdapter接口）
   */
  async createProposal(request: CreateProposalRequest): Promise<Proposal> {
    // 只有PM可以创建提案
    if (request.proposer !== 'pm') {
      throw new Error('Only PM can create sandbox execution proposals');
    }

    // 创建提案
    const proposal = await this.voteService.createProposal(request, request.proposer);
    
    this.logAudit('proposal_created', {
      proposalId: proposal.id,
      title: proposal.title,
      proposer: proposal.proposer,
    });

    return proposal;
  }

  /**
   * 获取投票统计（实现GovernanceAdapter接口）
   */
  async getVoteStats(proposalId: string): Promise<VoteResult | null> {
    try {
      const stats = await this.voteService.getVoteStats(proposalId);
      return stats;
    } catch (error) {
      console.error('获取投票统计失败:', error);
      return null;
    }
  }

  /**
   * 投票（实现GovernanceAdapter接口）
   */
  async castVote(
    proposalId: string,
    voter: AgentRole,
    choice: 'approve' | 'reject' | 'abstain'
  ): Promise<VoteResult> {
    const result = await this.voteService.vote(proposalId, voter, choice);
    
    this.logAudit('vote_cast', {
      proposalId,
      voter,
      choice,
      shouldExecute: result.shouldExecute,
      approvalRate: result.approvalRate,
    });

    return result;
  }

  /**
   * 检查是否可以执行
   */
  async canExecute(proposalId: string): Promise<boolean> {
    const stats = await this.getVoteStats(proposalId);
    if (!stats) return false;
    
    return stats.shouldExecute;
  }

  /**
   * 获取七权投票状态
   */
  async getSevenPowersStatus(proposalId: string): Promise<{
    voted: AgentRole[];
    pending: AgentRole[];
    voteDetails: Array<{
      role: AgentRole;
      choice: 'approve' | 'reject' | 'abstain';
      weight: number;
    }>;
  } | null> {
    const proposal = this.voteService.getProposal(proposalId);
    if (!proposal) return null;

    const voted = proposal.votes.map(v => v.voter);
    const pending = VOTABLE_ROLES.filter(r => !voted.includes(r));
    const voteDetails = proposal.votes.map(v => ({
      role: v.voter,
      choice: v.choice,
      weight: v.weight || ROLE_WEIGHTS[v.voter],
    }));

    return { voted, pending, voteDetails };
  }

  /**
   * 模拟七权自动投票（测试用）
   */
  async simulateSevenPowersVote(
    proposalId: string,
    votes: Record<AgentRole, 'approve' | 'reject' | 'abstain'>
  ): Promise<VoteResult> {
    let result: VoteResult | null = null;

    for (const [role, choice] of Object.entries(votes) as [AgentRole, 'approve' | 'reject' | 'abstain'][]) {
      if (VOTABLE_ROLES.includes(role)) {
        result = await this.castVote(proposalId, role, choice);
        
        // 如果已经达到执行条件，提前返回
        if (result.shouldExecute || result.shouldReject) {
          break;
        }
      }
    }

    if (!result) {
      throw new Error('没有有效的投票');
    }

    return result;
  }

  /**
   * 获取审计日志
   */
  getAuditLogs(): AuditLogEntry[] {
    return [...this.auditLogs];
  }

  /**
   * 清除审计日志
   */
  clearAuditLogs(): void {
    this.auditLogs = [];
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  private logAudit(category: string, data: unknown): void {
    const entry: AuditLogEntry = {
      timestamp: Date.now(),
      level: 'info',
      category: 'governance',
      message: `Governance: ${category}`,
      details: { category, data },
    };
    this.auditLogs.push(entry);
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 创建默认的治理集成实例
 */
export function createGovernanceIntegration(
  proposalService: ProposalService,
  voteService: VoteService
): SevenPowersGovernanceIntegration {
  return new SevenPowersGovernanceIntegration(proposalService, voteService);
}

/**
 * 快速检查代码是否需要治理审批
 */
export function requiresGovernance(code: string, riskThreshold: number = 20): boolean {
  const qaChecker = new QAComplianceChecker();
  const qaResult = qaChecker.checkCompliance(code);
  
  // 简单风险扫描
  const dangerousPatterns = [
    /eval\s*\(/i,
    /Function\s*\(/i,
    /while\s*\(\s*true\s*\)/i,
    /for\s*\(\s*;;\s*\)/i,
  ];
  
  let riskScore = 0;
  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      riskScore += 25;
    }
  }

  return riskScore >= riskThreshold || qaResult.score < 60;
}

/**
 * 计算治理评分
 */
export function calculateGovernanceScore(
  pmScore: number,
  qaScore: number,
  mikeScore: number,
  voteRate: number
): number {
  const weights = {
    pm: 0.25,
    qa: 0.25,
    mike: 0.30,
    vote: 0.20,
  };

  return Math.round(
    pmScore * weights.pm +
    qaScore * weights.qa +
    mikeScore * weights.mike +
    voteRate * 100 * weights.vote
  );
}

// 类已通过命名导出在上述代码中导出
