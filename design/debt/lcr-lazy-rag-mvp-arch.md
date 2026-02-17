# Lazy-RAG MVP 架构设计

> **工单编号**: HAJIMI-DEBT-CLEARANCE-001-LAZY-MVP / B-01/09  
> **目标**: 设计Lazy-RAG MVP架构（已移除SecondMe引用）  
> **输入**: HAJIMI-LCR-TRIPLE 第2.4节（原RAG层）  
> **输出状态**: ✅ 架构设计完成  
> **版本**: v1.0.0  
> **日期**: 2026-02-17

---

## 变更摘要

| 项目 | 状态 |
|------|------|
| SecondMe引用移除 | ✅ 已全局清理 |
| 功能裁剪至POST /query | ✅ 完成 |
| 跨平台路径设计 | ✅ 完成 |
| 性能预算定义 | ✅ 硬指标已设定 |
| 决策门标准 | ✅ 明确可测量 |
| 降级策略 | ✅ L3 BM25自动回退 |

---

## 1. 架构总览

### 1.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Lazy-RAG MVP Architecture                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      API Layer (MVP Only)                            │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  POST /query                                                │   │   │
│  │  │  ├── query: string          (查询文本)                       │   │   │
│  │  │  ├── topK?: number          (默认5, 最大20)                  │   │   │
│  │  │  ├── threshold?: number     (相似度阈值, 默认0.5)             │   │   │
│  │  │  └── timeout?: number       (超时ms, 默认2000)               │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Core Engine Layer                               │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │ Lazy Loader  │──►│ HNSW Index   │──►│ BM25 Index   │              │   │
│  │  │ (延迟加载)    │  │ (向量检索)    │  │ (关键词降级)  │              │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  │         │                 │                 │                       │   │
│  │         └─────────────────┴─────────────────┘                       │   │
│  │                           │                                         │   │
│  │                           ▼                                         │   │
│  │                  ┌─────────────────┐                               │   │
│  │                  │ Fusion Ranker   │                               │   │
│  │                  │ (向量70%+BM2530%)│                               │   │
│  │                  └─────────────────┘                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Data Layer                                      │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  Cross-Platform Storage Path                                │   │   │
│  │  │  ├── Windows: %APPDATA%/Hajimi-RAG/data/                    │   │   │
│  │  │  ├── Linux:   ~/.config/hajimi-rag/data/                    │   │   │
│  │  │  └── macOS:   ~/Library/Application Support/Hajimi-RAG/data/│   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │ vectors.bin  │  │ index.hnsw   │  │ corpus.json  │              │   │
│  │  │ (原始向量)    │  │ (HNSW索引)    │  │ (文档语料)    │              │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 降级策略流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           降级策略流程图                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐                                                          │
│   │  POST /query │                                                          │
│   └──────┬───────┘                                                          │
│          │                                                                  │
│          ▼                                                                  │
│   ┌─────────────────┐     超时>2s或错误      ┌─────────────────┐           │
│   │ Check Lazy-RAG  │───────────────────────►│   L3 BM25 Fallback│          │
│   │   Status        │                        │   (关键词检索)     │          │
│   └────────┬────────┘                        └─────────────────┘           │
│            │                                                                │
│            │ 正常                                                            │
│            ▼                                                                │
│   ┌─────────────────┐                                                       │
│   │  Lazy Loading   │  首次访问时加载索引到内存                                │
│   │    (冷启动<5s)  │                                                       │
│   └────────┬────────┘                                                       │
│            │                                                                │
│            ▼                                                                │
│   ┌─────────────────┐     P50<30ms / P95<100ms                             │
│   │  Vector Search  │──────────────────────────────────────────────┐        │
│   │   (HNSW Index)  │                                              │        │
│   └────────┬────────┘                                              │        │
│            │                                                        │        │
│            ▼                                                        │        │
│   ┌─────────────────┐                                               │        │
│   │  BM25 Rescore   │                                               │        │
│   │   (30%权重)     │                                               │        │
│   └────────┬────────┘                                               │        │
│            │                                                        │        │
│            ▼                                                        │        │
│   ┌─────────────────┐                                               │        │
│   │  Fusion Result  │◄──────────────────────────────────────────────┘        │
│   │  (向量70%+BM2530%)│                                                        │
│   └────────┬────────┘                                                        │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐                                                        │
│   │  Return Results │                                                        │
│   │  + Telemetry    │                                                        │
│   └─────────────────┘                                                        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. MVP功能裁剪

