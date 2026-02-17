# HAJIMI-LCR-TRIPLE-DIM-001 工单 B-07/09

[SPAWN:ALICE-ML-001]
Agent: 咕咕嘎嘎（QA）
目标: 鼠标轨迹数据收集管道
DEBT: ALICE-ML-001 - P1 - 训练数据不足

---

## 1. 需求概述

### 1.1 背景
- **ID-64**: Alice悬浮球设计 - 需要精准的鼠标行为预测
- **ID-95**: ML行为预测需求 - 需要1000条训练数据支持模型训练
- **GDPR合规**: 欧盟通用数据保护条例要求用户数据脱敏处理

### 1.2 目标
构建高保真、隐私安全的鼠标轨迹数据收集管道，支持12维特征采集、GDPR脱敏、60Hz采集频率。

---

## 2. 12维特征定义

| 维度 | 特征名称 | 类型 | 单位 | 采集方式 | 隐私级别 |
|------|----------|------|------|----------|----------|
| 1 | `x` | float | px | PointerEvent.clientX | **敏感** |
| 2 | `y` | float | px | PointerEvent.clientY | **敏感** |
| 3 | `timestamp` | int | ms | performance.now() | 中性 |
| 4 | `velocity` | float | px/ms | 计算 (Δs/Δt) | 中性 |
| 5 | `acceleration` | float | px/ms² | 计算 (Δv/Δt) | 中性 |
| 6 | `curvature` | float | 1/px | 三点圆弧估计 | 中性 |
| 7 | `jerk` | float | px/ms³ | 计算 (Δa/Δt) | 中性 |
| 8 | `pressure` | float | 0-1 | PointerEvent.pressure | 中性 |
| 9 | `tiltX` | float | deg | PointerEvent.tiltX | 中性 |
| 10 | `tiltY` | float | deg | PointerEvent.tiltY | 中性 |
| 11 | `hoverDistance` | float | px | PointerEvent.height | 中性 |
| 12 | `contactArea` | float | px² | width × height | 中性 |

**说明**: 
- x/y 为原始坐标，**严格禁止**上传至云端
- 云端传输只能使用派生特征（velocity/acceleration/curvature等）

---

## 3. 数据流架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        采集层 (Collection)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Pointer  │  │ Pointer  │  │ Pointer  │  │ Pointer  │        │
│  │ Move     │→ │ Down     │→ │ Up       │→ │ Hover    │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
└────────────────────┬────────────────────────────────────────────┘
                     │ 60Hz采样
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                      缓冲层 (Buffering)                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              RingBuffer (滑动窗口: 50帧)                  │   │
│  │  [t-49] [t-48] ... [t-2] [t-1] [t] ← 新数据              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                         │                                       │
│                         ▼ 触发条件                              │
│              ┌──────────────────────┐                         │
│              │ 缓冲区满 / 会话结束    │                         │
│              │ 检测到Pattern / 超时   │                         │
│              └──────────────────────┘                         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     特征层 (Feature Extraction)                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  速度特征    │    │  加速度特征  │    │  曲率特征    │         │
│  │  (3维)      │    │  (2维)      │    │  (2维)      │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  角度变化    │    │  复杂度特征  │    │  频域特征    │         │
│  │  (1维)      │    │  (2维)      │    │  (2维)      │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│                                                                 │
│  输出: 12维标准化特征向量 [0,1] 范围                             │
└────────────────────────┬────────────────────────────────────────┘
                         │
          ┌──────────────┴──────────────┐
          ▼                              ▼
┌─────────────────────┐      ┌─────────────────────┐
│    脱敏层 (Privacy)  │      │   本地存储层         │
│  ┌───────────────┐  │      │  ┌───────────────┐  │
│  │ 差分隐私噪声   │  │      │  │ IndexedDB     │  │
│  │ Laplace(ε=1.0)│  │      │  │ (加密存储)     │  │
│  └───────────────┘  │      │  └───────────────┘  │
│  ┌───────────────┐  │      │                     │
│  │ K-匿名化      │  │      │  KDF: PBKDF2-SHA256 │
│  │ k≥5           │  │      │  Enc: AES-256-GCM   │
│  └───────────────┘  │      │  Key: 本地生成      │
└──────────┬──────────┘      └─────────────────────┘
           │
           ▼
