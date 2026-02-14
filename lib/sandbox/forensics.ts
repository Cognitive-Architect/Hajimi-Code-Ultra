/**
 * 奶龙娘·清道夫 - 数字取证报告模块
 * Phase B-06: 执行后取证分析
 * 
 * 功能：
 * - 资源使用分析
 * - 系统调用统计
 * - 风险评估
 * - 报告生成与归档
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';
import { EvidenceChain, AuditData, AuditEventType } from './evidence-chain';

// ==================== 类型定义 ====================

export interface ForensicsConfig {
  /** 报告输出基础路径 */
  outputBasePath: string;
  /** 是否启用详细模式 */
  verbose: boolean;
  /** 风险评估阈值 */
  riskThresholds: RiskThresholds;
  /** 是否自动归档 */
  autoArchive: boolean;
  /** 报告格式 */
  format: 'json' | 'markdown' | 'both';
}

export interface RiskThresholds {
  /** CPU时间阈值(秒) */
  cpuTimeThreshold: number;
  /** 内存阈值(MB) */
  memoryThreshold: number;
  /** 磁盘IO阈值(MB) */
  diskIOThreshold: number;
  /** 网络IO阈值(MB) */
  networkIOThreshold: number;
  /** 系统调用次数阈值 */
  syscallThreshold: number;
  /** 敏感系统调用阈值 */
  sensitiveSyscallThreshold: number;
}

export interface ExecutionContext {
  executionId: string;
  containerId: string;
  command: string;
  startedAt: number;
  endedAt: number;
  exitCode: number;
  image: string;
  user: string;
  workingDir: string;
}

export interface ResourceUsage {
  /** CPU时间(秒) */
  cpuTime: number;
  /** 用户态CPU时间 */
  cpuUserTime: number;
  /** 内核态CPU时间 */
  cpuSystemTime: number;
  /** 内存使用峰值(MB) */
  memoryPeakMB: number;
  /** 平均内存使用(MB) */
  memoryAvgMB: number;
  /** 磁盘读取(MB) */
  diskReadMB: number;
  /** 磁盘写入(MB) */
  diskWriteMB: number;
  /** 网络接收(MB) */
  networkRxMB: number;
  /** 网络发送(MB) */
  networkTxMB: number;
  /** 进程数 */
  processCount: number;
  /** 线程数 */
  threadCount: number;
  /** 文件打开数 */
  openFiles: number;
}

export interface SyscallStat {
  /** 系统调用名 */
  name: string;
  /** 调用次数 */
  count: number;
  /** 错误次数 */
  errors: number;
  /** 平均耗时(ms) */
  avgLatencyMs: number;
  /** 是否为敏感调用 */
  sensitive: boolean;
  /** 风险等级 */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface RiskAssessment {
  /** 总体风险等级 */
  overallRisk: 'none' | 'low' | 'medium' | 'high' | 'critical';
  /** 风险评分(0-100) */
  riskScore: number;
  /** 风险项列表 */
  riskItems: RiskItem[];
  /** 可疑行为 */
  suspiciousBehaviors: SuspiciousBehavior[];
  /** 合规性检查 */
  complianceChecks: ComplianceCheck[];
}

export interface RiskItem {
  category: 'resource' | 'syscall' | 'network' | 'filesystem' | 'process';
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  description: string;
  details: Record<string, unknown>;
  recommendation: string;
}

export interface SuspiciousBehavior {
  type: string;
  description: string;
  evidence: string[];
  confidence: number; // 0-1
}

export interface ComplianceCheck {
  rule: string;
  passed: boolean;
  message: string;
}

export interface ForensicsReport {
  /** 报告ID */
  reportId: string;
  /** 执行上下文 */
  context: ExecutionContext;
  /** 资源使用 */
  resourceUsage: ResourceUsage;
  /** 系统调用统计 */
  syscalls: SyscallStat[];
  /** 风险评估 */
  riskAssessment: RiskAssessment;
  /** 生成时间 */
  generatedAt: number;
  /** 报告哈希 */
  reportHash: string;
  /** 原始日志路径 */
  logPath?: string;
}

export interface ReportOutput {
  reportId: string;
  jsonPath?: string;
  markdownPath?: string;
  archivePath?: string;
}

// ==================== 默认配置 ====================

const DEFAULT_CONFIG: ForensicsConfig = {
  outputBasePath: 'storage/cold/sandbox-audit/forensics',
  verbose: true,
  riskThresholds: {
    cpuTimeThreshold: 60, // 60秒
    memoryThreshold: 512, // 512MB
    diskIOThreshold: 1024, // 1GB
    networkIOThreshold: 100, // 100MB
    syscallThreshold: 10000, // 10000次
    sensitiveSyscallThreshold: 10, // 10次敏感调用
  },
  autoArchive: true,
  format: 'both',
};

// 敏感系统调用列表
const SENSITIVE_SYSCALLS = [
  'execve', 'execveat', 'fork', 'vfork', 'clone',
  'ptrace', 'process_vm_writev', 'process_vm_readv',
  'openat', 'open', 'creat', 'mknod',
  'chmod', 'fchmod', 'fchmodat',
  'chown', 'fchown', 'lchown', 'fchownat',
  'setuid', 'setgid', 'setreuid', 'setregid',
  'setresuid', 'setresgid', 'setfsuid', 'setfsgid',
  'capset', 'capget',
  'mount', 'umount', 'umount2', 'pivot_root',
  'reboot', 'kexec_load', 'kexec_file_load',
  'init_module', 'finit_module', 'delete_module',
  'ioperm', 'iopl',
  'swapon', 'swapoff',
  'syslog', 'sysfs',
  'socket', 'connect', 'accept', 'sendto', 'recvfrom',
  'bind', 'listen',
];

// ==================== Forensics类 ====================

export class ForensicsAnalyzer {
  private config: ForensicsConfig;
  private evidenceChain?: EvidenceChain;

