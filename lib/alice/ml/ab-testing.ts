/**
 * Alice ML A/B测试框架
 * HAJIMI-ALICE-ML
 * 
 * 启发式 vs ML 模型对比、灰度发布
 * 
 * @module lib/alice/ml/ab-testing
 * @author 客服小祥 (Orchestrator) - B-06/09
 */

import { EventEmitter } from 'events';

export type TestGroup = 'control' | 'treatment' | 'heuristic';

export interface ABTestConfig {
  testId: string;
  controlRatio: number;
  treatmentRatio: number;
  durationDays: number;
  metrics: string[];
}

export interface TestMetrics {
  group: TestGroup;
  latency: number;
  accuracy: number;
  userSatisfaction: number;
  errorRate: number;
}

/**
 * A/B测试管理器
 */
export class AliceABTesting extends EventEmitter {
  private userGroup: Map<string, TestGroup> = new Map();
  private metrics: Map<string, TestMetrics[]> = new Map();
  private activeTests: Map<string, ABTestConfig> = new Map();

  /**
   * 分配用户到测试组
   */
  assignGroup(userId: string, testId: string): TestGroup {
    const key = `${testId}:${userId}`;
    
    if (this.userGroup.has(key)) {
      return this.userGroup.get(key)!;
    }

    const config = this.activeTests.get(testId);
    if (!config) return 'heuristic';

    // 一致性哈希分配
    const hash = this.hashCode(key);
    const total = config.controlRatio + config.treatmentRatio;
    const normalized = (hash % total + total) % total;
    
    const group: TestGroup = normalized < config.controlRatio ? 'control' : 'treatment';
    this.userGroup.set(key, group);
    
    return group;
  }

  /**
   * 记录指标
   */
  recordMetrics(testId: string, userId: string, data: Partial<TestMetrics>): void {
    const group = this.assignGroup(userId, testId);
    const key = `${testId}:${group}`;
    
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    
    this.metrics.get(key)!.push({
      group,
      latency: data.latency || 0,
      accuracy: data.accuracy || 0,
      userSatisfaction: data.userSatisfaction || 0,
      errorRate: data.errorRate || 0,
    });
  }

  /**
   * 获取测试结果
   */
  getTestResults(testId: string): {
    control: TestMetrics[];
    treatment: TestMetrics[];
    comparison: {
      latencyImprovement: number;
      accuracyImprovement: number;
    };
  } {
    const control = this.metrics.get(`${testId}:control`) || [];
    const treatment = this.metrics.get(`${testId}:treatment`) || [];
    
    const avg = (arr: TestMetrics[], key: keyof TestMetrics) => 
      arr.reduce((sum, m) => sum + (m[key] as number), 0) / arr.length || 0;
    
    return {
      control,
      treatment,
      comparison: {
        latencyImprovement: (avg(control, 'latency') - avg(treatment, 'latency')) / avg(control, 'latency'),
        accuracyImprovement: (avg(treatment, 'accuracy') - avg(control, 'accuracy')) / avg(control, 'accuracy'),
      },
    };
  }

  /**
   * 一键回退到启发式
   */
  rollbackToHeuristic(): void {
    this.activeTests.clear();
    this.userGroup.clear();
    this.emit('rollback', { to: 'heuristic', timestamp: Date.now() });
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }
}

export default AliceABTesting;