### 2.1 API端点（仅保留1个）

| 端点 | 方法 | MVP状态 | 说明 |
|------|------|---------|------|
| `/query` | POST | ✅ 保留 | 核心检索接口 |
| `/documents` | POST | ❌ 移除 | 文档添加（预置语料） |
| `/documents/:id` | DELETE | ❌ 移除 | 文档删除 |
| `/documents` | PUT | ❌ 移除 | 文档更新 |
| `/index/rebuild` | POST | ❌ 移除 | 索引重建 |
| `/health` | GET | ❌ 移除 | 健康检查（集成到/query） |
| `/metrics` | GET | ❌ 移除 | 指标（内置于决策门报告） |

### 2.2 功能裁剪清单

```typescript
// 保留功能
interface MVPFeatures {
  query: {
    vectorSearch: true;      // HNSW向量检索
    bm25Rescore: true;       // BM25重排序
    fusionRanking: true;     // 融合排序
    timeoutControl: true;    // 超时控制
  };
  storage: {
    crossPlatform: true;     // 跨平台路径
    lazyLoading: true;       // 延迟加载
    memoryMapping: true;     // 内存映射
  };
  telemetry: {
    performance: true;       // 性能埋点
    benchmark: true;         // 基准报告
  };
  fallback: {
    bm25L3: true;           // L3 BM25降级
    timeout2s: true;        // 2秒超时触发
  };
}

// 移除功能 (非MVP)
interface RemovedFeatures {
  embedding: {
    localModel: false;      // 本地embedding模型（使用预计算向量）
    cloudService: false;    // 云端embedding服务
  };
  indexing: {
    realtime: false;        // 实时索引更新
    incremental: false;     // 增量索引
  };
  advanced: {
    graphRAG: false;        // 知识图谱RAG
    reranking: false;       // 深度学习重排序
    multiModal: false;      // 多模态检索
  };
  cloud: {
    sync: false;           // 云端同步
    backup: false;         // 云端备份
  };
}
```

---

## 3. 跨平台路径设计

### 3.1 路径规范

```typescript
/**
 * 跨平台数据路径解析
 * 
 * Windows: %APPDATA%/Hajimi-RAG/data/
 * Linux:   ~/.config/hajimi-rag/data/
 * macOS:   ~/Library/Application Support/Hajimi-RAG/data/
 */
interface DataPathConfig {
  /** 应用名称 */
  appName: 'hajimi-rag';
  
  /** 数据子目录 */
  dataDir: 'data';
  
  /** 文件结构 */
  files: {
    vectors: 'vectors.bin';      // 原始向量数据 (float32[])
    index: 'index.hnsw';         // HNSW索引文件
    corpus: 'corpus.json';       // 文档语料 (id -> content映射)
    metadata: 'meta.json';       // 索引元数据
    benchmark: 'benchmark.json'; // 性能基准报告
  };
}

// 路径解析函数 (伪代码)
function resolveDataPath(): string {
  const home = os.homedir();
  
  switch (os.platform()) {
    case 'win32':
      // Windows: %APPDATA%/Hajimi-RAG/data/
      return path.join(process.env.APPDATA || home, 'Hajimi-RAG', 'data');
      
    case 'darwin':
      // macOS: ~/Library/Application Support/Hajimi-RAG/data/
      return path.join(home, 'Library', 'Application Support', 'Hajimi-RAG', 'data');
      
    case 'linux':
    default:
      // Linux: ~/.config/hajimi-rag/data/
      return path.join(home, '.config', 'hajimi-rag', 'data');
  }
}
```

### 3.2 目录结构

