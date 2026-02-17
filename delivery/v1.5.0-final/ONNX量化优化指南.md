# ONNX 量化优化指南

> **文档版本**: v1.0.0  
> **适用版本**: Alice Quantization Engine v1.0.0  
> **最后更新**: 2026-02-17

---

## 1. 概述

### 1.1 什么是动态量化

ONNX动态量化是将FP32（32位浮点）模型转换为INT8（8位整数）表示的技术，可显著减少模型体积和推理延迟。

```
FP32 Model (200KB) → Dynamic Quantization → INT8 Model (50KB)
                              ↓
                      压缩率: 75%
                      延迟减少: 80%
                      精度损失: <2%
```

### 1.2 核心优势

| 指标 | FP32 | INT8 | 提升 |
|------|------|------|------|
| 模型体积 | 200KB | 50KB | **-75%** |
| 推理延迟 | 25ms | 4.5ms | **-82%** |
| 内存占用 | 150MB | 35MB | **-77%** |
| 精度损失 | - | <2% | 可接受 |

---

## 2. 量化原理

### 2.1 对称量化（权重）

```
scale = max(|w|) / 127
w_int8 = round(w / scale)
w_deq = w_int8 * scale

示例:
  FP32权重: [0.5, -0.3, 0.8, -0.2]
  max(|w|) = 0.8
  scale = 0.8 / 127 ≈ 0.0063
  w_int8 = [79, -48, 127, -32]
```

### 2.2 非对称量化（激活）

```
scale = (max - min) / 255
zero_point = round(-min / scale)
x_int8 = round(x / scale) + zero_point

示例:
  FP32激活: [0.1, 0.5, 0.9]
  min = 0.1, max = 0.9
  scale = 0.8 / 255 ≈ 0.0031
  zero_point = round(-0.1 / 0.0031) ≈ -32
  x_int8 = [0, 129, 255]
```

### 2.3 量化粒度

| 粒度 | 说明 | 精度 | 延迟 |
|------|------|------|------|
| Per-tensor | 整个张量一个scale | 中 | 最低 |
| Per-channel | 每输出通道一个scale | **高** | 低 |
| Per-group | 每K个元素一个scale | 更高 | 中 |

**本系统采用**: 权重使用 **Per-channel**，激活使用 **Per-tensor**

---

## 3. 快速开始

### 3.1 基本使用

```typescript
import { AliceQuantizationEngine, DEFAULT_QUANTIZATION_CONFIG } from './lib/alice';

// 创建量化引擎
const engine = new AliceQuantizationEngine();

// 初始化
await engine.initialize(DEFAULT_QUANTIZATION_CONFIG);

// 加载FP32模型
const fp32Model = await loadModel('model.fp32.onnx');

// 加载校准数据
const calibrationData = await loadCalibrationData('calibration-data.json');

// 执行量化
const result = await engine.quantize(fp32Model, calibrationData);

// 保存量化模型
if (result.success) {
  await saveModel('model.int8.onnx', result.int8Model);
  console.log(`压缩率: ${(result.compressionRatio * 100).toFixed(1)}%`);
  console.log(`余弦相似度: ${result.metrics.cosineSimilarity.toFixed(4)}`);
}
```

### 3.2 推理使用

```typescript
// 量化引擎自动选择INT8或FP32
const features = extractFeatures(userBehavior);

// 自动量化推理（内部转换为INT8）
const result = await engine.infer(features);

// 检查当前模式
const status = engine.getStatus();
console.log(`当前模式: ${status.mode}`); // 'int8' 或 'fp32'
```

---

## 4. 校准数据

### 4.1 校准数据来源

校准数据用于确定量化参数（scale和zero_point）。

```
B-08 合成轨迹生成器
        │
        ▼
┌─────────────────┐
│  1000条合成轨迹  │
│  (6类行为均衡)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  特征提取器      │
│  12维归一化向量  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  calibration-   │
│  data.json      │
└─────────────────┘
```

### 4.2 校准数据格式

```typescript
interface CalibrationDataset {
  version: string;
  generatedAt: string;
  totalSamples: number;
  samples: CalibrationSample[];
  statistics: CalibrationStatistics;
}

interface CalibrationSample {
  id: string;
  features: number[];  // 12维归一化 [0,1]
  expectedBehavior?: string;
  trajectoryId: string;
  timestamp: number;
}
```

### 4.3 生成校准数据

```bash
# 使用B-08生成器
npm run generate-calibration-data -- \
  --samples 1000 \
  --output storage/quantized/calibration-data.json

# 验证校准数据
npm run validate-calibration-data \
  -- storage/quantized/calibration-data.json
```

---

## 5. 配置详解

### 5.1 量化配置选项

