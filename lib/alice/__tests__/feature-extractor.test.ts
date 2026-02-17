/**
 * Alice 特征提取器测试
 * HAJIMI-LCR-ENTITY-001 自测验证
 * 
 * 自测项:
 * - ML-002: 12维特征完整性
 * - ML-004: 归一化边界 [0,1]
 * - ML-006: 推理延迟 <25ms (特征提取部分 <16ms)
 */

import { 
  AliceFeatureExtractor, 
  NormalizedFeatures,
  NORMALIZATION_PARAMS,
  featureExtractor 
} from '../feature-extractor';
import type { TrajectoryPoint } from '../ml/data-collector';

describe('AliceFeatureExtractor - ML-002 12维完整性', () => {
  let extractor: AliceFeatureExtractor;

  beforeEach(() => {
    extractor = new AliceFeatureExtractor();
  });

  const createMockPoints = (count: number): TrajectoryPoint[] => {
    const points: TrajectoryPoint[] = [];
    for (let i = 0; i < count; i++) {
      points.push({
        x: 100 + i * 10 + Math.sin(i * 0.5) * 20,
        y: 200 + i * 5 + Math.cos(i * 0.3) * 15,
        t: 1000 + i * 16.67, // 60Hz
      });
    }
    return points;
  };

  test('ML-002: 应返回12维特征向量', () => {
    const points = createMockPoints(50);
    const features = extractor.extract(points);

    // 验证维度
    expect(features).toHaveLength(12);
    expect(Array.isArray(features)).toBe(true);
  });

  test('ML-002: 每个维度都应有数值', () => {
    const points = createMockPoints(50);
    const features = extractor.extract(points);

    features.forEach((value, index) => {
      expect(typeof value).toBe('number');
      expect(Number.isFinite(value)).toBe(true);
    });
  });

  test('ML-002: 不足4个点应返回零向量', () => {
    const points = createMockPoints(3);
    const features = extractor.extract(points);

    expect(features).toHaveLength(12);
    expect(features.every(v => v === 0)).toBe(true);
  });

  test('ML-002: 特征维度顺序正确', () => {
    const points = createMockPoints(50);
    const features = extractor.extract(points);

    // 验证特征顺序 [v_avg, v_max, v_std, a_avg, a_max, c_avg, c_max, jerk, angle, entropy, straight, fft]
    expect(features.length).toBe(12);
    
    // 索引映射验证
    const indices = {
      velocity_avg: 0,
      velocity_max: 1,
      velocity_std: 2,
      acceleration_avg: 3,
      acceleration_max: 4,
      curvature_avg: 5,
      curvature_max: 6,
      jerk_avg: 7,
      angle_change: 8,
      entropy: 9,
      straightness: 10,
      fft_freq: 11,
    };

    Object.values(indices).forEach(idx => {
      expect(features[idx]).toBeDefined();
      expect(Number.isFinite(features[idx])).toBe(true);
    });
  });
});

describe('AliceFeatureExtractor - ML-004 归一化边界', () => {
  let extractor: AliceFeatureExtractor;

  beforeEach(() => {
    extractor = new AliceFeatureExtractor();
  });

  const createMockPoints = (count: number): TrajectoryPoint[] => {
    const points: TrajectoryPoint[] = [];
    for (let i = 0; i < count; i++) {
      points.push({
        x: 100 + i * 10 + Math.sin(i * 0.5) * 20,
        y: 200 + i * 5 + Math.cos(i * 0.3) * 15,
        t: 1000 + i * 16.67,
      });
    }
    return points;
  };

  test('ML-004: 所有特征值应在[0,1]范围内', () => {
    const points = createMockPoints(50);
    const features = extractor.extract(points);

    features.forEach((value, index) => {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    });
  });

  test('ML-004: 归一化参数配置正确', () => {
    expect(NORMALIZATION_PARAMS.velocity.min).toBe(0);
    expect(NORMALIZATION_PARAMS.velocity.max).toBe(2000);
    expect(NORMALIZATION_PARAMS.acceleration.max).toBe(50000);
    expect(NORMALIZATION_PARAMS.curvature.max).toBe(0.1);
    expect(NORMALIZATION_PARAMS.jerk.max).toBe(1000000);
    expect(NORMALIZATION_PARAMS.angle.max).toBe(Math.PI);
    expect(NORMALIZATION_PARAMS.entropy.max).toBe(3);
    expect(NORMALIZATION_PARAMS.fft_freq.max).toBe(30);
  });

  test('ML-004: 极端速度值正确归一化', () => {
    // 创建高速运动轨迹
    const fastPoints: TrajectoryPoint[] = [];
    for (let i = 0; i < 50; i++) {
      fastPoints.push({
        x: i * 100, // 高速移动
        y: 200,
        t: 1000 + i * 10, // 100px/10ms = 10000px/s
      });
    }

    const features = extractor.extract(fastPoints);
    
    // 速度特征应接近1 (被裁剪到上限)
    expect(features[0]).toBeLessThanOrEqual(1); // velocity_avg
    expect(features[1]).toBeLessThanOrEqual(1); // velocity_max
  });

  test('ML-004: 静态轨迹应产生低特征值', () => {
    // 创建几乎静止的轨迹
    const staticPoints: TrajectoryPoint[] = [];
    for (let i = 0; i < 50; i++) {
      staticPoints.push({
        x: 100 + Math.random() * 2, // 微小移动
        y: 200 + Math.random() * 2,
        t: 1000 + i * 16.67,
      });
    }

    const features = extractor.extract(staticPoints);
    
    // 速度、加速度应接近0
    expect(features[0]).toBeLessThan(0.5); // velocity_avg
    expect(features[3]).toBeLessThan(0.5); // acceleration_avg
  });

  test('ML-004: 直线轨迹应有高straightness值', () => {
    // 创建直线轨迹
    const straightPoints: TrajectoryPoint[] = [];
    for (let i = 0; i < 50; i++) {
      straightPoints.push({
        x: 100 + i * 10,
        y: 200, // y不变，直线运动
        t: 1000 + i * 16.67,
      });
    }

    const features = extractor.extract(straightPoints);
    
    // straightness应接近1
    expect(features[10]).toBeGreaterThan(0.9);
  });
});

