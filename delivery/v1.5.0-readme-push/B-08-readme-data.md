# Appendix A: 数据字典与接口定义

## A.1 TypeScript 核心接口定义

### A.1.1 IContextChunk - RAG 上下文分片接口

```typescript
interface IContextChunk {
  /** 分片唯一标识符（UUID v4格式） */
  id: string;
  
  /** 分片文本内容 */
  content: string;
  
  /** 向量嵌入（可选，用于语义检索） */
  vector?: Float32Array;
  
  /** 元数据信息 */
  metadata: IChunkMetadata;
  
  /** 内容SHA256校验和，用于完整性验证 */
  sha256: string;
}

interface IChunkMetadata {
  /** 来源文档ID */
  sourceId: string;
  
  /** 文档类型：code | doc | conversation */
  docType: 'code' | 'doc' | 'conversation';
  
  /** 创建时间戳 */
  createdAt: number;
  
  /** 分片在原文档中的起始位置 */
  position: { start: number; end: number };
  
  /** 语言标识（代码片段） */
  language?: string;
  
  /** 标签集合 */
  tags?: string[];
}
```

### A.1.2 IRAGRetriever - RAG 检索器接口

```typescript
interface IRAGRetriever {
  /**
   * 执行语义检索
   * @param query - 查询文本
   * @param topK - 返回结果数量
   * @returns 匹配的分片列表
   */
  retrieve(query: string, topK: number): Promise<IContextChunk[]>;
  
  /**
   * 存储分片到向量数据库
   * @param chunks - 待存储的分片数组
   */
  store(chunks: IContextChunk[]): Promise<void>;
}

interface IRAGConfig {
  /** 向量维度（默认 768） */
  vectorDimension: number;
  
  /** 相似度阈值（0.0 ~ 1.0） */
  similarityThreshold: number;
  
  /** 重排序模型配置 */
  reranker?: {
    enabled: boolean;
    model: string;
    topN: number;
  };
}
```

---

## A.2 MouseTrajectory 12维特征定义

鼠标轨迹分析模块使用 12 维特征向量进行行为识别与生物特征验证：

| 维度序号 | 特征名称 | 数据类型 | 单位 | 描述 |
|:-------:|:---------|:---------|:-----|:-----|
| 1 | `x` | number | px | 鼠标X轴坐标 |
| 2 | `y` | number | px | 鼠标Y轴坐标 |
| 3 | `timestamp` | number | ms | 采样时间戳（相对起始） |
| 4 | `velocity` | number | px/ms | 瞬时速度（一阶导数） |
| 5 | `acceleration` | number | px/ms² | 瞬时加速度（二阶导数） |
| 6 | `curvature` | number | rad⁻¹ | 轨迹曲率 |
| 7 | `jerk` | number | px/ms³ | 加加速度（三阶导数） |
| 8 | `pressure` | number | 0-1 | 触控压力（支持设备） |
| 9 | `tiltX` | number | degrees | 笔具X轴倾斜角度 |
| 10 | `tiltY` | number | degrees | 笔具Y轴倾斜角度 |
| 11 | `hoverDistance` | number | mm | 悬停距离（支持设备） |
| 12 | `contactArea` | number | mm² | 接触面积（触控设备） |

### 特征采样示例

```typescript
interface MouseTrajectoryPoint {
  x: number;              // 1
  y: number;              // 2
  timestamp: number;      // 3
  velocity: number;       // 4
  acceleration: number;   // 5
  curvature: number;      // 6
  jerk: number;           // 7
  pressure: number;       // 8
  tiltX: number;          // 9
  tiltY: number;          // 10
  hoverDistance: number;  // 11
  contactArea: number;    // 12
}

type MouseTrajectory = MouseTrajectoryPoint[];
```

### 特征计算说明

```
velocity = √(dx² + dy²) / dt
acceleration = d(velocity) / dt
jerk = d(acceleration) / dt
curvature = |dx·d²y - dy·d²x| / (dx² + dy²)^(3/2)
```

---

## A.3 环境变量配置表 (.env.local)

### A.3.1 API 配置

| 变量名 | 说明 | 类型 | 必填 | 示例值 |
|:-------|:-----|:-----|:----:|:-------|
| `OPENROUTER_API_KEY` | OpenRouter API 密钥，用于访问 GPT-4/Gemini 等模型 | string | ✅ | `sk-or-v1-xxxxxxxx...` |
| `OR_IP_DIRECT` | IP 直连开关，绕过 DNS 解析直接连接 | boolean | ❌ | `true` |

### A.3.2 本地模型配置

| 变量名 | 说明 | 类型 | 必填 | 示例值 |
|:-------|:-----|:-----|:----:|:-------|
| `LCR_LOCAL_ENDPOINT` | 本地 LLM 服务端点（Ollama/LM Studio） | string | ❌ | `http://localhost:11434` |

### A.3.3 ONNX 模型配置

| 变量名 | 说明 | 类型 | 必填 | 示例值 |
|:-------|:-----|:-----|:----:|:-------|
| `ALICE_ONNX_MODEL` | Alice ML ONNX 模型文件路径 | string | ❌ | `./models/alice.onnx` |

### 完整配置示例

```bash
# API 密钥配置
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 网络直连（解决 DNS 污染）
OR_IP_DIRECT=true

# 本地模型端点
LCR_LOCAL_ENDPOINT=http://localhost:11434

# ONNX 模型路径
ALICE_ONNX_MODEL=./models/alice.onnx
```

---

## A.4 版本信息

- **文档版本**: v1.5.0
- **最后更新**: 2026-02-17
- **关联章节**: Chapter 2 (架构), Chapter 3 (MVP功能)

---

## 自测验证清单

| 自测点 | 描述 | 状态 |
|:-------|:-----|:----:|
| [README-022] | IContextChunk 接口包含 sha256 校验和字段 | ✅ |
| [README-023] | MouseTrajectory 12维特征完整定义 | ✅ |
| [README-024] | 配置表包含 OPENROUTER_API_KEY 与 OR_IP_DIRECT | ✅ |