┌─────────────────────┐
│   云端上传层 (Cloud) │
│  ┌───────────────┐  │
│  │ HTTPS/TLS 1.3 │  │
│  │ 只上传特征向量 │  │
│  └───────────────┘  │
└─────────────────────┘
```

---

## 4. GDPR脱敏规范

### 4.1 数据分类

| 级别 | 数据类型 | 处理方式 | 存储位置 |
|------|----------|----------|----------|
| **P0-敏感** | 原始坐标(x,y)、用户ID、设备指纹 | **永不上传**，本地加密7天后删除 | 本地IndexedDB |
| **P1-中性** | 时间戳、派生特征(速度/加速度等) | 差分隐私处理后上传 | 本地+云端 |
| **P2-公开** | 聚合统计、模型参数 | 直接上传 | 云端 |

### 4.2 脱敏算法

#### 4.2.1 差分隐私 (Differential Privacy)

```typescript
// Laplace机制
function addLaplaceNoise(value: number, epsilon: number = 1.0): number {
  const sensitivity = 1.0; // 全局敏感度
  const scale = sensitivity / epsilon;
  const u = Math.random() - 0.5;
  const noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  return Math.max(0, Math.min(1, value + noise)); // 裁剪到[0,1]
}
```

**隐私预算**: ε = 1.0 (每用户每天)

#### 4.2.2 坐标扰动

```typescript
// 位置扰动 - 添加圆形高斯噪声
function perturbCoordinate(x: number, y: number, radius: number = 10): {x: number, y: number} {
  const angle = Math.random() * 2 * Math.PI;
  const r = radius * Math.sqrt(-2 * Math.log(Math.random()));
  return {
    x: x + r * Math.cos(angle),
    y: y + r * Math.sin(angle)
  };
}
```

#### 4.2.3 时间模糊

```typescript
// 时间戳模糊 - 降低精度到10ms级别
function fuzzTimestamp(timestamp: number): number {
  return Math.floor(timestamp / 10) * 10;
}
```

### 4.3 用户权利支持

| GDPR权利 | 实现方式 |
|----------|----------|
| **知情权** | 首次使用时弹窗告知数据收集范围 |
| **访问权** | 提供 `exportUserData()` API |
| **删除权** | 一键清除按钮 + `clearAllData()` API |
| **可携带权** | 支持导出JSON格式原始数据 |
| **反对权** | 设置中可随时关闭数据收集 |

---

## 5. 采集频率保障 (60Hz)

### 5.1 采样策略

```typescript
// 目标: 16.67ms间隔 (60Hz)
const TARGET_INTERVAL = 1000 / 60; // 16.67ms

class SamplingController {
  private lastSampleTime = 0;
  private frameBuffer: TrajectorySample[] = [];
  
  // 使用 requestAnimationFrame 对齐显示刷新率
  startSampling() {
    const sampleLoop = (timestamp: number) => {
      if (timestamp - this.lastSampleTime >= TARGET_INTERVAL) {
        this.collectSample();
        this.lastSampleTime = timestamp;
      }
      requestAnimationFrame(sampleLoop);
    };
    requestAnimationFrame(sampleLoop);
  }
}
```

### 5.2 丢帧检测与补偿

```typescript
interface FrameStats {
  expectedFrames: number;  // 期望帧数
  actualFrames: number;    // 实际采集帧数
  droppedFrames: number;   // 丢帧数
  compensationApplied: boolean; // 是否应用插值补偿
}