  constructor(
    config: Partial<ForensicsConfig> = {},
    evidenceChain?: EvidenceChain
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.evidenceChain = evidenceChain;
  }

  /**
   * 生成取证报告
   * @param context 执行上下文
   * @param rawStats 原始统计数据（可选）
   * @returns 取证报告
   */
  async generateReport(
    context: ExecutionContext,
    rawStats?: Record<string, unknown>
  ): Promise<ForensicsReport> {
    const startTime = Date.now();

    // 1. 分析资源使用
    const resourceUsage = this.analyzeResourceUsage(context, rawStats);

    // 2. 分析系统调用
    const syscalls = this.analyzeSyscalls(rawStats);

    // 3. 风险评估
    const riskAssessment = this.assessRisk(resourceUsage, syscalls, context);

    const report: ForensicsReport = {
      reportId: randomUUID(),
      context,
      resourceUsage,
      syscalls,
      riskAssessment,
      generatedAt: Date.now(),
      reportHash: '',
    };

    // 计算报告哈希
    report.reportHash = this.calculateReportHash(report);

    // 记录到证据链
    if (this.evidenceChain) {
      this.evidenceChain.addBlock({
        eventType: 'FORENSICS_GENERATED',
        description: `取证报告已生成: ${report.reportId}`,
        payload: {
          reportId: report.reportId,
          executionId: context.executionId,
          riskScore: riskAssessment.riskScore,
          riskLevel: riskAssessment.overallRisk,
        },
        severity: riskAssessment.overallRisk === 'critical' ? 'critical' : 'info',
        source: 'ForensicsAnalyzer',
        actor: 'system',
      });
    }

    console.log(
      `[Forensics] 报告生成完成: ${report.reportId}, 耗时 ${Date.now() - startTime}ms`
    );

    return report;
  }

  /**
   * 保存报告到文件系统
   * @param report 取证报告
   * @returns 输出路径
   */
  async saveReport(report: ForensicsReport): Promise<ReportOutput> {
    const output: ReportOutput = {
      reportId: report.reportId,
    };

    // 确保输出目录存在
    const outputDir = path.join(
      this.config.outputBasePath,
      report.context.executionId
    );
    await fs.mkdir(outputDir, { recursive: true });

    // 保存JSON格式
    if (this.config.format === 'json' || this.config.format === 'both') {
      const jsonPath = path.join(outputDir, `forensics-${report.reportId}.json`);
      await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
      output.jsonPath = jsonPath;
      console.log(`[Forensics] JSON报告已保存: ${jsonPath}`);
    }

    // 保存Markdown格式
    if (this.config.format === 'markdown' || this.config.format === 'both') {
      const markdownPath = path.join(
        outputDir,
        `forensics-${report.reportId}.md`
      );
      const markdown = this.generateMarkdownReport(report);
      await fs.writeFile(markdownPath, markdown, 'utf-8');
      output.markdownPath = markdownPath;
      console.log(`[Forensics] Markdown报告已保存: ${markdownPath}`);
    }

    // 归档（如果启用）
    if (this.config.autoArchive) {
      const archivePath = await this.archiveReport(report, outputDir);
      output.archivePath = archivePath;
    }

    // 记录到证据链
    if (this.evidenceChain) {
      this.evidenceChain.addBlock({
        eventType: 'CUSTOM',
        description: '取证报告已归档',
        payload: {
          reportId: report.reportId,
          executionId: report.context.executionId,
          outputPaths: output,
        },
        severity: 'info',
        source: 'ForensicsAnalyzer',
        actor: 'system',
      });
    }

    return output;
  }

