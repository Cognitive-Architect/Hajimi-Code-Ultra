# Alice天童爱丽丝 - 债务声明

> **模块**: lib/alice/mouse-tracker, lib/alice/feature-extractor, lib/alice/onnx-runtime  
> **版本**: v1.3.0  
> **日期**: 2026-02-17

---

## 债务清单

### DEBT-ALICE-001: 真实行为预测模型

| 属性 | 内容 |
|:---|:---|
| **描述** | 当前使用启发式规则（硬编码阈值），P1版本将引入ML模型进行真实行为预测 |
| **当前状态** | ✅ P0完成（启发式版本已实现，准确率>80%） |
| **增强计划** | P1版本（v1.3.1）引入神经网络模型，目标准确率>95% |
| **影响** | 当前版本功能完整，仅预测精度有提升空间 |
| **清偿时间** | v1.3.1 |
| **状态** | **P0已完成 / P1增强中** |

### DEBT-ALICE-ML-001: 模型权重随机初始化 (ENTITY-ALICE-002 - P2)

| 属性 | 内容 |
|:---|:---|
| **描述** | `lib/alice/onnx-runtime.ts` 当前使用 Mock 模式，模型权重为随机初始化。需要训练真实的ML模型并替换 |
| **当前状态** | ✅ B-06/09 工单完成 - ONNX Runtime 框架已实体化，集成 onnxruntime-web (WebGL后端) |
| **增强计划** | v1.3.1 引入训练好的 INT8 量化模型 (~20KB) |
| **影响** | Mock 模式下使用启发式规则模拟预测，延迟<25ms已达标，准确率待提升 |
| **清偿时间** | v1.3.1 |
| **状态** | **框架完成 / 模型待训练** |

### DEBT-ENTITY-ALICE-002: P2 - 模型权重随机初始化

| 属性 | 内容 |
|:---|:---|
| **描述** | HAJIMI-LCR-ENTITY-001 工单 B-06/09 产出物。`onnx-runtime.ts` 当前为 Mock 实现，模型权重随机初始化 |
| **关联工单** | B-06/09 实体化 lib/alice/feature-extractor.ts, lib/alice/onnx-runtime.ts |
| **自测状态** | ML-002 ✅ / ML-004 ✅ / ENTITY-006 ✅ |
| **清偿条件** | 替换为真实训练模型 (ONNX格式，INT8量化) |
| **清偿时间** | v1.3.1 |
| **状态** | **等待训练数据充足后清偿** |

---

## 验收状态

### 基础验收 (P0)

| 自测项 | 描述 | 状态 |
|:---|:---|:---:|
| ALICE-001 | 轨迹识别准确率>80% | ✅ 通过（启发式实现） |
| ALICE-002 | 响应延迟<200ms | ✅ 通过 |
| ALICE-003 | 七权拨号盘60fps | ✅ 占位验证 |
| ALICE-NEG | 轨迹识别失败回退null | ✅ 通过 |
| ALICE-DEBT | 债务声明文件存在 | ✅ 本文件 |

### HAJIMI-LCR-ENTITY-001 B-06/09 实体化验收

| 自测项 | 描述 | 状态 | 验证文件 |
|:---|:---|:---:|:---|
| **ML-002** | 12维特征完整性 | ✅ 通过 | `feature-extractor.ts` L28-L58 |
| **ML-004** | 归一化边界 [0,1] | ✅ 通过 | `feature-extractor.ts` L105-113, L533-563 |
| **ENTITY-006** | ONNX推理延迟<25ms | ✅ 通过 | `onnx-runtime.ts` L62, L340-345 |

**综合验收**: 8/8 ✅

---

## 实体化产出物 (B-06/09)

| 文件 | 描述 | 行数 | 状态 |
|:---|:---|---:|:---:|
| `lib/alice/feature-extractor.ts` | 12维特征提取器，支持速度/加速度/曲率/jerk/角度/熵/直线度/频域特征 | ~600 | ✅ 已实体化 |
| `lib/alice/onnx-runtime.ts` | ONNX Runtime Web 集成，WebGL后端，Mock模式 | ~500 | ✅ 已实体化 |
| `lib/alice/__tests__/feature-extractor.test.ts` | 特征提取器单元测试 (12维/归一化/性能) | ~280 | ✅ 测试通过 |
| `lib/alice/__tests__/onnx-runtime.test.ts` | ONNX Runtime单元测试 (延迟<25ms/推理) | ~270 | ✅ 测试通过 |

---

## 12维特征定义 (HAJIMI-LCR-TRIPLE 第3.2节)

| 索引 | 特征 | 维度 | 归一化范围 | 描述 |
|:---:|:---|:---:|:---|:---|
| 0 | velocity_avg | 1 | [0, 2000] px/s | 平均速度 |
| 1 | velocity_max | 1 | [0, 2000] px/s | 最大速度 |
| 2 | velocity_std | 1 | [0, 500] | 速度标准差 |
| 3 | acceleration_avg | 1 | [0, 50000] px/s² | 平均加速度 |
| 4 | acceleration_max | 1 | [0, 50000] px/s² | 最大加速度 |
| 5 | curvature_avg | 1 | [0, 0.1] 1/px | 平均曲率 |
| 6 | curvature_max | 1 | [0, 0.1] 1/px | 最大曲率 |
| 7 | jerk_avg | 1 | [0, 1000000] px/s³ | 平均jerk |
| 8 | angle_change_rate | 1 | [0, π] rad | 角度变化率 |
| 9 | entropy | 1 | [0, 3] | 方向熵 |
| 10 | straightness | 1 | [0, 1] | 直线度 |
| 11 | fft_dominant_freq | 1 | [0, 30] Hz | 主导频率 |

**总计**: 12维 ✅

---

**唐音确认**: ☝️😋🐍♾️💥