// 线性插值补偿丢帧
function interpolateMissingFrames(
  lastFrame: TrajectorySample,
  currentFrame: TrajectorySample,
  missedFrames: number
): TrajectorySample[] {
  const interpolated: TrajectorySample[] = [];
  
  for (let i = 1; i <= missedFrames; i++) {
    const t = i / (missedFrames + 1);
    interpolated.push({
      x: lastFrame.x + (currentFrame.x - lastFrame.x) * t,
      y: lastFrame.y + (currentFrame.y - lastFrame.y) * t,
      timestamp: lastFrame.timestamp + (currentFrame.timestamp - lastFrame.timestamp) * t,
      // ... 其他特征线性插值
    });
  }
  
  return interpolated;
}
```

### 5.3 性能监控

```typescript
class PerformanceMonitor {
  private frameTimings: number[] = [];
  private maxSamples = 60; // 1秒窗口
  
  recordFrame(timestamp: number) {
    this.frameTimings.push(timestamp);
    if (this.frameTimings.length > this.maxSamples) {
      this.frameTimings.shift();
    }
  }
  
  getMetrics() {
    const intervals = [];
    for (let i = 1; i < this.frameTimings.length; i++) {
      intervals.push(this.frameTimings[i] - this.frameTimings[i-1]);
    }
    
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const jitter = Math.sqrt(
      intervals.reduce((sum, iv) => sum + Math.pow(iv - avgInterval, 2), 0) / intervals.length
    );
    
    return {
      actualFrequency: 1000 / avgInterval,
      jitter: jitter,
      dropRate: Math.max(0, 1 - (1000 / avgInterval) / 60),
    };
  }
}
```

---

## 6. 数据存储策略

### 6.1 分层存储

```
┌─────────────────────────────────────────────────────────┐
│                      内存层 (RAM)                        │
│  - RingBuffer: 最近50帧 (用于实时识别)                    │
│  - 生命周期: 页面会话期间                                │
├─────────────────────────────────────────────────────────┤
│                    热存储层 (IndexedDB)                  │
│  - 当前会话完整数据                                      │
│  - 加密存储，会话结束后7天删除                           │
│  - 最大容量: 50MB                                        │
├─────────────────────────────────────────────────────────┤
│                    温存储层 (LocalStorage)               │
│  - 用户设置、同意记录                                    │
│  - 特征摘要统计                                          │
├─────────────────────────────────────────────────────────┤
│                    冷存储层 (云端)                       │
│  - 脱敏后的特征向量 (12维)                               │
│  - 聚合后的统计模型                                      │
│  - 用户标签 (人工标注结果)                               │
└─────────────────────────────────────────────────────────┘
```

### 6.2 数据生命周期

```
采集 ──→ 内存缓冲 (50帧) ──→ 特征提取 ──→ 本地加密存储
                              │
                              ▼
              ┌───────────────┴───────────────┐
              ▼                               ▼
        [保留7天]                        [立即上传]
        原始坐标数据                      脱敏特征向量
              │                               │
              ▼                               ▼
        7天后自动删除                    云端分析存储
                                              │
                                              ▼
                                        模型训练/更新
```

---

## 7. 接口规范

### 7.1 核心接口定义

详见: `lib/alice/collector.ts`

### 7.2 使用示例

```typescript
import { AliceTrajectoryCollector, PrivacyLevel } from '@/lib/alice/collector';

// 初始化收集器
const collector = new AliceTrajectoryCollector({
  targetFrequency: 60,
  bufferSize: 50,
  privacyLevel: PrivacyLevel.STANDARD,
});

// 请求用户授权
const hasConsent = await collector.requestConsent();
if (!hasConsent) return;

// 开始采集会话
collector.startSession({
  pageUrl: window.location.href,
  metadata: { task: 'navigation' }
});

// 自动收集PointerEvent...

// 获取实时特征 (用于悬浮球响应)
collector.on('features:extracted', (features) => {
  floatingBall.updatePrediction(features);
});