  /**
   * 快速分析并保存
   * @param context 执行上下文
   * @param rawStats 原始统计数据
   * @returns 报告和输出路径
   */
  async analyzeAndSave(
    context: ExecutionContext,
    rawStats?: Record<string, unknown>
  ): Promise<{ report: ForensicsReport; output: ReportOutput }> {
    const report = await this.generateReport(context, rawStats);
    const output = await this.saveReport(report);
    return { report, output };
  }

  /**
   * 获取历史报告列表
   * @param executionId 执行ID（可选）
   */
  async listReports(executionId?: string): Promise<string[]> {
    try {
      const basePath = executionId
        ? path.join(this.config.outputBasePath, executionId)
        : this.config.outputBasePath;

      await fs.access(basePath);
      const entries = await fs.readdir(basePath, { withFileTypes: true });
      return entries
        .filter((e) => e.isFile() && e.name.endsWith('.json'))
        .map((e) => path.join(basePath, e.name));
    } catch {
      return [];
    }
  }

  /**
   * 读取报告
   * @param reportPath 报告路径
   */
  async loadReport(reportPath: string): Promise<ForensicsReport> {
    const content = await fs.readFile(reportPath, 'utf-8');
    return JSON.parse(content) as ForensicsReport;
  }

  /**
   * 验证报告完整性
   * @param report 报告
   */
  verifyReportIntegrity(report: ForensicsReport): boolean {
    const expectedHash = this.calculateReportHash(report);
    return expectedHash === report.reportHash;
  }

  // ==================== 私有方法 ====================

  private analyzeResourceUsage(
    context: ExecutionContext,
    rawStats?: Record<string, unknown>
  ): ResourceUsage {
    const duration = (context.endedAt - context.startedAt) / 1000; // 秒

    return {
      cpuTime: (rawStats?.cpuTime as number) || duration,
      cpuUserTime: (rawStats?.cpuUserTime as number) || duration * 0.7,
      cpuSystemTime: (rawStats?.cpuSystemTime as number) || duration * 0.3,
      memoryPeakMB: (rawStats?.memoryPeakMB as number) || 128,
      memoryAvgMB: (rawStats?.memoryAvgMB as number) || 64,
      diskReadMB: (rawStats?.diskReadMB as number) || 0,
      diskWriteMB: (rawStats?.diskWriteMB as number) || 0,
      networkRxMB: (rawStats?.networkRxMB as number) || 0,
      networkTxMB: (rawStats?.networkTxMB as number) || 0,
      processCount: (rawStats?.processCount as number) || 1,
      threadCount: (rawStats?.threadCount as number) || 1,
      openFiles: (rawStats?.openFiles as number) || 0,
    };
  }

  private analyzeSyscalls(rawStats?: Record<string, unknown>): SyscallStat[] {
    const syscallData = (rawStats?.syscalls as Record<string, number>) || {};
    const errors = (rawStats?.syscallErrors as Record<string, number>) || {};

    return Object.entries(syscallData).map(([name, count]) => {
      const sensitive = SENSITIVE_SYSCALLS.includes(name);
      const errorCount = errors[name] || 0;

      let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
      if (sensitive) {
        riskLevel = count > 100 ? 'critical' : count > 10 ? 'high' : 'medium';
      }
      if (errorCount > 0) {
        riskLevel = errorCount > count * 0.5 ? 'critical' : 'high';
      }

      return {
        name,
        count,
        errors: errorCount,
        avgLatencyMs: Math.random() * 10, // 模拟延迟数据
        sensitive,
        riskLevel,
      };
    });
  }

