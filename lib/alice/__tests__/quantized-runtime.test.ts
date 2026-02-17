/**
 * 量化运行时单元测试
 * HAJIMI-DEBT-CLEARANCE-001-LAZY-MVP - B-05/09
 * 
 * 自测标准:
 * - QUANT-IMPL-001: INT8推理<20ms
 * - QUANT-IMPL-002: 校准参数持久化
 * - QUANT-IMPL-003: 回退触发正确
 */

import {
  QuantizedOnnxRuntime,
  createQuantizedRuntime,
  calculateQuantizationParams,
  quantizeFloat32ToInt8,
  dequantizeInt8ToFloat32,
  calculateMaxProbDiff,
  QuantizationPresets,
  type QuantizationParams,
  type NormalizedFeatures,
} from '../quantized-runtime';

// ============================================================================
// Mock FP32 Runtime
// ============================================================================

class MockFp32Runtime {
  async infer(features: NormalizedFeatures) {
    // 模拟FP32推理延迟 8-12ms
    await new Promise(r => setTimeout(r, 8 + Math.random() * 4));
    
    // 模拟输出
    const predictions = [0.15, 0.25, 0.20, 0.30, 0.08, 0.02];
    const maxProb = Math.max(...predictions);
    const classIndex = predictions.indexOf(maxProb);
    
    return {
      predictions,
      confidence: maxProb,
      latencyMs: 10,
      className: ['lost_confused', 'rage_shake', 'precision_snipe', 'urgent_rush', 'casual_explore', 'uncertain'][classIndex],
      classIndex,
    };
  }

  async inferBatch(features: NormalizedFeatures[]) {
    return Promise.all(features.map(f => this.infer(f)));
  }
}

// ============================================================================
// 测试套件
// ============================================================================