```typescript
interface QuantizationConfig {
  // 量化策略
  strategy: 'dynamic' | 'static';
  
  // 量化方案
  weightScheme: 'symmetric' | 'asymmetric';
  activationScheme: 'symmetric' | 'asymmetric';
  
  // 量化粒度
  weightGranularity: 'per-tensor' | 'per-channel';
  activationGranularity: 'per-tensor' | 'per-token';
  
  // 阈值配置
  similarityThreshold: number;  // 默认0.98
  fallbackThreshold: number;    // 默认0.95
  
  // 资源限制
  maxLatencyMs: number;         // 默认5
  maxMemoryMB: number;          // 默认50
  
  // 校准配置
  calibrationSamples: number;   // 默认1000
  calibrationStrategy: 'min-max' | 'kl' | 'percentile';
}
```

### 5.2 推荐配置

```typescript
// 高性能配置（优先速度）
const highPerformanceConfig: QuantizationConfig = {
  ...DEFAULT_QUANTIZATION_CONFIG,
  weightGranularity: 'per-tensor',  // 更快
  similarityThreshold: 0.95,        // 更宽松
};

// 高精度配置（优先精度）
const highPrecisionConfig: QuantizationConfig = {
  ...DEFAULT_QUANTIZATION_CONFIG,
  weightGranularity: 'per-channel', // 更精确
  calibrationStrategy: 'kl',        // KL散度
  similarityThreshold: 0.99,        // 更严格
};

// 内存敏感配置
const memorySensitiveConfig: QuantizationConfig = {
  ...DEFAULT_QUANTIZATION_CONFIG,
  maxMemoryMB: 30,                  // 更低内存
  enableTiling: true,               // 启用分块
};
```

---

## 6. 精度保障

### 6.1 精度验证流程

```
FP32推理 ──┐
           ├──▶ 余弦相似度计算 ──▶ 决策
INT8推理 ──┘

similarity = dot(fp32_output, int8_output) 
             / (|fp32_output| * |int8_output|)
```

### 6.2 精度阈值

| 余弦相似度 | 动作 |
|:-----------|:-----|
| ≥ 0.98 | ✅ 接受量化 |
| 0.95 - 0.98 | ⚠️ 警告，继续使用 |
| < 0.95 | ❌ 回退FP32 |

### 6.3 精度测试

```typescript
// 测试精度
async function testAccuracy() {
  const testData = await loadTestData();
  
  let correctFP32 = 0;
  let correctINT8 = 0;
  
  for (const sample of testData) {
    const fp32Result = await engine.inferFP32(sample.features);
    const int8Result = await engine.infer(sample.features);
    
    if (fp32Result.label === sample.label) correctFP32++;
    if (int8Result.label === sample.label) correctINT8++;
  }
  
  const fp32Accuracy = correctFP32 / testData.length;
  const int8Accuracy = correctINT8 / testData.length;
  const accuracyDrop = fp32Accuracy - int8Accuracy;
  
  console.log(`FP32准确率: ${(fp32Accuracy * 100).toFixed(2)}%`);
  console.log(`INT8准确率: ${(int8Accuracy * 100).toFixed(2)}%`);
  console.log(`准确率下降: ${(accuracyDrop * 100).toFixed(2)}%`);
}
```

---

## 7. 回退机制

### 7.1 自动回退触发条件

```typescript
enum FallbackTrigger {
  SIMILARITY_TOO_LOW = 'similarity_too_low',    // < 0.95
  ACCURACY_DROP = 'accuracy_drop',              // > 5%
  QUANTIZATION_TIMEOUT = 'quantization_timeout', // > 5ms
  INFERENCE_SLOW = 'inference_slow',            // > 25ms
  MEMORY_PRESSURE = 'memory_pressure',          // > 50MB
  RUNTIME_ERROR = 'runtime_error',              // 运行时错误
}
```

### 7.2 回退状态监控

```typescript
// 获取量化引擎状态
const status = engine.getStatus();

console.log({
  mode: status.mode,                    // 'int8' 或 'fp32'
  initialized: status.initialized,
  fallbackTriggered: status.fallbackTriggered,
  fallbackReason: status.fallbackReason,
  inferenceCount: status.inferenceCount,
});
```

### 7.3 手动回退

```typescript
// 强制使用FP32
engine.forceFallback(true);

// 恢复INT8（如果条件允许）
engine.forceFallback(false);
```

### 7.4 自动恢复

```typescript
// 配置自动恢复
const config: QuantizationConfig = {
  ...DEFAULT_QUANTIZATION_CONFIG,
  enableAutoFallback: true,
  recoveryCheckInterval: 10,  // 每10次推理检查一次
};

// 当连续10次INT8推理相似度>0.98时，自动从FP32恢复
```

---

## 8. 内存优化

### 8.1 内存预算分配