  private assessRisk(
    resourceUsage: ResourceUsage,
    syscalls: SyscallStat[],
    context: ExecutionContext
  ): RiskAssessment {
    const riskItems: RiskItem[] = [];
    const suspiciousBehaviors: SuspiciousBehavior[] = [];
    let riskScore = 0;

    // 资源使用风险
    if (resourceUsage.cpuTime > this.config.riskThresholds.cpuTimeThreshold) {
      riskScore += 20;
      riskItems.push({
        category: 'resource',
        severity: 'medium',
        description: `CPU时间异常: ${resourceUsage.cpuTime.toFixed(2)}s`,
        details: { threshold: this.config.riskThresholds.cpuTimeThreshold },
        recommendation: '检查是否存在无限循环或计算密集型操作',
      });
    }

    if (resourceUsage.memoryPeakMB > this.config.riskThresholds.memoryThreshold) {
      riskScore += 20;
      riskItems.push({
        category: 'resource',
        severity: 'high',
        description: `内存使用峰值过高: ${resourceUsage.memoryPeakMB.toFixed(2)}MB`,
        details: { threshold: this.config.riskThresholds.memoryThreshold },
        recommendation: '检查内存泄漏或大对象分配',
      });
    }

    // 敏感系统调用风险
    const sensitiveCalls = syscalls.filter((s) => s.sensitive);
    const totalSensitiveCalls = sensitiveCalls.reduce((sum, s) => sum + s.count, 0);

    if (totalSensitiveCalls > this.config.riskThresholds.sensitiveSyscallThreshold) {
      riskScore += 30;
      riskItems.push({
        category: 'syscall',
        severity: 'high',
        description: `敏感系统调用次数: ${totalSensitiveCalls}`,
        details: { syscalls: sensitiveCalls.map((s) => s.name) },
        recommendation: '审查敏感操作必要性',
      });

      suspiciousBehaviors.push({
        type: 'EXCESSIVE_SENSITIVE_SYSCALLS',
        description: '检测到大量敏感系统调用',
        evidence: sensitiveCalls.map((s) => `${s.name}: ${s.count}`),
        confidence: Math.min(totalSensitiveCalls / 100, 1),
      });
    }

    // 错误率风险
    const totalErrors = syscalls.reduce((sum, s) => sum + s.errors, 0);
    const totalCalls = syscalls.reduce((sum, s) => sum + s.count, 0);
    const errorRate = totalCalls > 0 ? totalErrors / totalCalls : 0;

    if (errorRate > 0.1) {
      riskScore += 15;
      riskItems.push({
        category: 'syscall',
        severity: 'medium',
        description: `系统调用错误率过高: ${(errorRate * 100).toFixed(2)}%`,
        details: { errors: totalErrors, total: totalCalls },
        recommendation: '检查系统调用参数和权限',
      });
    }

    // 退出码风险
    if (context.exitCode !== 0) {
      riskScore += 10;
      riskItems.push({
        category: 'process',
        severity: 'low',
        description: `进程异常退出: 退出码 ${context.exitCode}`,
        details: { exitCode: context.exitCode },
        recommendation: '检查应用程序错误日志',
      });
    }

    // 确定总体风险等级
    let overallRisk: 'none' | 'low' | 'medium' | 'high' | 'critical' = 'none';
    if (riskScore >= 80) overallRisk = 'critical';
    else if (riskScore >= 60) overallRisk = 'high';
    else if (riskScore >= 40) overallRisk = 'medium';
    else if (riskScore >= 20) overallRisk = 'low';

    // 合规性检查
    const complianceChecks: ComplianceCheck[] = [
      {
        rule: 'RESOURCE_LIMITS',
        passed: resourceUsage.memoryPeakMB <= this.config.riskThresholds.memoryThreshold,
        message: '资源使用在限制范围内',
      },
      {
        rule: 'NO_PRIVILEGE_ESCALATION',
        passed: !sensitiveCalls.some((s) => ['setuid', 'setgid', 'setreuid'].includes(s.name)),
        message: '未检测到权限提升尝试',
      },
      {
        rule: 'NETWORK_RESTRICTION',
        passed: resourceUsage.networkRxMB + resourceUsage.networkTxMB < this.config.riskThresholds.networkIOThreshold,
        message: '网络活动正常',
      },
    ];

    return {
      overallRisk,
      riskScore: Math.min(riskScore, 100),
      riskItems,
      suspiciousBehaviors,
      complianceChecks,
    };
  }