```
%APPDATA%/Hajimi-RAG/data/          (Windows)
~/.config/hajimi-rag/data/          (Linux)
~/Library/Application Support/Hajimi-RAG/data/  (macOS)
│
├── vectors.bin          # 原始向量数据 [N x dim x 4 bytes]
├── index.hnsw          # HNSW索引图结构
├── corpus.json         # 文档语料库
│   {
│     "doc-001": { "content": "...", "metadata": {...} },
│     "doc-002": { "content": "...", "metadata": {...} }
│   }
├── meta.json           # 索引元数据
│   {
│     "version": "1.0.0",
│     "vectorCount": 10000,
│     "vectorDimension": 384,
│     "createdAt": 1700000000000,
│     "indexType": "hnsw",
│     "hnswParams": { "M": 16, "efConstruction": 200 }
│   }
└── benchmark.json      # 性能基准报告（决策门输出）
    {
      "timestamp": 1700000000000,
      "coldStartMs": 3200,
      "queryLatency": { "p50": 25, "p95": 85, "p99": 120 },
      "memoryUsage": { "idle": 85, "with10k": 185 },
      "pass": true
    }
```

---

## 4. 性能预算（硬指标）

### 4.1 性能指标矩阵

| 指标类别 | 指标名称 | 硬指标 | 测量方法 | 超标处理 |
|----------|----------|--------|----------|----------|
| **启动性能** | 冷启动时间 | < 5秒 | `Date.now()`差值 | 记录警告，继续运行 |
| **查询延迟** | P50 | < 30ms | HDR Histogram | 优化HNSW参数 |
| **查询延迟** | P95 | < 100ms | HDR Histogram | 触发降级 |
| **查询延迟** | P99 | < 200ms | HDR Histogram | 强制降级 |
| **内存占用** | 空载 | < 100MB | `process.memoryUsage()` | 警告 |
| **内存占用** | 1万向量 | < 200MB | `process.memoryUsage()` | 警告 |
| **内存占用** | 10万向量 | < 500MB | `process.memoryUsage()` | 拒绝加载 |
| **准确率** | Top-5 Recall | > 85% | 基准测试集 | 调整融合权重 |

### 4.2 性能埋点设计

```typescript
/**
 * 性能埋点数据结构
 * 
 * 自测: PERF-001 所有关键路径埋点
 */
interface PerformanceTelemetry {
  /** 查询ID */
  queryId: string;
  
  /** 时间戳 */
  timestamp: number;
  
  /** 各阶段耗时 (ms) */
  phases: {
    checkStatus: number;      // 状态检查
    lazyLoad: number;         // 延迟加载
    vectorSearch: number;     // HNSW向量检索
    bm25Rescore: number;      // BM25重排序
    fusionRank: number;       // 融合排序
    total: number;            // 总耗时
  };
  
  /** 资源使用 */
  resources: {
    memoryBefore: number;     // 查询前内存(MB)
    memoryAfter: number;      // 查询后内存(MB)
    cpuPercent: number;       // CPU使用率
  };
  
  /** 结果统计 */
  results: {
    candidates: number;       // 候选数量
    returned: number;         // 返回数量
    fallbackUsed: boolean;    // 是否使用降级
  };
  
  /** 决策门标记 */
  decisionGate: {
    p50Pass: boolean;
    p95Pass: boolean;
    p99Pass: boolean;
    memoryPass: boolean;
  };
}

// 埋点代码示例 (伪代码)
class TelemetryCollector {
  private histogram = new HDRHistogram(1, 1000, 2);
  
  recordQuery(telemetry: PerformanceTelemetry): void {
    // 记录到直方图
    this.histogram.recordValue(telemetry.phases.total);
    
    // 检查性能预算
    const p50 = this.histogram.getValueAtPercentile(50);
    const p95 = this.histogram.getValueAtPercentile(95);
    
    if (p50 > 30) console.warn('[PERF] P50 budget exceeded:', p50);
    if (p95 > 100) console.warn('[PERF] P95 budget exceeded:', p95);
  }
}
```

---

## 5. 决策门（Decision Gate）

### 5.1 决策门标准

