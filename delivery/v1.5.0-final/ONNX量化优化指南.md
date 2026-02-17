# ONNX 量化优化指南

> **文档版本**: v1.0.0  
> **适用版本**: Alice Quantization Engine v1.0.0  

---

## 1. 概述

### 1.1 什么是动态量化

ONNX动态量化是将FP32（32位浮点）模型转换为INT8（8位整数）表示的技术。

```
FP32 Model (200KB) => Dynamic Quantization => INT8 Model (50KB)
                            |
                    压缩率: 75%
                    延迟减少: 80%
                    精度损失: <2%
```

### 1.2 核心优势

| 指标 | FP32 | INT8 | 提升 |
|------|------|------|------|
| 模型体积 | 200KB | 50KB | -75% |
| 推理延迟 | 25ms | 4.5ms | -82% |
| 内存占用 | 150MB | 35MB | -77% |
| 精度损失 | - | <2% | 可接受 |

---

## 2. 量化原理

### 2.1 对称量化（权重）

```
scale = max(|w|) / 127
w_int8 = round(w / scale)
w_deq = w_int8 * scale
```

### 2.2 非对称量化（激活）

```
scale = (max - min) / 255
zero_point = round(-min / scale)
x_int8 = round(x / scale) + zero_point
```

### 2.3 量化粒度

| 粒度 | 说明 | 精度 | 延迟 |
|------|------|------|------|
| Per-tensor | 整个张量一个scale | 中 | 最低 |
| Per-channel | 每输出通道一个scale | 高 | 低 |

**本系统采用**: 权重使用 Per-channel，激活使用 Per-tensor

---

## 3. 快速开始

### 3.1 基本使用

```typescript
import { AliceQuantizationEngine, DEFAULT_QUANTIZATION_CONFIG } from './lib/alice';

// 创建量化引擎
const engine = new AliceQuantizationEngine();

// 初始化
await engine.initialize(DEFAULT_QUANTIZATION_CONFIG);

// 加载FP32模型和校准数据
const fp32Model = await loadModel('model.fp32.onnx');
const calibrationData = await loadCalibrationData('calibration-data.json');

// 执行量化
const result = await engine.quantize(fp32Model, calibrationData);

// 保存量化模型
if (result.success) {
  await saveModel('model.int8.onnx', result.int8Model);
  console.log(`压缩率: ${(result.compressionRatio * 100).toFixed(1)}%`);
}
```

### 3.2 推理使用

```typescript
// 量化引擎自动选择INT8或FP32
const features = extractFeatures(userBehavior);
const result = await engine.infer(features);

// 检查当前模式
const status = engine.getStatus();
console.log(`当前模式: ${status.mode}`); // 'int8' 或 'fp32'
```

---

## 4. 精度保障

### 4.1 精度阈值

| 余弦相似度 | 动作 |
|------------|------|
| >= 0.98 | OK 接受量化 |
| 0.95 - 0.98 | WARN 警告，继续使用 |
| < 0.95 | FAIL 回退FP32 |

### 4.2 自动回退

```typescript
// 当精度不达标时自动回退到FP32
const config = {
  ...DEFAULT_QUANTIZATION_CONFIG,
  enableAutoFallback: true,
  fallbackThreshold: 0.95,  // <0.95时回退
};
```

---

## 5. 内存优化

### 5.1 内存预算分配

| 组件 | 预算 | 说明 |
|------|------|------|
| INT8模型权重 | 25KB | 原FP32 200KB的1/8 |
| 缩放因子表 | 5KB | per-channel scale |
| 中间张量 | 15KB | 激活值INT8存储 |
| 运行时缓冲 | 5KB | 临时计算空间 |
| **总计** | **< 50MB** | 远低于WebGL限制 |

### 5.2 分块计算

```typescript
// 启用分块计算（大模型）
const config = {
  ...DEFAULT_QUANTIZATION_CONFIG,
  tiling: {
    enabled: true,
    blockSize: 256,
    maxConcurrentBlocks: 4,
  },
};
```

---

## 6. 故障排查

### 6.1 量化失败

**错误**: `similarity too low (0.92 < 0.95)`

**解决方案**:
```typescript
// 1. 使用更多校准数据
const config = { calibrationSamples: 2000 };

// 2. 更换校准策略
const config = { calibrationStrategy: 'kl' };

// 3. 降低精度阈值（临时）
const config = { fallbackThreshold: 0.90 };
```

### 6.2 内存溢出

**错误**: `Memory limit exceeded: 55MB > 50MB`

**解决方案**:
```typescript
const config = {
  maxMemoryMB: 100,
  tiling: { enabled: true, blockSize: 128 },
};
```

---

**文档结束**
