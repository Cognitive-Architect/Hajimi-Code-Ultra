/**
 * 数字取证报告模块测试
 */

import { ForensicsAnalyzer, ExecutionContext, ForensicsConfig } from '../../lib/sandbox/forensics';
import { EvidenceChain } from '../../lib/sandbox/evidence-chain';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('ForensicsAnalyzer - 数字取证模块', () => {
  let analyzer: ForensicsAnalyzer;
  let evidenceChain: EvidenceChain;
  let tempOutputPath: string;

  const mockContext: ExecutionContext = {
    executionId: 'test-exec-forensics-001',
    containerId: 'container-abc123',
    command: 'node test.js',
    startedAt: Date.now() - 5000,
    endedAt: Date.now(),
    exitCode: 0,
    image: 'sandbox:latest',
    user: 'sandbox-user',
    workingDir: '/app',
  };

  beforeEach(async () => {
    tempOutputPath = path.join(os.tmpdir(), `forensics-test-${Date.now()}`);
    await fs.mkdir(tempOutputPath, { recursive: true });

    evidenceChain = new EvidenceChain({ chainId: 'test-forensics-chain' });
    analyzer = new ForensicsAnalyzer(
      {
        outputBasePath: tempOutputPath,
        verbose: true,
        autoArchive: false,
        format: 'json',
      },
      evidenceChain
    );
  });

  afterEach(async () => {
    try {
      await fs.rm(tempOutputPath, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  describe('报告生成', () => {
    it('应生成包含所有必要字段的取证报告', async () => {
      const report = await analyzer.generateReport(mockContext);

      expect(report).toBeDefined();
      expect(report.reportId).toBeDefined();
      expect(report.reportId.length).toBeGreaterThan(0);
      expect(report.context).toEqual(mockContext);
      expect(report.resourceUsage).toBeDefined();
      expect(report.syscalls).toBeDefined();
      expect(report.riskAssessment).toBeDefined();
      expect(report.generatedAt).toBeGreaterThan(0);
      expect(report.reportHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('应正确计算资源使用统计', async () => {
      const rawStats = {
        cpuTime: 10.5,
        memoryPeakMB: 256,
        memoryAvgMB: 128,
        diskReadMB: 50,
        diskWriteMB: 25,
        networkRxMB: 10,
        networkTxMB: 5,
        processCount: 3,
        threadCount: 6,
        openFiles: 12,
      };

      const report = await analyzer.generateReport(mockContext, rawStats);

      expect(report.resourceUsage.cpuTime).toBe(10.5);
      expect(report.resourceUsage.memoryPeakMB).toBe(256);
      expect(report.resourceUsage.memoryAvgMB).toBe(128);
      expect(report.resourceUsage.diskReadMB).toBe(50);
      expect(report.resourceUsage.diskWriteMB).toBe(25);
      expect(report.resourceUsage.processCount).toBe(3);
    });

    it('应进行风险评估', async () => {
      const rawStats = {
        cpuTime: 100, // 超过阈值
        memoryPeakMB: 1024, // 超过阈值
        syscalls: {
          execve: 50, // 敏感调用
          openat: 200,
          read: 1000,
        },
        syscallErrors: {
          openat: 10, // 有错误
        },
      };

      const report = await analyzer.generateReport(mockContext, rawStats);

      expect(report.riskAssessment).toBeDefined();
      expect(report.riskAssessment.riskScore).toBeGreaterThan(0);
      expect(report.riskAssessment.overallRisk).toBeDefined();
      expect(report.riskAssessment.riskItems.length).toBeGreaterThan(0);
      expect(report.riskAssessment.complianceChecks.length).toBeGreaterThan(0);
    });

    it('应记录取证报告生成到证据链', async () => {
      const initialBlockCount = evidenceChain.getBlockCount();

      await analyzer.generateReport(mockContext);

      const newBlockCount = evidenceChain.getBlockCount();
      expect(newBlockCount).toBe(initialBlockCount + 1);

      const latestBlock = evidenceChain.getLatestBlock();
      expect(latestBlock.data.eventType).toBe('FORENSICS_GENERATED');
      expect(latestBlock.data.source).toBe('ForensicsAnalyzer');
    });
  });

  describe('报告保存', () => {
    it('应将报告保存为JSON文件', async () => {
      const report = await analyzer.generateReport(mockContext);
      const output = await analyzer.saveReport(report);

      expect(output.jsonPath).toBeDefined();
      expect(output.reportId).toBe(report.reportId);

      // 验证文件存在
      const fileContent = await fs.readFile(output.jsonPath!, 'utf-8');
      const loadedReport = JSON.parse(fileContent);
      expect(loadedReport.reportId).toBe(report.reportId);
      expect(loadedReport.reportHash).toBe(report.reportHash);
    });

    it('应验证报告完整性', async () => {
      const report = await analyzer.generateReport(mockContext);
      const isValid = analyzer.verifyReportIntegrity(report);

      expect(isValid).toBe(true);
    });

    it('应检测到篡改的报告', async () => {
      const report = await analyzer.generateReport(mockContext);
      
      // 篡改报告
      (report as any).resourceUsage.cpuTime = 99999;

      const isValid = analyzer.verifyReportIntegrity(report);
      expect(isValid).toBe(false);
    });

    it('应支持analyzeAndSave快捷方法', async () => {
      const { report, output } = await analyzer.analyzeAndSave(mockContext);

      expect(report).toBeDefined();
      expect(output.jsonPath).toBeDefined();

      const fileContent = await fs.readFile(output.jsonPath!, 'utf-8');
      const loadedReport = JSON.parse(fileContent);
      expect(loadedReport.reportId).toBe(report.reportId);
    });
  });

  describe('报告查询', () => {
    it('应能列出历史报告', async () => {
      const report = await analyzer.generateReport(mockContext);
      await analyzer.saveReport(report);

      const reports = await analyzer.listReports(mockContext.executionId);
      expect(reports.length).toBeGreaterThan(0);
    });

    it('应能加载指定报告', async () => {
      const report = await analyzer.generateReport(mockContext);
      const output = await analyzer.saveReport(report);

      const loadedReport = await analyzer.loadReport(output.jsonPath!);
      expect(loadedReport.reportId).toBe(report.reportId);
      expect(loadedReport.context.executionId).toBe(mockContext.executionId);
    });
  });

  describe('风险等级评估', () => {
    it('应评估低风险执行', async () => {
      const lowRiskContext = {
        ...mockContext,
        exitCode: 0,
      };

      const report = await analyzer.generateReport(lowRiskContext, {
        cpuTime: 1,
        memoryPeakMB: 64,
        syscalls: { read: 100, write: 50 },
      });

      expect(report.riskAssessment.overallRisk).toBe('none');
      expect(report.riskAssessment.riskScore).toBeLessThan(20);
    });

    it('应评估高风险执行', async () => {
      const highRiskContext = {
        ...mockContext,
        exitCode: 1,
      };

      const report = await analyzer.generateReport(highRiskContext, {
        cpuTime: 1000,
        memoryPeakMB: 2048,
        syscalls: {
          execve: 500, // 大量敏感调用
          setuid: 10,  // 权限提升
          ptrace: 5,   // 调试调用
        },
        syscallErrors: {
          execve: 50,
        },
      });

      expect(['medium', 'high', 'critical']).toContain(report.riskAssessment.overallRisk);
      expect(report.riskAssessment.riskScore).toBeGreaterThan(20);
      expect(report.riskAssessment.suspiciousBehaviors.length).toBeGreaterThan(0);
    });
  });
});