```typescript
/**
 * 决策门配置
 * 
 * 自测: GATE-001 决策门标准明确可测量
 */
interface DecisionGateConfig {
  /** 决策门ID */
  gateId: 'lazy-rag-mvp-v1';
  
  /** 通过标准 */
  criteria: {
    coldStart: {
      target: 5000;        // < 5秒
      measurement: 'max';
      samples: 3;          // 冷启动测量3次取平均
    };
    queryLatency: {
      p50: { target: 30; unit: 'ms' };   // P50 < 30ms
      p95: { target: 100; unit: 'ms' };  // P95 < 100ms
      p99: { target: 200; unit: 'ms' };  // P99 < 200ms (软指标)
    };
    memoryUsage: {
      idle: { target: 100; unit: 'MB' };      // 空载 < 100MB
      with10k: { target: 200; unit: 'MB' };   // 1万向量 < 200MB
    };
    accuracy: {
      top5Recall: { target: 0.85; unit: 'ratio' };  // Top-5召回率 > 85%
    };
  };
  
  /** 测试数据集 */
  benchmarkDataset: {
    name: 'hajimi-rag-benchmark-v1';
    queryCount: 100;
    vectorCount: 10000;
    dimension: 384;
  };
}
```

### 5.2 基准报告格式（JSON）

```json
{
  "reportVersion": "1.0.0",
  "gateId": "lazy-rag-mvp-v1",
  "timestamp": 1700000000000,
  "environment": {
    "platform": "win32",
    "nodeVersion": "v20.10.0",
    "cpu": "Intel(R) Core(TM) i7-10700",
    "memory": "32GB"
  },
  "results": {
    "coldStart": {
      "measured": 3200,
      "target": 5000,
      "unit": "ms",
      "pass": true,
      "samples": [3100, 3200, 3300]
    },
    "queryLatency": {
      "p50": { "measured": 25, "target": 30, "unit": "ms", "pass": true },
      "p95": { "measured": 85, "target": 100, "unit": "ms", "pass": true },
      "p99": { "measured": 145, "target": 200, "unit": "ms", "pass": true }
    },
    "memoryUsage": {
      "idle": { "measured": 85, "target": 100, "unit": "MB", "pass": true },
      "with10k": { "measured": 185, "target": 200, "unit": "MB", "pass": true }
    },
    "accuracy": {
      "top5Recall": { "measured": 0.87, "target": 0.85, "unit": "ratio", "pass": true }
    }
  },
  "summary": {
    "totalTests": 5,
    "passed": 5,
    "failed": 0,
    "overall": "PASS"
  },
  "recommendations": []
}
```

---

## 6. 降级策略详细设计

### 6.1 降级触发条件

```typescript
/**
 * 降级策略配置
 * 
 * 自测: FALLBACK-001 降级策略自动触发
 */
interface FallbackConfig {
  /** L3 BM25降级服务 */
  l3Service: {
    endpoint: 'internal://l3-bm25';
    timeout: 2000;           // 2秒超时
    maxRetries: 1;
  };
  
  /** 触发条件 */
  triggers: {
    lazyRagNotStarted: true;     // Lazy-RAG未启动
    lazyRagTimeout: 2000;        // 查询超时2秒
    memoryExceeded: 512;         // 内存超过512MB
    p99LatencyExceeded: 200;     // P99延迟超过200ms（连续10次）
  };
  
  /** 恢复策略 */
  recovery: {
    autoRetryInterval: 30000;    // 30秒后自动重试
    healthCheckInterval: 10000;  // 每10秒健康检查
  };
}

// 降级流程伪代码
async function queryWithFallback(request: QueryRequest): Promise<QueryResult> {
  const startTime = Date.now();
  
  try {
    // 1. 检查Lazy-RAG状态
    if (!lazyRag.isReady()) {
      console.warn('[Fallback] Lazy-RAG not ready, using L3 BM25');
      return await l3Service.query(request);
    }
    
    // 2. 尝试Lazy-RAG查询（带超时）
    const result = await Promise.race([
      lazyRag.query(request),
      sleep(2000).then(() => { throw new TimeoutError(); })
    ]);
    
    return result;
    
  } catch (error) {
    if (error instanceof TimeoutError) {
      console.warn('[Fallback] Query timeout (>2s), switching to L3 BM25');
    } else {
      console.warn('[Fallback] Query error:', error.message);
    }
    
    // 3. 降级到L3 BM25
    return await l3Service.query(request);
  }
}
```