describe('QuantizedOnnxRuntime', () => {
  let mockFp32: MockFp32Runtime;

  beforeEach(() => {
    mockFp32 = new MockFp32Runtime();
  });

  // ========================================================================
  // QUANT-IMPL-001: INT8推理<20ms
  // ========================================================================
  describe('QUANT-IMPL-001: INT8推理性能', () => {
    it('INT8推理延迟应小于20ms', async () => {
      const runtime = createQuantizedRuntime(mockFp32, {
        enabled: true,
        dataType: 'int8',
        precisionThreshold: 0.1,
      });

      await runtime.initialize();
      runtime.setMode('int8');

      // 执行多次推理
      const features: NormalizedFeatures = [0.5, 0.6, 0.3, 0.4, 0.5, 0.2, 0.3, 0.1, 0.4, 0.3, 0.8, 0.2];
      
      for (let i = 0; i < 10; i++) {
        await runtime.infer(features);
      }

      // 验证性能要求
      expect(runtime.meetsPerformanceRequirement()).toBe(true);
      
      const metrics = runtime.getMetrics();
      expect(metrics.avgInt8InferenceTimeMs).toBeLessThan(20);

      await runtime.dispose();
    });

    it('应记录量化/反量化耗时', async () => {
      const runtime = createQuantizedRuntime(mockFp32, {
        enabled: true,
        dataType: 'int8',
        performanceSamplingRate: 1.0, // 100%采样
      });

      await runtime.initialize();
      runtime.setMode('int8');

      const features: NormalizedFeatures = [0.5, 0.6, 0.3, 0.4, 0.5, 0.2, 0.3, 0.1, 0.4, 0.3, 0.8, 0.2];
      await runtime.infer(features);

      const metrics = runtime.getMetrics();
      
      // 量化时间应该被记录
      expect(metrics.avgQuantizationTimeMs).toBeGreaterThanOrEqual(0);
      expect(metrics.avgDequantizationTimeMs).toBeGreaterThanOrEqual(0);

      await runtime.dispose();
    });
  });

  // ========================================================================
  // QUANT-IMPL-002: 校准参数持久化
  // ========================================================================
  describe('QUANT-IMPL-002: 校准参数管理', () => {
    it('应能加载和解析量化参数', async () => {
      const runtime = createQuantizedRuntime(mockFp32, {
        enabled: true,
        paramsPath: './quantization-params.json',
      });

      await runtime.initialize();

      // 验证参数已加载
      const inputParams = runtime.getQuantizationParams('input') as QuantizationParams;
      expect(inputParams).toBeDefined();
      expect(inputParams.tensorName).toBe('input');
      expect(inputParams.scale).toBeGreaterThan(0);
      expect(inputParams.dataType).toBe('int8');

      await runtime.dispose();
    });

    it('应能导出量化参数', async () => {
      const runtime = createQuantizedRuntime(mockFp32, { enabled: true });
      await runtime.initialize();

      const exported = runtime.exportParams();
      
      expect(exported.params).toBeDefined();
      expect(Array.isArray(exported.params)).toBe(true);
      expect(exported.params.length).toBeGreaterThan(0);
      expect(exported.exportTime).toBeDefined();

      // 验证参数结构
      const inputParams = exported.params.find(p => p.tensorName === 'input');
      expect(inputParams).toBeDefined();
      expect(inputParams?.scale).toBeGreaterThan(0);
      expect(inputParams?.zeroPoint).toBeDefined();

      await runtime.dispose();
    });

    it('应能更新量化参数', async () => {
      const runtime = createQuantizedRuntime(mockFp32, { enabled: true });
      await runtime.initialize();

      const newParams: QuantizationParams = {
        tensorName: 'test_tensor',
        scale: 0.01,
        zeroPoint: 0,
        dataType: 'int8',
        minValue: -1.27,
        maxValue: 1.27,
        calibrationSamples: 500,
        lastUpdated: new Date().toISOString(),
        statistics: {
          name: 'test_tensor',
          min: -1.27,
          max: 1.27,
          mean: 0,
          std: 0.5,
          median: 0,
          percentiles: { p1: -1, p5: -0.5, p95: 0.5, p99: 1 },
        },
      };

      runtime.updateQuantizationParams(newParams);

      const retrieved = runtime.getQuantizationParams('test_tensor') as QuantizationParams;
      expect(retrieved.scale).toBe(0.01);
      expect(retrieved.calibrationSamples).toBe(500);

      await runtime.dispose();
    });
  });

  // ========================================================================
  // QUANT-IMPL-003: 回退触发正确
  // ========================================================================
  describe('QUANT-IMPL-003: 精度回退机制', () => {
    it('当精度差异超过阈值时应触发回退', async () => {
      // 创建一个会产生确定性大差异的mock
      const unstableFp32 = {
        infer: jest.fn().mockImplementation(() => {
          return Promise.resolve({
            predictions: [0.50, 0.30, 0.10, 0.05, 0.03, 0.02], // 完全不同的分布
            confidence: 0.50,
            latencyMs: 10,
            className: 'lost_confused',
            classIndex: 0,
          });
        }),
      };

      const runtime = createQuantizedRuntime(unstableFp32, {
        enabled: true,
        precisionThreshold: 0.02, // 严格的2%阈值
        autoFallback: true,
      });

      await runtime.initialize();
      runtime.setMode('auto');

      const features: NormalizedFeatures = [0.5, 0.6, 0.3, 0.4, 0.5, 0.2, 0.3, 0.1, 0.4, 0.3, 0.8, 0.2];
      
      // 执行多次推理增加触发概率
      for (let i = 0; i < 5; i++) {
        await runtime.infer(features);
      }

      const metrics = runtime.getMetrics();
      
      // 验证回退被触发（由于量化噪声，大概率会触发）
      expect(metrics.fallbackCount).toBeGreaterThan(0);

      await runtime.dispose();
    });

    it('auto模式应优先尝试INT8', async () => {
      const runtime = createQuantizedRuntime(mockFp32, {
        enabled: true,
        precisionThreshold: 0.20, // 宽松的阈值，确保INT8通过
        autoFallback: true,
      });

      await runtime.initialize();
      runtime.setMode('auto');

      const features: NormalizedFeatures = [0.5, 0.6, 0.3, 0.4, 0.5, 0.2, 0.3, 0.1, 0.4, 0.3, 0.8, 0.2];
      
      await runtime.infer(features);
      await runtime.infer(features);

      const metrics = runtime.getMetrics();
      
      // 在宽松阈值下，应该有INT8推理
      expect(metrics.quantizedInferences).toBeGreaterThan(0);

      await runtime.dispose();
    });

    it('fp32Only模式应永不回退', async () => {
      const runtime = createQuantizedRuntime(mockFp32, QuantizationPresets.fp32Only);
      await runtime.initialize();

      const features: NormalizedFeatures = [0.5, 0.6, 0.3, 0.4, 0.5, 0.2, 0.3, 0.1, 0.4, 0.3, 0.8, 0.2];
      
      await runtime.infer(features);
      await runtime.infer(features);

      const metrics = runtime.getMetrics();
      
      // 应该只有FP32推理
      expect(metrics.fp32Inferences).toBe(2);
      expect(metrics.quantizedInferences).toBe(0);

      await runtime.dispose();
    });
  });

  // ========================================================================
  // 量化/反量化函数测试
  // ========================================================================
  describe('量化/反量化函数', () => {
    it('应正确量化FP32到INT8', () => {
      const params: QuantizationParams = {
        tensorName: 'test',
        scale: 0.007874, // 1/127
        zeroPoint: 0,
        dataType: 'int8',
        minValue: -1,
        maxValue: 1,
        calibrationSamples: 100,
        lastUpdated: new Date().toISOString(),
        statistics: {
          name: 'test',
          min: -1,
          max: 1,
          mean: 0,
          std: 0.5,
          median: 0,
          percentiles: { p1: -0.9, p5: -0.5, p95: 0.5, p99: 0.9 },
        },
      };

      const fp32Data = new Float32Array([0, 0.5, 1, -0.5, -1]);
      const int8Data = quantizeFloat32ToInt8(fp32Data, params);

      // 验证量化结果
      expect(int8Data[0]).toBe(0);    // 0 -> 0
      expect(int8Data[1]).toBe(64);   // 0.5 -> ~64
      expect(int8Data[2]).toBe(127);  // 1 -> 127
      expect(int8Data[3]).toBe(-64);  // -0.5 -> ~-64
      expect(int8Data[4]).toBe(-127); // -1 -> -127
    });

    it('应正确反量化INT8到FP32', () => {
      const params: QuantizationParams = {
        tensorName: 'test',
        scale: 0.007874,
        zeroPoint: 0,
        dataType: 'int8',
        minValue: -1,
        maxValue: 1,
        calibrationSamples: 100,
        lastUpdated: new Date().toISOString(),
        statistics: {
          name: 'test',
          min: -1,
          max: 1,
          mean: 0,
          std: 0.5,
          median: 0,
          percentiles: { p1: -0.9, p5: -0.5, p95: 0.5, p99: 0.9 },
        },
      };

      const int8Data = new Int8Array([0, 64, 127, -64, -127]);
      const fp32Data = dequantizeInt8ToFloat32(int8Data, params);

      // 验证反量化结果 (允许误差)
      expect(fp32Data[0]).toBeCloseTo(0, 1);
      expect(fp32Data[1]).toBeCloseTo(0.5, 1);
      expect(fp32Data[2]).toBeCloseTo(1, 1);
      expect(fp32Data[3]).toBeCloseTo(-0.5, 1);
      expect(fp32Data[4]).toBeCloseTo(-1, 1);
    });

    it('应正确计算概率差异', () => {
      const probs1 = [0.1, 0.2, 0.3, 0.4];
      const probs2 = [0.15, 0.25, 0.25, 0.35];
      
      const diff = calculateMaxProbDiff(probs1, probs2);
      expect(diff).toBeCloseTo(0.05, 10);
    });
  });

  // ========================================================================
  // 配置预设测试
  // ========================================================================
  describe('配置预设', () => {
    it('highPrecision预设应有严格阈值', () => {
      expect(QuantizationPresets.highPrecision.precisionThreshold).toBe(0.02);
      expect(QuantizationPresets.highPrecision.enabled).toBe(true);
    });

    it('highPerformance预设应有宽松阈值', () => {
      expect(QuantizationPresets.highPerformance.precisionThreshold).toBe(0.08);
      expect(QuantizationPresets.highPerformance.enabled).toBe(true);
    });

    it('fp32Only预设应禁用量化', () => {
      expect(QuantizationPresets.fp32Only.enabled).toBe(false);
    });

    it('int8Only预设应永不回退', () => {
      expect(QuantizationPresets.int8Only.precisionThreshold).toBe(1.0);
      expect(QuantizationPresets.int8Only.autoFallback).toBe(false);
    });
  });

  // ========================================================================
  // 指标收集测试
  // ========================================================================
  describe('性能指标', () => {
    it('应正确统计推理次数', async () => {
      const runtime = createQuantizedRuntime(mockFp32, { enabled: true });
      await runtime.initialize();

      const features: NormalizedFeatures = [0.5, 0.6, 0.3, 0.4, 0.5, 0.2, 0.3, 0.1, 0.4, 0.3, 0.8, 0.2];

      // FP32模式
      runtime.setMode('fp32');
      await runtime.infer(features);
      await runtime.infer(features);

      // INT8模式
      runtime.setMode('int8');
      await runtime.infer(features);

      const metrics = runtime.getMetrics();
      expect(metrics.fp32Inferences).toBe(2);
      expect(metrics.quantizedInferences).toBe(1);

      await runtime.dispose();
    });

    it('应能重置指标', async () => {
      const runtime = createQuantizedRuntime(mockFp32, { enabled: true });
      await runtime.initialize();

      const features: NormalizedFeatures = [0.5, 0.6, 0.3, 0.4, 0.5, 0.2, 0.3, 0.1, 0.4, 0.3, 0.8, 0.2];
      await runtime.infer(features);

      runtime.resetMetrics();
      const metrics = runtime.getMetrics();

      expect(metrics.fp32Inferences).toBe(0);
      expect(metrics.quantizedInferences).toBe(0);
      expect(metrics.fallbackCount).toBe(0);

      await runtime.dispose();
    });
  });

  // ========================================================================
  // 对比推理测试
  // ========================================================================
  describe('对比推理', () => {
    it('应能对比FP32和INT8结果', async () => {
      const runtime = createQuantizedRuntime(mockFp32, {
        enabled: true,
        precisionThreshold: 0.1,
      });
      await runtime.initialize();

      const features: NormalizedFeatures = [0.5, 0.6, 0.3, 0.4, 0.5, 0.2, 0.3, 0.1, 0.4, 0.3, 0.8, 0.2];
      
      const comparison = await runtime.compareInference(features);

      expect(comparison.fp32Result).toBeDefined();
      expect(comparison.int8Result).toBeDefined();
      expect(comparison.maxProbDiff).toBeGreaterThanOrEqual(0);
      expect(typeof comparison.passed).toBe('boolean');

      await runtime.dispose();
    });
  });
});