// 结束会话并上传
collector.endSession().then((session) => {
  console.log(`Collected ${session.sampleCount} samples`);
});
```

---

## 8. 自测验证

### 8.1 自测矩阵

| 测试ID | 测试项 | 验证方法 | 通过标准 |
|--------|--------|----------|----------|
| ML-001 | 脱敏后不可还原 | 对同一坐标多次脱敏，检查方差 | 原始坐标无法从脱敏数据中重建，重建误差 > 50px |
| ML-002 | 12维特征完整性 | 采集100个样本，检查特征数组长度 | 100%样本包含12维特征，无缺项 |
| ML-003 | 采集频率60Hz无丢帧 | 使用performance.now()统计帧间隔 | 平均帧率 ≥ 58Hz，丢帧率 < 5% |

### 8.2 ML-001 脱敏验证

```typescript
// 验证脚本
function testIrreversibility() {
  const original = { x: 500, y: 300 };
  const results = [];
  
  // 多次脱敏
  for (let i = 0; i < 1000; i++) {
    results.push(perturbCoordinate(original.x, original.y));
  }
  
  // 计算重建误差
  const avgX = results.reduce((s, r) => s + r.x, 0) / results.length;
  const avgY = results.reduce((s, r) => s + r.y, 0) / results.length;
  const error = Math.sqrt(Math.pow(avgX - original.x, 2) + Math.pow(avgY - original.y, 2));
  
  console.assert(error > 50, '脱敏强度不足，坐标可还原');
  return error;
}
```

### 8.3 ML-002 特征完整性验证

```typescript
function testFeatureCompleteness(samples: TrajectorySample[]) {
  const results = {
    total: samples.length,
    complete: 0,
    missing: [] as string[]
  };
  
  const requiredFeatures = [
    'x', 'y', 'timestamp', 'velocity', 'acceleration',
    'curvature', 'jerk', 'pressure', 'tiltX', 'tiltY',
    'hoverDistance', 'contactArea'
  ];
  
  for (const sample of samples) {
    const hasAll = requiredFeatures.every(f => sample[f as keyof TrajectorySample] !== undefined);
    if (hasAll) {
      results.complete++;
    } else {
      const missing = requiredFeatures.filter(f => sample[f as keyof TrajectorySample] === undefined);
      results.missing.push(...missing);
    }
  }
  
  console.assert(results.complete === results.total, `特征缺失: ${results.missing.join(', ')}`);
  return results;
}
```

### 8.4 ML-003 帧率验证

```typescript
async function testFrameRate(duration = 5000) {
  const collector = new AliceTrajectoryCollector({ targetFrequency: 60 });
  const timestamps: number[] = [];
  
  collector.on('sample', (s: TrajectorySample) => {
    timestamps.push(s.timestamp);
  });
  
  collector.startSession();
  await new Promise(r => setTimeout(r, duration));
  collector.endSession();
  
  const expectedFrames = (duration / 1000) * 60;
  const actualFrames = timestamps.length;
  const dropRate = (expectedFrames - actualFrames) / expectedFrames;
  
  // 计算抖动
  const intervals = timestamps.slice(1).map((t, i) => t - timestamps[i]);
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const actualFreq = 1000 / avgInterval;
  
  console.assert(actualFreq >= 58, `帧率不足: ${actualFreq.toFixed(2)}Hz`);
  console.assert(dropRate < 0.05, `丢帧率过高: ${(dropRate * 100).toFixed(2)}%`);
  
  return { actualFreq, dropRate, jitter: calculateJitter(intervals) };
}
```

---

## 9. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 隐私泄露 | 低 | 高 | 本地加密 + 差分隐私 + 不上传原始坐标 |
| 性能下降 | 中 | 中 | Web Worker  offload + 节流采样 |
| 数据不足 | 中 | 高 | 自动降级到启发式规则 + 云端Fallback |
| 存储溢出 | 低 | 中 | 自动GC + 配额管理 + 7天自动删除 |

---

## 10. 参考文档

- [ID-64] Alice悬浮球设计规格
- [ID-95] ML行为预测需求文档
- [GDPR] Regulation (EU) 2016/679
- [Privacy] lib/alice/ml/privacy-guard.ts

---

[TERMINATE:ALICE-ML-001]
交付物: design/alice/b07-data-pipeline.md, lib/alice/collector.ts
自测状态: ML-001/002/003 [已通过设计审查，待集成测试]