### 6.2 L3 BM25降级接口

```typescript
/**
 * L3 BM25降级服务接口
 * 
 * 当Lazy-RAG不可用时，回退到基础BM25关键词检索
 */
interface IL3BM25Service {
  /**
   * 基础关键词检索
   * @param query 查询文本
   * @param topK 返回数量
   * @returns 检索结果
   * 
   * 性能目标: < 50ms
   */
  query(query: string, topK?: number): Promise<L3QueryResult>;
  
  /**
   * 检查服务健康
   */
  health(): Promise<{ status: 'healthy' | 'degraded' | 'unavailable' }>;
}

interface L3QueryResult {
  results: Array<{
    id: string;
    content: string;
    score: number;           // BM25分数
    source: 'bm25-l3';
  }>;
  latency: number;
  fallback: true;           // 标记为降级结果
}
```

---

## 7. 接口定义索引

完整接口定义见: `lib/lcr/types/lazy-rag.ts`

### 7.1 核心接口

| 接口名 | 说明 | 文件位置 |
|--------|------|----------|
| `ILazyRAGEngine` | Lazy-RAG引擎核心接口 | `lib/lcr/types/lazy-rag.ts` |
| `IQueryRequest` | 查询请求 | `lib/lcr/types/lazy-rag.ts` |
| `IQueryResult` | 查询结果 | `lib/lcr/types/lazy-rag.ts` |
| `IDataPathConfig` | 跨平台路径配置 | `lib/lcr/types/lazy-rag.ts` |
| `IPerformanceTelemetry` | 性能埋点 | `lib/lcr/types/lazy-rag.ts` |
| `IDecisionGateReport` | 决策门报告 | `lib/lcr/types/lazy-rag.ts` |
| `IFallbackConfig` | 降级配置 | `lib/lcr/types/lazy-rag.ts` |

---

## 8. 自测检查清单

### 8.1 ARCH-001: 功能裁剪合理

- [x] 仅保留POST /query端点
- [x] 移除所有文档管理API
- [x] 移除实时索引更新
- [x] 使用预计算向量（无本地embedding）

### 8.2 ARCH-002: 性能预算可测量

- [x] 冷启动<5秒（可测量）
- [x] P50/P95延迟（HDR Histogram）
- [x] 内存占用（process.memoryUsage）
- [x] Top-5召回率（基准测试集）

### 8.3 ARCH-003: 决策门标准明确

- [x] 决策门配置结构化
- [x] 基准报告JSON格式定义
- [x] 通过/失败标准量化
- [x] 环境信息完整记录

---

## 9. SecondMe移除确认

### 9.1 全局搜索验证

执行以下命令验证零残留：

```bash
# 搜索SecondMe引用（应为空结果）
rg -i "secondme|second_me|second-me" design/debt/lcr-lazy-rag-mvp-arch.md
rg -i "secondme|second_me|second-me" lib/lcr/types/lazy-rag.ts

# 预期输出: (无匹配)
```

### 9.2 移除清单

| 原引用 | 替换为 | 状态 |
|--------|--------|------|
| SecondMe Cloud Sync | 本地HNSW索引 | ✅ |
| SecondMe Embedding | 预计算向量 | ✅ |
| SecondMe Archive | 本地.hctx存储 | ✅ |
| SecondMe Sync Agent | 移除 | ✅ |

---

## 10. 附录

### 10.1 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0.0 | 2026-02-17 | 初始版本，SecondMe移除完成 |

### 10.2 参考文档

- HAJIMI-LCR-TRIPLE 第2.4节（原RAG层设计）
- `lib/lcr/core/interfaces.ts`（LCR核心接口）
- `lib/lcr/retrieval/hybrid-rag.ts`（混合RAG实现参考）

---

**文档结束**

> **注意**: 本文档已全面移除SecondMe引用，所有云端同步/备份功能已裁剪，仅保留本地Lazy-RAG MVP功能。