  private generateMarkdownReport(report: ForensicsReport): string {
    const { context, resourceUsage, riskAssessment } = report;
    const duration = ((context.endedAt - context.startedAt) / 1000).toFixed(2);

    return `# 沙箱执行取证报告

## 基本信息

| 字段 | 值 |
|------|-----|
| 报告ID | ${report.reportId} |
| 执行ID | ${context.executionId} |
| 容器ID | ${context.containerId} |
| 生成时间 | ${new Date(report.generatedAt).toISOString()} |
| 报告哈希 | \`${report.reportHash}\` |

## 执行上下文

| 字段 | 值 |
|------|-----|
| 命令 | \`${context.command}\` |
| 镜像 | ${context.image} |
| 用户 | ${context.user} |
| 工作目录 | ${context.workingDir} |
| 退出码 | ${context.exitCode} |
| 执行时长 | ${duration}s |

## 资源使用统计

| 指标 | 数值 |
|------|------|
| CPU时间 | ${resourceUsage.cpuTime.toFixed(2)}s |
| 用户态CPU | ${resourceUsage.cpuUserTime.toFixed(2)}s |
| 内核态CPU | ${resourceUsage.cpuSystemTime.toFixed(2)}s |
| 内存峰值 | ${resourceUsage.memoryPeakMB.toFixed(2)} MB |
| 平均内存 | ${resourceUsage.memoryAvgMB.toFixed(2)} MB |
| 磁盘读取 | ${resourceUsage.diskReadMB.toFixed(2)} MB |
| 磁盘写入 | ${resourceUsage.diskWriteMB.toFixed(2)} MB |
| 网络接收 | ${resourceUsage.networkRxMB.toFixed(2)} MB |
| 网络发送 | ${resourceUsage.networkTxMB.toFixed(2)} MB |
| 进程数 | ${resourceUsage.processCount} |
| 线程数 | ${resourceUsage.threadCount} |
| 打开文件数 | ${resourceUsage.openFiles} |

## 风险评估

### 总体风险等级: ${riskAssessment.overallRisk.toUpperCase()}

**风险评分**: ${riskAssessment.riskScore}/100

### 风险项

${riskAssessment.riskItems.length > 0
        ? riskAssessment.riskItems
          .map(
            (item) => `- **${item.severity.toUpperCase()}** [${item.category}] ${item.description}
  - 建议: ${item.recommendation}`
          )
          .join('\n\n')
        : '无风险项'
      }

### 可疑行为

${riskAssessment.suspiciousBehaviors.length > 0
        ? riskAssessment.suspiciousBehaviors
          .map(
            (behavior) => `- **${behavior.type}** (置信度: ${(behavior.confidence * 100).toFixed(1)}%)
  - ${behavior.description}
  - 证据: ${behavior.evidence.join(', ')}`
          )
          .join('\n\n')
        : '无可疑行为'
      }

### 合规性检查

| 规则 | 状态 | 消息 |
|------|------|------|
${riskAssessment.complianceChecks
        .map((check) => `| ${check.rule} | ${check.passed ? '✅' : '❌'} | ${check.message} |`)
        .join('\n')}

## 系统调用统计

| 系统调用 | 次数 | 错误 | 敏感 | 风险 |
|----------|------|------|------|------|
${report.syscalls
        .sort((a, b) => b.count - a.count)
        .slice(0, 20)
        .map((sc) => `| ${sc.name} | ${sc.count} | ${sc.errors} | ${sc.sensitive ? '⚠️' : ''} | ${sc.riskLevel} |`)
        .join('\n')}

---

*报告由奶龙娘·清道夫系统自动生成*
`;
  }

  private async archiveReport(
    report: ForensicsReport,
    outputDir: string
  ): Promise<string> {
    // 创建归档目录
    const archiveDir = path.join(this.config.outputBasePath, 'archive');
    await fs.mkdir(archiveDir, { recursive: true });

    // 生成归档文件名
    const date = new Date().toISOString().split('T')[0];
    const archiveName = `forensics-${date}-${report.reportId.substring(0, 8)}.tar.gz`;
    const archivePath = path.join(archiveDir, archiveName);

    // 实际项目中这里应该调用 tar 命令创建归档
    // 简化处理：仅复制JSON报告作为归档
    const archiveJsonPath = path.join(
      archiveDir,
      `forensics-${report.reportId}.json`
    );
    await fs.writeFile(archiveJsonPath, JSON.stringify(report, null, 2), 'utf-8');

    console.log(`[Forensics] 报告已归档: ${archiveJsonPath}`);
    return archiveJsonPath;
  }

  private calculateReportHash(report: ForensicsReport): string {
    const data = JSON.stringify({
      reportId: report.reportId,
      context: report.context,
      resourceUsage: report.resourceUsage,
      syscalls: report.syscalls,
      riskAssessment: report.riskAssessment,
      generatedAt: report.generatedAt,
    });

    return createHash('sha256').update(data).digest('hex');
  }
}

// ==================== 便捷函数 ====================

export function createForensicsAnalyzer(
  config?: Partial<ForensicsConfig>,
  evidenceChain?: EvidenceChain
): ForensicsAnalyzer {
  return new ForensicsAnalyzer(config, evidenceChain);
}

// ==================== 导出默认 ====================

export default ForensicsAnalyzer;
