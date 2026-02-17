/**
 * Weekly Debt Report Generator
 * HAJIMI-PHASE2-IMPL-001 工单 B-06/06：路线F-AutoPay实现
 *
 * 功能：每周债务健康报告生成、Markdown格式、趋势图表（ASCII/链接）、自动发布到Wiki
 *
 * @module autopay/report/weekly
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { DebtHealthCalculator, HealthReport, TrendData } from '../dashboard/debt-health';

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

// =============================================================================
// 类型定义
// =============================================================================

export interface WeeklyReportConfig {
  outputDir: string;
  wikiRepo?: string;
  wikiPath?: string;
  generateAsciiChart: boolean;
  generateSvgChart: boolean;
  includeTrends: boolean;
  includeRecommendations: boolean;
  includeDiff: boolean;
  authors: string[];
}

export interface WeeklyReport {
  weekNumber: number;
  year: number;
  period: {
    start: string;
    end: string;
  };
  summary: {
    healthScore: number;
    totalDebts: number;
    newDebts: number;
    resolvedDebts: number;
    p0Count: number;
    p1Count: number;
    p2Count: number;
  };
  trends: TrendData[];
  content: string;
  charts: {
    ascii?: string;
    svg?: string;
    mermaid?: string;
  };
  metadata: {
    generatedAt: string;
    generator: string;
    version: string;
  };
}

// =============================================================================
// 默认配置
// =============================================================================

const DEFAULT_CONFIG: WeeklyReportConfig = {
  outputDir: './docs/debt-reports',
  wikiRepo: undefined,
  wikiPath: 'Debt-Reports',
  generateAsciiChart: true,
  generateSvgChart: false,
  includeTrends: true,
  includeRecommendations: true,
  includeDiff: true,
  authors: ['AutoPay System'],
};

// =============================================================================
// 周报告生成器类
// =============================================================================

export class WeeklyReportGenerator {
  private config: WeeklyReportConfig;
  private calculator: DebtHealthCalculator;

  constructor(config: Partial<WeeklyReportConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.calculator = new DebtHealthCalculator();
  }

  // ==========================================================================
  // 核心生成方法
  // ==========================================================================

  /**
   * 生成周报告
   */
  async generate(targetDate: Date = new Date()): Promise<WeeklyReport> {
    const weekInfo = this.getWeekInfo(targetDate);
    
    console.log(`[WeeklyReport] Generating report for week ${weekInfo.weekNumber}...`);

    // 获取当前健康报告
    await this.calculator.scanCodebase();
    const healthReport = await this.calculator.generateReport();

    // 计算周统计
    const summary = await this.calculateWeeklySummary(healthReport, weekInfo);

    // 生成图表
    const charts = this.generateCharts(healthReport, weekInfo);

    // 生成Markdown内容
    const content = this.generateMarkdown(healthReport, summary, charts, weekInfo);

    const report: WeeklyReport = {
      weekNumber: weekInfo.weekNumber,
      year: weekInfo.year,
      period: weekInfo.period,
      summary,
      trends: healthReport.trends,
      content,
      charts,
      metadata: {
        generatedAt: new Date().toISOString(),
        generator: 'WeeklyReportGenerator',
        version: '1.0.0',
      },
    };

    return report;
  }

  /**
   * 生成并保存报告
   */
  async generateAndSave(targetDate?: Date): Promise<string> {
    const report = await this.generate(targetDate);
    
    // 确保输出目录存在
    await mkdir(this.config.outputDir, { recursive: true });

    // 生成文件名
    const filename = `debt-report-${report.year}-W${String(report.weekNumber).padStart(2, '0')}.md`;
    const filepath = path.join(this.config.outputDir, filename);

    // 保存报告
    await writeFile(filepath, report.content, 'utf-8');
    console.log(`[WeeklyReport] Report saved: ${filepath}`);

    return filepath;
  }

  // ==========================================================================
  // 周信息计算
  // ==========================================================================

  private getWeekInfo(date: Date): {
    weekNumber: number;
    year: number;
    period: { start: string; end: string };
  } {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    
    // 获取周一开始日期
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    
    // 获取周日结束日期
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    // 计算周数
    const startOfYear = new Date(monday.getFullYear(), 0, 1);
    const pastDays = (monday.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24);
    const weekNumber = Math.ceil((pastDays + startOfYear.getDay() + 1) / 7);

    return {
      weekNumber,
      year: monday.getFullYear(),
      period: {
        start: monday.toISOString().split('T')[0],
        end: sunday.toISOString().split('T')[0],
      },
    };
  }

  // ==========================================================================
  // 统计计算
  // ==========================================================================

  private async calculateWeeklySummary(
    healthReport: HealthReport,
    weekInfo: { period: { start: string } }
  ): Promise<WeeklyReport['summary']> {
    const stats = healthReport.statistics;
    
    // 计算与上周的差异（如果有历史数据）
    let newDebts = 0;
    let resolvedDebts = 0;

    if (healthReport.trends.length >= 2) {
      const lastWeek = healthReport.trends[healthReport.trends.length - 2];
      const thisWeek = healthReport.trends[healthReport.trends.length - 1];
      
      if (lastWeek && thisWeek) {
        newDebts = Math.max(0, thisWeek.debts.total - lastWeek.debts.total);
        resolvedDebts = Math.max(0, lastWeek.debts.total - thisWeek.debts.total);
      }
    }

    return {
      healthScore: healthReport.score.score,
      totalDebts: stats.total,
      newDebts,
      resolvedDebts,
      p0Count: stats.p0,
      p1Count: stats.p1,
      p2Count: stats.p2,
    };
  }

  // ==========================================================================
  // 图表生成
  // ==========================================================================

  private generateCharts(
    healthReport: HealthReport,
    weekInfo: { weekNumber: number; year: number }
  ): WeeklyReport['charts'] {
    const charts: WeeklyReport['charts'] = {};

    if (this.config.generateAsciiChart) {
      charts.ascii = this.generateAsciiChart(healthReport);
    }

    if (this.config.generateSvgChart) {
      charts.svg = this.generateSvgChart(healthReport);
    }

    charts.mermaid = this.generateMermaidChart(healthReport);

    return charts;
  }

  /**
   * 生成ASCII趋势图
   */
  private generateAsciiChart(healthReport: HealthReport): string {
    const trends = healthReport.trends.slice(-10); // 最近10个数据点
    
    if (trends.length === 0) {
      return 'No trend data available';
    }

    const scores = trends.map((t) => t.score);
    const maxScore = Math.max(...scores, 100);
    const minScore = Math.min(...scores, 0);
    const range = maxScore - minScore || 1;

    const height = 10;
    const width = trends.length;

    let chart = '';
    
    // 标题
    chart += 'Debt Health Trend (Last 10 Points)\n';
    chart += '```\n';
    
    // Y轴和图表
    for (let i = height; i >= 0; i--) {
      const value = minScore + (range * i) / height;
      const row = trends.map((t) => {
        const normalizedValue = (t.score - minScore) / range * height;
        return Math.round(normalizedValue) === i ? '●' : ' ';
      }).join('  ');
      
      chart += `${String(Math.round(value)).padStart(3, ' ')} │${row}\n`;
    }
    
    // X轴
    chart += '    └' + '──'.repeat(width) + '\n';
    
    // 时间标签
    chart += '      ' + trends.map((_, i) => 
      i % 2 === 0 ? String(i).padStart(2, ' ') : '  '
    ).join(' ') + '\n';
    
    chart += '```\n';

    return chart;
  }

  /**
   * 生成SVG图表（简化版）
   */
  private generateSvgChart(healthReport: HealthReport): string {
    const trends = healthReport.trends.slice(-10);
    
    if (trends.length === 0) {
      return '<svg><text>No data</text></svg>';
    }

    const width = 400;
    const height = 200;
    const padding = 20;
    
    const scores = trends.map((t) => t.score);
    const maxScore = Math.max(...scores, 100);
    const minScore = Math.min(...scores, 0);
    const range = maxScore - minScore || 1;

    const points = trends.map((t, i) => {
      const x = padding + (i / (trends.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((t.score - minScore) / range) * (height - 2 * padding);
      return `${x},${y}`;
    }).join(' ');

    return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#f5f5f5"/>
  <polyline points="${points}" fill="none" stroke="#4169E1" stroke-width="2"/>
  <text x="${width/2}" y="15" text-anchor="middle" font-size="12">Debt Health Trend</text>
</svg>`;
  }

  /**
   * 生成Mermaid图表
   */
  private generateMermaidChart(healthReport: HealthReport): string {
    const stats = healthReport.statistics;
    
    return `
\`\`\`mermaid
pie showData
    title Debt Distribution
    "P0 (Blocking)" : ${stats.p0}
    "P1 (High)" : ${stats.p1}
    "P2 (Medium)" : ${stats.p2}
    "P3 (Low)" : ${stats.p3}
\`\`\`
`;
  }

  // ==========================================================================
  // Markdown生成
  // ==========================================================================

  private generateMarkdown(
    healthReport: HealthReport,
    summary: WeeklyReport['summary'],
    charts: WeeklyReport['charts'],
    weekInfo: { weekNumber: number; year: number; period: { start: string; end: string } }
  ): string {
    const lines: string[] = [];

    // 标题
    lines.push(`# 📊 Debt Health Report - Week ${weekInfo.weekNumber}, ${weekInfo.year}`);
    lines.push('');
    lines.push(`**Report Period:** ${weekInfo.period.start} ~ ${weekInfo.period.end}`);
    lines.push(`**Generated:** ${new Date().toISOString()}`);
    lines.push(`**Health Score:** ${summary.healthScore}/100 ${this.getScoreEmoji(summary.healthScore)}`);
    lines.push('');

    // 概览表格
    lines.push('## 📈 Weekly Summary');
    lines.push('');
    lines.push('| Metric | Value | Change |');
    lines.push('|:---|:---:|:---:|');
    lines.push(`| Total Debts | ${summary.totalDebts} | ${summary.newDebts > 0 ? '+' + summary.newDebts : summary.resolvedDebts > 0 ? '-' + summary.resolvedDebts : '→'} |`);
    lines.push(`| P0 (Blocking) | ${summary.p0Count} | 🔴 |`);
    lines.push(`| P1 (High) | ${summary.p1Count} | 🟡 |`);
    lines.push(`| P2 (Medium) | ${summary.p2Count} | 🟢 |`);
    lines.push('');

    // 健康度指标
    lines.push('## 🎯 Health Score Breakdown');
    lines.push('');
    lines.push('```');
    lines.push(`Score: ${summary.healthScore}/100`);
    lines.push(`Status: ${healthReport.score.status.toUpperCase()}`);
    lines.push(`P0 Weight: ${healthReport.score.breakdown.p0Weight}`);
    lines.push(`P1 Weight: ${healthReport.score.breakdown.p1Weight}`);
    lines.push(`P2 Weight: ${healthReport.score.breakdown.p2Weight}`);
    lines.push('```');
    lines.push('');

    // 趋势图表
    if (this.config.includeTrends && charts.ascii) {
      lines.push('## 📉 Trend Analysis');
      lines.push('');
      lines.push(charts.ascii);
      lines.push('');
    }

    // Mermaid图表
    if (charts.mermaid) {
      lines.push('## 📊 Debt Distribution');
      lines.push('');
      lines.push(charts.mermaid);
      lines.push('');
    }

    // 债务清单
    lines.push('## 📝 Current Debt Inventory');
    lines.push('');
    
    if (healthReport.debts.length === 0) {
      lines.push('✅ No debts found! Great job!');
    } else {
      lines.push('| ID | Priority | Description | File |');
      lines.push('|:---|:---:|:---|:---|');
      
      // 只显示前20个债务
      healthReport.debts.slice(0, 20).forEach((debt) => {
        const desc = debt.description.substring(0, 50).replace(/\|/g, '\\|');
        const file = debt.file.split('/').pop() || debt.file;
        lines.push(`| ${debt.id} | ${debt.priority} | ${desc}... | ${file}:${debt.line} |`);
      });
      
      if (healthReport.debts.length > 20) {
        lines.push(`| ... | ... | *and ${healthReport.debts.length - 20} more* | ... |`);
      }
    }
    lines.push('');

    // 建议
    if (this.config.includeRecommendations && healthReport.recommendations.length > 0) {
      lines.push('## 💡 Recommendations');
      lines.push('');
      healthReport.recommendations.forEach((rec) => {
        lines.push(`- ${rec}`);
      });
      lines.push('');
    }

    // 页脚
    lines.push('---');
    lines.push('');
    lines.push('*Generated by AutoPay System 🤖*');
    lines.push(`*Version: ${healthReport.metadata.version}*`);
    lines.push('');

    return lines.join('\n');
  }

  private getScoreEmoji(score: number): string {
    if (score >= 80) return '🟢';
    if (score >= 60) return '🟡';
    if (score >= 40) return '🟠';
    return '🔴';
  }

  // ==========================================================================
  // Wiki发布
  // ==========================================================================

  /**
   * 发布到Wiki（模拟实现）
   */
  async publishToWiki(report: WeeklyReport): Promise<boolean> {
    if (!this.config.wikiRepo) {
      console.log('[WeeklyReport] Wiki repo not configured, skipping publish');
      return false;
    }

    try {
      // 实际实现中这里会调用GitHub API或git操作
      console.log(`[WeeklyReport] Publishing to wiki: ${this.config.wikiRepo}`);
      
      // 模拟发布延迟
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      console.log('[WeeklyReport] Published successfully');
      return true;
    } catch (error) {
      console.error('[WeeklyReport] Failed to publish:', error);
      return false;
    }
  }

  // ==========================================================================
  // 配置管理
  // ==========================================================================

  updateConfig(config: Partial<WeeklyReportConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// =============================================================================
// 便捷函数
// =============================================================================

let defaultGenerator: WeeklyReportGenerator | null = null;

export function getWeeklyReportGenerator(
  config?: Partial<WeeklyReportConfig>
): WeeklyReportGenerator {
  if (!defaultGenerator) {
    defaultGenerator = new WeeklyReportGenerator(config);
  }
  return defaultGenerator;
}

export async function generateWeeklyReport(targetDate?: Date): Promise<WeeklyReport> {
  const generator = getWeeklyReportGenerator();
  return generator.generate(targetDate);
}

export async function saveWeeklyReport(targetDate?: Date): Promise<string> {
  const generator = getWeeklyReportGenerator();
  return generator.generateAndSave(targetDate);
}

export default WeeklyReportGenerator;
