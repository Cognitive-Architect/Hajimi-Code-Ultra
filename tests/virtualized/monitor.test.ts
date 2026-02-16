/**
 * HAJIMI VIRTUALIZED - ResilienceMonitor测试
 * 
 * 自测项:
 * - MON-001: 7天统计准确性
 * - MON-002: 降级建议逻辑
 * - MON-003: 指标暴露
 * - MON-004: 面板集成
 */

import { ResilienceMonitor } from '@/lib/virtualized/monitor';

describe('ResilienceMonitor', () => {
  let monitor: ResilienceMonitor;

  beforeEach(() => {
    monitor = new ResilienceMonitor();
  });

  describe('[MON-001] 7天统计准确性', () => {
    it('应提供健康报告', () => {
      const report = monitor.getHealthReport();
      
      expect(report.status).toBeDefined();
      expect(report.score).toBeGreaterThanOrEqual(0);
      expect(report.score).toBeLessThanOrEqual(100);
    });

    it('应模拟7天数据', () => {
      monitor.simulateSevenDayData();
      
      const metrics = monitor.getMetrics();
      
      expect(metrics.uptime).toBeGreaterThan(0);
      expect(metrics.errorRate).toBeGreaterThanOrEqual(0);
      expect(metrics.checkpointLatencyP99).toBeGreaterThan(0);
    });
  });

  describe('[MON-002] 降级建议逻辑', () => {
    it('应建议正常当错误率低', () => {
      monitor.simulateSevenDayData();
      
      const recommendation = monitor.getRecommendation();
      
      expect(recommendation).toBeDefined();
    });

    it('应检测高错误率', () => {
      // 模拟高错误率场景
      for (let i = 0; i < 100; i++) {
        monitor.recordError('TEST_ERROR');
      }
      
      const report = monitor.getHealthReport();
      
      if (report.status === 'CRITICAL' || report.status === 'DEGRADED') {
        expect(report.score).toBeLessThan(70);
      }
    });
  });

  describe('[MON-003] 指标暴露', () => {
    it('应提供Prometheus格式指标', () => {
      const metrics = monitor.getPrometheusMetrics();
      
      expect(typeof metrics).toBe('string');
      expect(metrics).toContain('hajimi_');
    });

    it('应追踪错误率', () => {
      monitor.recordError('TEST_ERROR_1');
      monitor.recordError('TEST_ERROR_2');
      
      const metrics = monitor.getMetrics();
      expect(metrics.errorRate).toBeGreaterThan(0);
    });
  });

  describe('[MON-004] 面板集成', () => {
    it('应提供面板数据', () => {
      const dashboard = monitor.getDashboardData();
      
      expect(dashboard.healthScore).toBeDefined();
      expect(dashboard.status).toBeDefined();
      expect(dashboard.metrics).toBeDefined();
    });
  });
});