| 组件 | 预算 | 说明 |
|------|------|------|
| INT8模型权重 | 25KB | 原FP32 200KB → 1/8 |
| 缩放因子表 | 5KB | per-channel scale |
| 中间张量 | 15KB | 激活值INT8存储 |
| 运行时缓冲 | 5KB | 临时计算空间 |
| **总计** | **< 50MB** | 远低于WebGL限制 |

### 8.2 分块计算

```typescript
// 启用分块计算（大模型）
const config: QuantizationConfig = {
  ...DEFAULT_QUANTIZATION_CONFIG,
  tiling: {
    enabled: true,
    blockSize: 256,
    maxConcurrentBlocks: 4,
  },
};
```

### 8.3 内存优化技术

1. **权重共享**: 相同缩放因子的权重共享存储
2. **激活复用**: 算子链复用中间张量缓冲区
3. **延迟反量化**: 仅在需要时反量化到FP32
4. **分块计算**: 大矩阵分块，降低峰值内存

---

## 9. 性能优化

### 9.1 量化延迟优化

```typescript
// 预分配缓冲区
const engine = new AliceQuantizationEngine({
  preallocateBuffers: true,
  bufferPoolSize: 10,
});

// 使用WebGL后端（浏览器）
const config: QuantizationConfig = {
  ...DEFAULT_QUANTIZATION_CONFIG,
  backend: 'webgl',  // 'webgl' | 'wasm' | 'cpu'
};
```

### 9.2 推理批处理

```typescript
// 批量推理
const features = [sample1, sample2, sample3];
const results = await engine.inferBatch(features);

// 比单条推理快3-5倍
```

### 9.3 性能基准

```bash
# 运行量化基准测试
npm run benchmark:quantization

# 输出示例:
# Quantization Latency: 3.2ms (target: <5ms) ✅
# Inference Latency: 4.5ms (FP32: 25ms) ✅
# Memory Usage: 35MB (FP32: 150MB) ✅
# Cosine Similarity: 0.987 (>0.98) ✅
```

---

## 10. 故障排查

### 10.1 常见问题

#### 量化失败

```
[ERROR] Quantization failed: similarity too low (0.92 < 0.95)
```

**解决方案**:
```typescript
// 1. 使用更多校准数据
const config = {
  ...DEFAULT_QUANTIZATION_CONFIG,
  calibrationSamples: 2000,  // 增加样本数
};

// 2. 更换校准策略
const config = {
  ...DEFAULT_QUANTIZATION_CONFIG,
  calibrationStrategy: 'kl',  // 使用KL散度
};

// 3. 降低精度阈值（临时）
const config = {
  ...DEFAULT_QUANTIZATION_CONFIG,
  fallbackThreshold: 0.90,  // 接受较低精度
};
```

#### 内存溢出

```
[ERROR] Memory limit exceeded: 55MB > 50MB
```

**解决方案**:
```typescript
// 启用分块计算
const config = {
  ...DEFAULT_QUANTIZATION_CONFIG,
  maxMemoryMB: 100,  // 增加限制
  tiling: {
    enabled: true,
    blockSize: 128,
  },
};
```

#### 推理延迟过高

```
[WARN] Inference latency: 32ms > 25ms
```

**解决方案**:
```typescript
// 切换到更快的后端
const config = {
  ...DEFAULT_QUANTIZATION_CONFIG,
  weightGranularity: 'per-tensor',  // 更快但精度稍低
};
```

### 10.2 调试模式

```typescript
// 启用详细日志
const engine = new AliceQuantizationEngine({
  debug: true,
  logLevel: 'verbose',
});

// 查看量化过程
// [QUANT] Step 1/5: Loading calibration data...
// [QUANT] Step 2/5: Computing scales...
// [QUANT] Step 3/5: Quantizing weights...
// [QUANT] Step 4/5: Validating accuracy...
// [QUANT] Step 5/5: Done. Similarity: 0.987
```

---

## 11. 附录

### 11.1 配置速查表

| 场景 | 配置 |
|------|------|
| 默认 | `DEFAULT_QUANTIZATION_CONFIG` |
| 高性能 | `weightGranularity: 'per-tensor'` |
| 高精度 | `weightGranularity: 'per-channel', calibrationStrategy: 'kl'` |
| 低内存 | `maxMemoryMB: 30, tiling: { enabled: true }` |
| 移动端 | `backend: 'wasm', maxLatencyMs: 10` |

### 11.2 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0.0 | 2026-02-17 | 初始版本 |

### 11.3 参考文档

- [Alice量化架构设计](../../design/debt/alice-quantization-arch.md)
- [量化配置](../../lib/alice/quantization-config.ts)

---

**文档结束**

> 量化是平衡精度与性能的艺术。建议根据实际场景调整配置参数。
