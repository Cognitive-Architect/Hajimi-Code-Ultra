/**
 * PerformanceTuner Pattern
 * 
 * 黄瓜睦专属装备 - 性能优化
 * 
 * @pattern PerformanceTuner
 * @role ARCHITECT
 * @version 1.3.0
 */

import { Pattern } from '../types';

export const PerformanceTunerPattern: Pattern = {
  name: 'PerformanceTuner',
  version: '1.3.0',
  trigger: 'performance_check',
  description: '黄瓜睦性能调优 - 分析性能瓶颈并提供优化建议',
  role: 'ARCHITECT',
  
  async action(context: unknown) {
    const { metrics, code } = context as { 
      metrics: { latency: number; memory: number; cpu: number };
      code: string;
    };
    
    const suggestions: Array<{
      type: 'algorithm' | 'memory' | 'async' | 'caching';
      priority: 'high' | 'medium' | 'low';
      issue: string;
      suggestion: string;
      estimatedImprovement: string;
    }> = [];

    // 延迟分析
    if (metrics.latency > 100) {
      suggestions.push({
        type: 'async',
        priority: 'high',
        issue: '响应延迟过高',
        suggestion: '考虑使用异步处理和缓存',
        estimatedImprovement: '-50% latency',
      });
    }

    // 内存分析
    if (metrics.memory > 100 * 1024 * 1024) {
      suggestions.push({
        type: 'memory',
        priority: 'medium',
        issue: '内存使用超过100MB',
        suggestion: '检查内存泄漏，使用对象池',
        estimatedImprovement: '-30% memory',
      });
    }

    // 代码分析
    if (code.includes('for.*for')) {
      suggestions.push({
        type: 'algorithm',
        priority: 'high',
        issue: '发现嵌套循环',
        suggestion: '考虑使用Map/Set优化查找',
        estimatedImprovement: '-70% time complexity',
      });
    }

    return {
      pattern: 'PerformanceTuner',
      currentMetrics: metrics,
      suggestions,
      overallScore: Math.max(0, 100 - suggestions.filter((s) => s.priority === 'high').length * 15),
      easterEgg: '睦...仔细分析过了...',
    };
  },

  debts: [
    {
      id: 'FAB-PT-001',
      priority: 'P1',
      description: '集成真实性能分析工具',
    },
  ],

  mutex: [],
  config: {
    latencyThreshold: 100,
    memoryThreshold: 100 * 1024 * 1024,
  },
};

export default PerformanceTunerPattern;