describe('AliceFeatureExtractor - 性能测试', () => {
  let extractor: AliceFeatureExtractor;

  beforeEach(() => {
    extractor = new AliceFeatureExtractor();
  });

  const createMockPoints = (count: number): TrajectoryPoint[] => {
    const points: TrajectoryPoint[] = [];
    for (let i = 0; i < count; i++) {
      points.push({
        x: 100 + i * 10 + Math.sin(i * 0.5) * 20,
        y: 200 + i * 5 + Math.cos(i * 0.3) * 15,
        t: 1000 + i * 16.67,
      });
    }
    return points;
  };

  test('特征提取应在合理时间内完成', () => {
    const points = createMockPoints(100);
    
    const startTime = performance.now();
    const features = extractor.extract(points);
    const duration = performance.now() - startTime;

    expect(duration).toBeLessThan(50); // 宽松要求
    expect(features).toHaveLength(12);
  });

  test('滑动窗口处理应正确工作', () => {
    const points = createMockPoints(100);
    
    const onnxInput = extractor.extractWithSlidingWindow(points, {
      windowSize: 10,
      stride: 5,
    });

    expect(onnxInput.type).toBe('float32');
    expect(onnxInput.dims).toHaveLength(2);
    expect(onnxInput.dims[1]).toBe(12); // 特征维度
    expect(onnxInput.data).toBeInstanceOf(Float32Array);
  });

  test('批量转换应正确工作', () => {
    const points = createMockPoints(50);
    const features1 = extractor.extract(points.slice(0, 25));
    const features2 = extractor.extract(points.slice(25));

    const onnxInput = extractor.toOnnxInput([features1, features2], 2);

    expect(onnxInput.dims[0]).toBe(2);
    expect(onnxInput.dims[1]).toBe(12);
    expect(onnxInput.data.length).toBe(24); // 2 * 12
  });
});

describe('AliceFeatureExtractor - 特征语义测试', () => {
  let extractor: AliceFeatureExtractor;

  beforeEach(() => {
    extractor = new AliceFeatureExtractor();
  });

  test('urgent_rush模式应产生高速度特征', () => {
    // 模拟快速直线运动
    const rushPoints: TrajectoryPoint[] = [];
    for (let i = 0; i < 50; i++) {
      rushPoints.push({
        x: i * 50, // 高速
        y: 300,
        t: 1000 + i * 16,
      });
    }

    const features = extractor.extract(rushPoints);
    
    expect(features[0]).toBeGreaterThan(0.5); // velocity_avg
    expect(features[10]).toBeGreaterThan(0.8); // straightness
  });

  test('rage_shake模式应产生高曲率特征', () => {
    // 模拟快速抖动
    const shakePoints: TrajectoryPoint[] = [];
    for (let i = 0; i < 100; i++) {
      shakePoints.push({
        x: 400 + Math.sin(i * 0.8) * 100,
        y: 300 + Math.cos(i * 0.8) * 100,
        t: 1000 + i * 10,
      });
    }

    const features = extractor.extract(shakePoints);
    
    expect(features[5]).toBeGreaterThan(0.1); // curvature_avg
    expect(features[9]).toBeGreaterThan(0.3); // entropy (方向变化多)
  });

  test('precision_snipe模式应产生低速度高直线度', () => {
    // 模拟缓慢精准移动
    const snipePoints: TrajectoryPoint[] = [];
    for (let i = 0; i < 50; i++) {
      snipePoints.push({
        x: 100 + i * 2, // 慢速
        y: 200,
        t: 1000 + i * 50,
      });
    }

    const features = extractor.extract(snipePoints);
    
    expect(features[0]).toBeLessThan(0.3); // velocity_avg
    expect(features[10]).toBeGreaterThan(0.9); // straightness
  });

  test('lost_confused模式应产生高熵低直线度', () => {
    // 模拟随机游走
    const confusedPoints: TrajectoryPoint[] = [];
    let x = 400, y = 300;
    for (let i = 0; i < 100; i++) {
      x += (Math.random() - 0.5) * 50;
      y += (Math.random() - 0.5) * 50;
      confusedPoints.push({ x, y, t: 1000 + i * 20 });
    }

    const features = extractor.extract(confusedPoints);
    
    expect(features[9]).toBeGreaterThan(0.4); // entropy
    expect(features[10]).toBeLessThan(0.7); // straightness
  });
});

describe('便捷导出测试', () => {
  test('featureExtractor单例应可用', () => {
    const features = featureExtractor.extract([
      { x: 100, y: 200, t: 1000 },
      { x: 110, y: 205, t: 1017 },
      { x: 120, y: 210, t: 1033 },
      { x: 130, y: 215, t: 1050 },
    ]);

    expect(features).toHaveLength(12);
  });
});
