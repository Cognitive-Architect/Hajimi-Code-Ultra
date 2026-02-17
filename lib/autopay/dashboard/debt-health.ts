/**
 * Debt Health Dashboard Module
 * HAJIMI-PHASE2-IMPL-001 工单 B-06/06：路线F-AutoPay实现
 *
 * 功能：债务健康度计算、P0/P1/P2分级统计、趋势分析、可视化数据（JSON）
 * 自测点：PAY-001, PAY-002
 *
 * @module autopay/dashboard/debt-health
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

// =============================================================================
// 类型定义
// =============================================================================

export type DebtPriority = 'P0' | 'P1' | 'P2' | 'P3';

export interface Debt {
  id: string;
  priority: DebtPriority;
  description: string;
  file: string;
  line: number;
  createdAt?: string;
  estimatedEffort?: number; // 小时
  category?: string;
}

export interface DebtStatistics {
  p0: number;
  p1: number;
  p2: number;
  p3: number;
  total: number;
}

export interface TrendData {
  timestamp: string;
  score: number;
  debts: DebtStatistics;
}

export interface HealthScore {
  score: number;
  status: 'healthy' | 'degraded' | 'at-risk' | 'critical';
  color: string;
  breakdown: {
    p0Weight: number;
    p1Weight: number;
    p2Weight: number;
    p3Weight: number;
  };
}

export interface HealthReport {
  timestamp: string;
  score: HealthScore;
  statistics: DebtStatistics;
  debts: Debt[];
  trends: TrendData[];
  recommendations: string[];
  metadata: {
    scanDuration: number;
    filesScanned: number;
    version: string;
  };
}

export interface VisualizationData {
  type: 'heatmap' | 'trend' | 'distribution' | 'treemap';
  data: unknown;
  config: {
    title: string;
    colors: string[];
    thresholds?: number[];
  };
}

// =============================================================================
// 配置常量
// =============================================================================

const CONFIG = {
  // 健康度计算权重
  WEIGHTS: {
    P0: 50, // 阻塞性债务权重很高
    P1: 10,
    P2: 2,
    P3: 0.5,
  },
  // 健康度阈值
  THRESHOLDS: {
    HEALTHY: 80,
    DEGRADED: 60,
    AT_RISK: 40,
  },
  // 扫描配置
  SCAN: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.md'],
    excludeDirs: ['node_modules', '.git', '.next', 'dist', 'build', 'coverage'],
    patterns: [
      { regex: /DEBT[\s-]?([A-Z]+-\d+).*priority[\s:]?\s*(P[0-3])/i, type: 'debt' },
      { regex: /@debt\s+(P[0-3])\s+(.+)/i, type: 'debt' },
      { regex: /TODO.*debt[\s:]?\s*(P[0-3])?/i, type: 'todo' },
      { regex: /FIXME.*debt[\s:]?\s*(P[0-3])?/i, type: 'fixme' },
    ],
  },
  // 颜色配置
  COLORS: {
    healthy: '#4CAF50',
    degraded: '#FFC107',
    atRisk: '#FF9800',
    critical: '#F44336',
    p0: '#F44336',
    p1: '#FF9800',
    p2: '#FFC107',
    p3: '#4CAF50',
  },
};

// =============================================================================
// 核心类：债务健康计算器
// =============================================================================

export class DebtHealthCalculator {
  private debts: Debt[] = [];
  private scanStartTime: number = 0;
  private filesScanned: number = 0;

  /**
   * 扫描代码库中的债务标记
   * @param rootPath 扫描根目录
   * @returns 债务列表
   */
  async scanCodebase(rootPath: string = process.cwd()): Promise<Debt[]> {
    this.scanStartTime = Date.now();
    this.debts = [];
    this.filesScanned = 0;

    await this.scanDirectory(rootPath);

    // 按优先级排序
    const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
    this.debts.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return this.debts;
  }

  /**
   * 递归扫描目录
   */
  private async scanDirectory(dirPath: string): Promise<void> {
    const entries = await readdir(dirPath);

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      const entryStat = await stat(fullPath);

      if (entryStat.isDirectory()) {
        // 跳过排除目录
        if (CONFIG.SCAN.excludeDirs.includes(entry)) continue;
        await this.scanDirectory(fullPath);
      } else if (entryStat.isFile()) {
        // 检查文件扩展名
        const ext = path.extname(entry);
        if (CONFIG.SCAN.extensions.includes(ext)) {
          await this.scanFile(fullPath);
        }
      }
    }
  }

  /**
   * 扫描单个文件
   */
  private async scanFile(filePath: string): Promise<void> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      this.filesScanned++;

      lines.forEach((line, index) => {
        CONFIG.SCAN.patterns.forEach((pattern) => {
          const match = line.match(pattern.regex);
          if (match) {
            const priority = (match[2] || match[1] || 'P2') as DebtPriority;
            const debtId = match[1] && match[1].startsWith('P') 
              ? `DEBT-${Date.now()}-${index}` 
              : match[1];

            this.debts.push({
              id: debtId || `DEBT-AUTO-${this.debts.length}`,
              priority: this.normalizePriority(priority),
              description: line.trim(),
              file: filePath,
              line: index + 1,
              category: pattern.type,
            });
          }
        });
      });
    } catch (error) {
      // 忽略无法读取的文件
    }
  }

  /**
   * 标准化优先级
   */
  private normalizePriority(priority: string): DebtPriority {
    const normalized = priority.toUpperCase() as DebtPriority;
    if (['P0', 'P1', 'P2', 'P3'].includes(normalized)) {
      return normalized;
    }
    return 'P2';
  }

  /**
   * 计算债务统计
   */
  calculateStatistics(): DebtStatistics {
    const stats: DebtStatistics = {
      p0: this.debts.filter((d) => d.priority === 'P0').length,
      p1: this.debts.filter((d) => d.priority === 'P1').length,
      p2: this.debts.filter((d) => d.priority === 'P2').length,
      p3: this.debts.filter((d) => d.priority === 'P3').length,
      total: this.debts.length,
    };
    return stats;
  }

  /**
   * 计算健康度评分
   * 公式：100 - (P0*50 + P1*10 + P2*2 + P3*0.5)
   */
  calculateHealthScore(): HealthScore {
    const stats = this.calculateStatistics();

    const deduction =
      stats.p0 * CONFIG.WEIGHTS.P0 +
      stats.p1 * CONFIG.WEIGHTS.P1 +
      stats.p2 * CONFIG.WEIGHTS.P2 +
      stats.p3 * CONFIG.WEIGHTS.P3;

    let score = Math.max(0, 100 - deduction);
    score = Math.min(100, score);

    let status: HealthScore['status'];
    let color: string;

    if (score >= CONFIG.THRESHOLDS.HEALTHY) {
      status = 'healthy';
      color = CONFIG.COLORS.healthy;
    } else if (score >= CONFIG.THRESHOLDS.DEGRADED) {
      status = 'degraded';
      color = CONFIG.COLORS.degraded;
    } else if (score >= CONFIG.THRESHOLDS.AT_RISK) {
      status = 'at-risk';
      color = CONFIG.COLORS.atRisk;
    } else {
      status = 'critical';
      color = CONFIG.COLORS.critical;
    }

    return {
      score,
      status,
      color,
      breakdown: {
        p0Weight: stats.p0 * CONFIG.WEIGHTS.P0,
        p1Weight: stats.p1 * CONFIG.WEIGHTS.P1,
        p2Weight: stats.p2 * CONFIG.WEIGHTS.P2,
        p3Weight: stats.p3 * CONFIG.WEIGHTS.P3,
      },
    };
  }

  /**
   * 分析趋势
   */
  async analyzeTrend(days: number = 30): Promise<TrendData[]> {
    const trends: TrendData[] = [];
    const historyDir = path.join(process.cwd(), 'docs', 'debt-history');

    try {
      const files = await readdir(historyDir);
      const jsonFiles = files.filter((f) => f.endsWith('.json')).sort().slice(-days);

      for (const file of jsonFiles) {
        const content = await readFile(path.join(historyDir, file), 'utf-8');
        const data = JSON.parse(content);

        trends.push({
          timestamp: data.timestamp || file.replace('.json', ''),
          score: data.score || 0,
          debts: data.debts || { p0: 0, p1: 0, p2: 0, p3: 0, total: 0 },
        });
      }
    } catch (error) {
      // 历史数据不存在，返回空数组
    }

    return trends;
  }

  /**
   * 生成建议
   */
  generateRecommendations(): string[] {
    const stats = this.calculateStatistics();
    const recommendations: string[] = [];

    if (stats.p0 > 0) {
      recommendations.push(`🚨 立即处理 ${stats.p0} 个P0阻塞性债务`);
      recommendations.push('📋 创建紧急清偿计划并分配资源');
    }

    if (stats.p1 > 5) {
      recommendations.push(`⚠️ P1债务过高(${stats.p1})，建议本季度清偿50%`);
    }

    if (stats.total > 50) {
      recommendations.push('📊 债务总量过大，考虑增加清偿迭代');
    }

    if (stats.p2 > stats.p1 * 2) {
      recommendations.push('💡 P2债务堆积，建议升级部分为P1');
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ 债务状况良好，继续保持！');
    }

    return recommendations;
  }

  /**
   * 生成完整健康报告
   */
  async generateReport(): Promise<HealthReport> {
    const scanDuration = Date.now() - this.scanStartTime;
    const score = this.calculateHealthScore();
    const stats = this.calculateStatistics();
    const trends = await this.analyzeTrend();
    const recommendations = this.generateRecommendations();

    return {
      timestamp: new Date().toISOString(),
      score,
      statistics: stats,
      debts: this.debts,
      trends,
      recommendations,
      metadata: {
        scanDuration,
        filesScanned: this.filesScanned,
        version: '1.0.0',
      },
    };
  }

  /**
   * 生成可视化数据
   */
  generateVisualization(type: VisualizationData['type']): VisualizationData {
    const stats = this.calculateStatistics();

    switch (type) {
      case 'heatmap':
        return {
          type: 'heatmap',
          data: {
            cells: [
              { priority: 'P0', count: stats.p0, color: CONFIG.COLORS.p0 },
              { priority: 'P1', count: stats.p1, color: CONFIG.COLORS.p1 },
              { priority: 'P2', count: stats.p2, color: CONFIG.COLORS.p2 },
              { priority: 'P3', count: stats.p3, color: CONFIG.COLORS.p3 },
            ],
          },
          config: {
            title: 'Debt Heatmap',
            colors: [CONFIG.COLORS.p0, CONFIG.COLORS.p1, CONFIG.COLORS.p2, CONFIG.COLORS.p3],
          },
        };

      case 'distribution':
        return {
          type: 'distribution',
          data: [
            { name: 'P0', value: stats.p0 },
            { name: 'P1', value: stats.p1 },
            { name: 'P2', value: stats.p2 },
            { name: 'P3', value: stats.p3 },
          ],
          config: {
            title: 'Debt Distribution',
            colors: [CONFIG.COLORS.p0, CONFIG.COLORS.p1, CONFIG.COLORS.p2, CONFIG.COLORS.p3],
          },
        };

      case 'treemap':
        return {
          type: 'treemap',
          data: this.debts.reduce((acc, debt) => {
            const category = debt.category || 'uncategorized';
            if (!acc[category]) acc[category] = [];
            acc[category].push(debt);
            return acc;
          }, {} as Record<string, Debt[]>),
          config: {
            title: 'Debt by Category',
            colors: Object.values(CONFIG.COLORS),
          },
        };

      default:
        return {
          type: 'trend',
          data: [],
          config: {
            title: 'Debt Trend',
            colors: [CONFIG.COLORS.healthy, CONFIG.COLORS.critical],
          },
        };
    }
  }
}

// =============================================================================
// 便捷函数
// =============================================================================

let calculator: DebtHealthCalculator | null = null;

/**
 * 获取全局计算器实例
 */
export function getCalculator(): DebtHealthCalculator {
  if (!calculator) {
    calculator = new DebtHealthCalculator();
  }
  return calculator;
}

/**
 * 计算债务健康度（便捷函数）
 */
export async function calculateHealth(rootPath?: string): Promise<HealthReport> {
  const calc = getCalculator();
  await calc.scanCodebase(rootPath);
  return calc.generateReport();
}

/**
 * 快速扫描（不生成完整报告）
 */
export async function quickScan(rootPath?: string): Promise<DebtStatistics> {
  const calc = getCalculator();
  await calc.scanCodebase(rootPath);
  return calc.calculateStatistics();
}

/**
 * 导出报告到JSON文件
 */
export async function exportReport(
  report: HealthReport,
  outputPath: string
): Promise<void> {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
}

export default DebtHealthCalculator;
