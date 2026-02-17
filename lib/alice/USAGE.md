# Alice ML 使用指南

> HAJIMI-LCR-ENTITY-001 B-06/09 实体化产出物使用说明

---

## 快速开始

### 1. 特征提取

```typescript
import { AliceFeatureExtractor, featureExtractor } from '@/lib/alice';

// 使用单例实例
const features = featureExtractor.extract([
  { x: 100, y: 200, t: 1000 },
  { x: 110, y: 205, t: 1017 },
  { x: 120, y: 210, t: 1033 },
  // ... 更多轨迹点
]);

console.log(features); // [0.5, 0.7, 0.3, ...] 12维特征向量
```

### 2. ONNX 推理

```typescript
import { AliceOnnxRuntime, createOnnxRuntime } from '@/lib/alice';

// 创建运行时实例 (Mock模式)
const runtime = createOnnxRuntime({ useMock: true });
await runtime.initialize();

// 执行推理
const result = await runtime.infer(features);

console.log(result.className);   // 'urgent_rush' | 'rage_shake' | ...
console.log(result.confidence);  // 0.85
console.log(result.latencyMs);   // < 25ms
```

### 3. 完整流程示例

```typescript
import { AliceFeatureExtractor, AliceOnnxRuntime } from '@/lib/alice';

async function predictBehavior(trajectoryPoints) {
  // 1. 提取特征
  const extractor = new AliceFeatureExtractor();
  const features = extractor.extract(trajectoryPoints);
  
  // 2. ONNX推理
  const runtime = new AliceOnnxRuntime({ useMock: true });
  await runtime.initialize();
  
  const result = await runtime.infer(features);
  
  // 3. 根据置信度决定是否使用ML结果
  if (result.confidence > 0.7) {
    return result.className;
  } else {
    return 'uncertain'; // 回退到启发式
  }
}
```

---

## 12维特征说明

| 索引 | 特征 | 说明 |
|:---:|:---|:---|
| 0 | velocity_avg | 平均速度 (px/s) |
| 1 | velocity_max | 最大速度 (px/s) |
| 2 | velocity_std | 速度标准差 |
| 3 | acceleration_avg | 平均加速度 (px/s²) |
| 4 | acceleration_max | 最大加速度 (px/s²) |
| 5 | curvature_avg | 平均曲率 (1/px) |
| 6 | curvature_max | 最大曲率 (1/px) |
| 7 | jerk_avg | 平均jerk (px/s³) |
| 8 | angle_change_rate | 角度变化率 (rad) |
| 9 | entropy | 方向熵 |
| 10 | straightness | 直线度 (0-1) |
| 11 | fft_dominant_freq | 主导频率 (Hz) |

---

## 自测验证

```bash
# 运行单元测试
npm test -- --testPathPattern="lib/alice/__tests__/(feature-extractor|onnx-runtime)"
```

### 验证清单

- [ ] ML-002: 12维特征完整性
- [ ] ML-004: 归一化边界 [0,1]
- [ ] ENTITY-006: ONNX推理延迟<25ms

---

## DEBT 声明

当前版本使用 **Mock 模式** (DEBT-ALICE-ML-001) 进行推理：
- ✅ 延迟 < 25ms 已达标
- ✅ 12维特征提取完整
- ⚠️ 模型权重为随机初始化（启发式模拟）
- 📅 真实模型计划: v1.3.1

---

**唐音**: ☝️😋🐍♾️💥
