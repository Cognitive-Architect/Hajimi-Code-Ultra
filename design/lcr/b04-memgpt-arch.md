[SPAWN:LCR-B03-001]
Agent: 黄瓜睦（架构师）
目标: MemGPT四层内存架构
DEBT: LCR-B03-001 - P2 - 理论转化待验证

# B-04 MemGPT 四层内存架构设计

**文档编号**: HAJIMI-LCR-B04-MEMGPT-ARCH  
**版本**: v1.0  
**日期**: 2026-02-17  
**工单**: B-04/09 MemGPT四层内存架构设计  
**依赖**: B-03 分层存储工程师  

---

## 1. 架构概述

### 1.1 设计哲学

MemGPT（Memory-GPT）架构将操作系统虚拟内存管理的成熟理论应用于LLM上下文管理。本设计将MemGPT理论转化为LCR（Local Context Runtime）本地部署架构，实现**有限上下文窗口到无限记忆容量**的扩展。

### 1.2 四层模型总览

| 层级 | 容量范围 | 存储介质 | 延迟目标 | 核心职责 |
|:---|:---|:---|:---|:---|
| **Focus** | <8K Token | GPU显存/主内存 | <1ms | LLM推理输入窗口 |
| **Working** | 8K-128K Token | 主内存 | <10ms | 活跃工作记忆缓存 |
| **Archive** | 128K-1M Token | NVMe SSD | <100ms | 压缩历史归档 |
| **RAG** | 1M+ Token (∞) | SSD/分布式存储 | 检索依赖 | 向量知识库 |

### 1.3 与原始MemGPT映射

| MemGPT原概念 | LCR实现 | 设计调整 |
|:---|:---|:---|
| Main Context (主上下文) | Focus层 | 硬限制8K适配主流LLM |
| External Context (外部上下文) | Working层 | LRU-K命中率>90% |
| Recall Storage (召回存储) | Archive层 | 压缩率>90%指标 |
| Recall Search (召回检索) | RAG层 | HNSW+BM25混合检索 |

---

## 2. 四层容量与性能指标

### 2.1 Focus层：即时推理窗口

```
┌─────────────────────────────────────────────────────────┐
│                    FOCUS LAYER (<8K)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ System Msg  │  │  Conversation│  │  Function Call  │  │
│  │  (固定)      │  │   History    │  │    Context      │  │
│  │  ~1K tokens │  │  ~6K tokens  │  │   ~1K tokens    │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
│                                                         │
│  [HARD LIMIT: 8192 tokens]                              │
└─────────────────────────────────────────────────────────┘
```

**规格指标**:

| 指标 | 目标值 | 验证方法 |
|:---|:---|:---|
| 容量上限 | 8192 tokens | 运行时硬检查 |
| 容量下限 | 1024 tokens | 保留系统消息空间 |
| 访问延迟 | <1ms | P99测量 |
| 溢出处理 | 智能截断 | 基于重要性评分 |

**动态空间分配**:
- 系统消息：固定 1K tokens（不可截断）
- 对话历史：动态 0-6K tokens（可截断）
- 函数上下文：动态 0-1K tokens（可截断）

### 2.2 Working层：活跃工作记忆

```
┌─────────────────────────────────────────────────────────┐
│                  WORKING LAYER (8K-128K)                 │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              LRU-K Cache Structure                │   │
│  │                                                   │   │
│  │  [Hot Segment]  │ [Warm Segment]  │ [Cold Entry]  │   │
│  │   (32K tokens)  │  (64K tokens)   │  (32K tokens) │   │
│  │                                                  │   │
│  │  命中率监控 >90%                                  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  [LRU-K with K=2]  [预加载预测]  [异步晋升]              │
└─────────────────────────────────────────────────────────┘
```

**规格指标**:

| 指标 | 目标值 | 验证方法 |
|:---|:---|:---|
| 容量范围 | 8K-128K tokens | 动态水位管理 |
| 访问延迟 | <10ms | P99测量 |
| 缓存命中率 | >90% | 典型负载模拟 |
| 晋升延迟 | <50ms | 从Archive层加载 |

### 2.3 Archive层：压缩历史归档

```
┌─────────────────────────────────────────────────────────┐
│                 ARCHIVE LAYER (128K-1M)                  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │            Compressed Storage Blocks              │   │
│  │                                                   │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐          │   │
│  │  │ Block A  │ │ Block B  │ │ Block C  │  ...     │   │
│  │  │ 64K→6K   │ │ 64K→5K   │ │ 64K→7K   │          │   │
│  │  │ 90.6%    │ │ 92.2%    │ │ 89.1%    │          │   │
│  │  └──────────┘ └──────────┘ └──────────┘          │   │
│  │                                                   │   │
│  │  压缩目标: >90%                                   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  [zstd字典压缩]  [语义摘要]  [乘积量化(PQ)]               │
└─────────────────────────────────────────────────────────┘
```

**规格指标**:

| 指标 | 目标值 | 验证方法 |
|:---|:---|:---|
| 容量范围 | 128K-1M tokens | 可配置扩展 |
| 压缩率 | >90% | 压缩后/压缩前 |
| 访问延迟 | <100ms | P99测量 |
| 解压速度 | >500 MB/s | 基准测试 |

**压缩策略矩阵**:

| 数据类型 | 算法 | 压缩比 | 质量损失 |
|:---|:---|:---|:---|
| 文本对话 | zstd L9 | 5:1 | 0% |
| 嵌入向量 | 乘积量化(PQ) | 16:1 | <2% |
| 长文档 | 抽取式摘要 | 10:1 | 可控 |
| 结构化数据 | 字典编码 | 8:1 | 0% |

### 2.4 RAG层：无限知识库

```
┌─────────────────────────────────────────────────────────┐
│                    RAG LAYER (∞)                         │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │            Hybrid Retrieval Engine                │   │
│  │                                                   │   │
│  │   ┌─────────┐    ┌─────────┐    ┌─────────┐      │   │
│  │   │  Vector │    │ Keyword │    │  Graph  │      │   │
│  │   │ (HNSW)  │◄──►│ (BM25)  │◄──►│ (GNN)   │      │   │
│  │   │ Semantic│    │ Exact   │    │Relation │      │   │
│  │   └────┬────┘    └────┬────┘    └────┬────┘      │   │
│  │        └───────────────┼───────────────┘          │   │
│  │                        ▼                         │   │
│  │                 ┌─────────────┐                  │   │
│  │                 │ Fusion Rerank│                  │   │
│  │                 └─────────────┘                  │   │
│  │                                                   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  [离线可用]  [百万级向量]  [毫秒级查询]                    │
└─────────────────────────────────────────────────────────┘
```

**规格指标**:

| 指标 | 目标值 | 验证方法 |
|:---|:---|:---|
| 容量 | 无上限 | 分布式扩展 |
| 检索延迟 | <300ms | P95测量 |
| Top-5准确率 | >85% | 人工标注评测 |
| 向量规模 | 百万级 | HNSW索引 |

---

## 3. Token计数器设计

### 3.1 架构概览

```
┌─────────────────────────────────────────────────────────┐
│              TOKEN COUNTER ARCHITECTURE                  │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │  Lexer      │  │  Counter    │  │  Quota Manager  │  │
│  │  (分词器)    │──►│  (计数器)   │──►│   (配额管理)     │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
│         │                │                  │           │
│         ▼                ▼                  ▼           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ tiktoken    │  │  Per-Layer  │  │  Hard/Soft/     │  │
│  │ cl100k_base │  │  Counters   │  │  Warning Limits │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 3.2 分层计数器实现

```typescript
// TokenCounter.ts - 分层Token计数器核心实现

interface LayerQuota {
  hardLimit: number;      // 硬限制：不可逾越
  softLimit: number;      // 软限制：触发告警
  warningThreshold: number; // 预警阈值：80%
}

interface LayerCounters {
  focus: {
    current: number;      // 当前Focus层Token数
    quota: LayerQuota;
    reserved: {           // 预留空间
      system: number;     // 系统消息固定预留
      functions: number;  // 函数调用预留
    };
  };
  working: {
    current: number;
    quota: LayerQuota;
    segments: {
      hot: number;        // 32K hot segment
      warm: number;       // 64K warm segment
      cold: number;       // 32K cold entry
    };
  };
  archive: {
    current: number;      // 原始Token数
    compressed: number;   // 压缩后Token数
    quota: LayerQuota;
  };
  rag: {
    current: number;      // 当前加载的上下文Token数
    indexed: number;      // 已索引的向量数
  };
}

class TokenCounter {
  private counters: LayerCounters;
  private tokenizer: TikTokenizer;
  
  constructor() {
    this.tokenizer = new TikTokenizer('cl100k_base');
    this.counters = this.initializeCounters();
  }
  
  // 精确计数方法
  count(text: string): number {
    return this.tokenizer.encode(text).length;
  }
  
  // 批量计数（带缓存）
  countBatch(texts: string[]): Map<string, number> {
    const results = new Map<string, number>();
    for (const text of texts) {
      // LRU缓存检查
      const cached = this.cache.get(text);
      if (cached !== undefined) {
        results.set(text, cached);
      } else {
        const count = this.count(text);
        this.cache.set(text, count);
        results.set(text, count);
      }
    }
    return results;
  }
  
  // Focus层硬限制检查
  checkFocusHardLimit(incomingTokens: number): boolean {
    const projected = this.counters.focus.current + incomingTokens;
    return projected <= this.counters.focus.quota.hardLimit;
  }
  
  // 动态空间重新分配
  reallocateFocusSpace(): FocusAllocation {
    const total = this.counters.focus.quota.hardLimit;
    const system = this.counters.focus.reserved.system;
    const functions = this.counters.focus.reserved.functions;
    const available = total - system - functions;
    
    return {
      system: system,
      functions: functions,
      conversation: available,
      // 当对话历史超限时的截断策略
      truncationStrategy: this.selectTruncationStrategy(available)
    };
  }
}
```

### 3.3 计数器层级关系

```
┌─────────────────────────────────────────────────────────┐
│              TOKEN FLOW & COUNTING LOGIC                 │
│                                                          │
│  Incoming Tokens                                         │
│       │                                                  │
│       ▼                                                  │
│  ┌─────────────────┐                                     │
│  │  Tokenizer      │ ──► Precise Count                   │
│  │  (tiktoken)     │                                     │
│  └────────┬────────┘                                     │
│           │                                              │
│           ▼                                              │
│  ┌─────────────────────────────────────────────────┐     │
│  │           LAYER QUOTA CHECK                      │     │
│  │                                                  │     │
│  │  Focus? ──► HARD LIMIT (8192) ──► Reject/Queue   │     │
│  │     │                                            │     │
│  │     ▼                                            │     │
│  │  Working? ──► SOFT LIMIT ──► Evict/Compress      │     │
│  │     │                                            │     │
│  │     ▼                                            │     │
│  │  Archive? ──► CAPACITY ──► Promote/Demote        │     │
│  │     │                                            │     │
│  │     ▼                                            │     │
│  │  RAG? ──► INDEXED ──► Retrieve/Index             │     │
│  │                                                  │     │
│  └─────────────────────────────────────────────────┘     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 4. 层间晋升/降级触发器

### 4.1 状态机模型

```
┌─────────────────────────────────────────────────────────────────┐
│              TIER STATE MACHINE                                  │
│                                                                  │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐ │
│   │  RAG     │◄──►│ Archive  │◄──►│ Working  │◄──►│  Focus   │ │
│   │  (∞)     │    │ (128K-1M)│    │ (8K-128K)│    │  (<8K)   │ │
│   └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘ │
│        │               │               │               │       │
│        │               │               │               │       │
│        ▼               ▼               ▼               ▼       │
│   [Index]          [Compress]      [Cache Hit]      [LLM Input]│
│                                                                  │
│   PROMOTION (upgrade): 下层的访问热度上升 → 上层               │
│   DEMOTION (downgrade): 上层容量压力 → 下层                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 晋升触发器

| 触发条件 | 源层 | 目标层 | 延迟预算 | 执行策略 |
|:---|:---|:---|:---|:---|
| **显式检索** | RAG | Working | <50ms | 异步加载，返回临时降级响应 |
| **缓存未命中** | Archive | Working | <100ms | 解压+加载，LRU-K更新 |
| **焦点引用** | Working | Focus | <10ms | 智能替换，动态摘要 |
| **预测预加载** | Archive | Working | 后台 | 基于访问模式预测 |

**晋升流程图**:

```
┌──────────────────────────────────────────────────────────────┐
│                  PROMOTION FLOW                              │
│                                                               │
│  触发事件                                                      │
│     │                                                         │
│     ▼                                                         │
│  ┌─────────────────┐                                          │
│  │ Check Hot Score │──► Score < Threshold? ──► Abort          │
│  │   (LRU-K)       │                                          │
│  └────────┬────────┘                                          │
│           │                                                   │
│           ▼                                                   │
│  ┌─────────────────┐     ┌─────────────┐    ┌─────────────┐  │
│  │  Reserve Space  │────►│ Load Data   │───►│ Verify CRC  │  │
│  │  (Target Layer) │     │ (Decompress)│    │ & Integrity │  │
│  └─────────────────┘     └─────────────┘    └──────┬──────┘  │
│                                                     │         │
│                                                     ▼         │
│                                              ┌─────────────┐  │
│                                              │ Update LRU  │  │
│                                              │ & Index     │  │
│                                              └─────────────┘  │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### 4.3 降级触发器

| 触发条件 | 源层 | 目标层 | 执行策略 | 用户感知 |
|:---|:---|:---|:---|:---|
| **Focus超限** | Focus | Working | 智能截断，保留摘要 | 无（实时） |
| **Working满载** | Working | Archive | LRU-K淘汰，压缩归档 | 无（后台） |
| **Archive满载** | Archive | RAG | 深度压缩，向量索引 | 轻微延迟 |
| **GC压力** | 任意 | 下层 | 批量降级，写时复制 | 可能卡顿 |

**降级流程图**:

```
┌──────────────────────────────────────────────────────────────┐
│                   DEMOTION FLOW                              │
│                                                               │
│  触发事件                                                      │
│     │                                                         │
│     ▼                                                         │
│  ┌─────────────────┐                                          │
│  │ Select Victims  │──► LRU-K Score Ranked Selection         │
│  │   (LRU/LFU Mix) │                                          │
│  └────────┬────────┘                                          │
│           │                                                   │
│           ▼                                                   │
│  ┌─────────────────┐     ┌─────────────┐    ┌─────────────┐  │
│  │  Write-Copy     │────►│ Compress    │───►│ Write to    │  │
│  │  (Consistency)  │     │ (if needed) │    │ Target Layer│  │
│  └─────────────────┘     └─────────────┘    └──────┬──────┘  │
│                                                     │         │
│                                                     ▼         │
│                                              ┌─────────────┐  │
│                                              │ Async Clean │  │
│                                              │ (Delay 5s)  │  │
│                                              └─────────────┘  │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### 4.4 触发器实现代码

```typescript
// TierMigrationTrigger.ts - 层间迁移触发器

enum MigrationTrigger {
  // 晋升触发器
  EXPLICIT_ACCESS = 'EXPLICIT_ACCESS',      // 显式访问
  PREDICTIVE_PRELOAD = 'PREDICTIVE_PRELOAD', // 预测预加载
  FOCUS_REFERENCE = 'FOCUS_REFERENCE',       // Focus层引用
  
  // 降级触发器
  CAPACITY_PRESSURE = 'CAPACITY_PRESSURE',   // 容量压力
  HOTNESS_DECAY = 'HOTNESS_DECAY',           // 热度衰减
  GC_PRESSURE = 'GC_PRESSURE',              // GC压力
}

interface MigrationJob {
  id: string;
  sourceTier: MemoryTier;
  targetTier: MemoryTier;
  contextIds: string[];
  trigger: MigrationTrigger;
  priority: number;          // 0-100, 越高越优先
  deadline: number;          // 完成截止时间
}

class TierMigrationTrigger {
  private queue: PriorityQueue<MigrationJob>;
  private executors: Map<MemoryTier, TierExecutor>;
  
  // 触发晋升
  async triggerPromotion(
    contextId: string,
    sourceTier: MemoryTier,
    targetTier: MemoryTier,
    trigger: MigrationTrigger
  ): Promise<void> {
    // 检查热度评分
    const hotScore = await this.calculateHotScore(contextId);
    const threshold = this.getPromotionThreshold(targetTier);
    
    if (hotScore < threshold) {
      logger.debug(`Promotion rejected: hotScore ${hotScore} < ${threshold}`);
      return;
    }
    
    // 检查目标层容量
    if (!await this.checkCapacity(targetTier)) {
      // 触发目标层降级以腾出空间
      await this.makeSpace(targetTier);
    }
    
    // 创建迁移任务
    const job: MigrationJob = {
      id: generateUUID(),
      sourceTier,
      targetTier,
      contextIds: [contextId],
      trigger,
      priority: hotScore,
      deadline: Date.now() + this.getDeadline(targetTier)
    };
    
    this.queue.enqueue(job, job.priority);
  }
  
  // 触发降级（容量压力）
  async triggerDemotion(
    sourceTier: MemoryTier,
    pressureLevel: 'soft' | 'medium' | 'hard'
  ): Promise<void> {
    const victims = await this.selectVictims(sourceTier, pressureLevel);
    const targetTier = this.getLowerTier(sourceTier);
    
    for (const victim of victims) {
      const job: MigrationJob = {
        id: generateUUID(),
        sourceTier,
        targetTier,
        contextIds: [victim.id],
        trigger: MigrationTrigger.CAPACITY_PRESSURE,
        priority: this.getDemotionPriority(pressureLevel),
        deadline: Date.now() + this.getDemotionDeadline(pressureLevel)
      };
      
      this.queue.enqueue(job, job.priority);
    }
  }
  
  // LRU-K热度计算
  private async calculateHotScore(contextId: string): Promise<number> {
    const accessHistory = await this.getAccessHistory(contextId, k=2);
    const now = Date.now();
    
    // LRU-K公式: w1 * 最近访问时间倒数 + w2 * 访问频率 + w3 * 语义相关性
    const recency = 1 / (now - accessHistory.lastAccess + 1);
    const frequency = accessHistory.accessCount;
    const semanticRelevance = await this.getSemanticRelevance(contextId);
    
    return (
      WEIGHT_RECENCY * recency +
      WEIGHT_FREQUENCY * frequency +
      WEIGHT_SEMANTIC * semanticRelevance
    );
  }
  
  // 选择降级受害者（LRU/LFU混合）
  private async selectVictims(
    tier: MemoryTier,
    pressureLevel: string
  ): Promise<Victim[]> {
    const allContexts = await this.listContexts(tier);
    
    // 混合评分: 70% LRU + 30% LFU
    const scored = allContexts.map(ctx => ({
      ...ctx,
      score: 0.7 * ctx.lruScore + 0.3 * ctx.lfuScore
    }));
    
    // 按评分升序排列（分数低优先淘汰）
    scored.sort((a, b) => a.score - b.score);
    
    // 根据压力级别选择数量
    const count = this.getEvictionCount(tier, pressureLevel);
    return scored.slice(0, count);
  }
}
```

---

## 5. 驱逐策略（LRU/LFU混合）

### 5.1 混合评分算法

```
┌──────────────────────────────────────────────────────────────┐
│              LRU/LFU HYBRID SCORING                          │
│                                                               │
│  最终评分 = α × LRU_Score + β × LFU_Score + γ × Semantic_Score│
│                                                               │
│  参数配置:                                                     │
│  ┌───────────────┬──────────┬─────────────────────────────┐  │
│  │ 场景          │ α │ β │ γ │ 说明                      │  │
│  ├───────────────┼──────────┼─────────────────────────────┤  │
│  │ 默认          │0.5│0.3│0.2│ 平衡近期访问与频率         │  │
│  │ 对话密集型    │0.7│0.2│0.1│ 强调最近对话               │  │
│  │ 知识查询型    │0.3│0.5│0.2│ 强调反复查询的知识点       │  │
│  │ 上下文敏感型  │0.3│0.2│0.5│ 强调语义相关性             │  │
│  └───────────────┴──────────┴─────────────────────────────┘  │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 LRU-K算法实现

```typescript
// LRUKCache.ts - LRU-K缓存实现

interface AccessRecord {
  timestamps: number[];  // 最近K次访问时间戳
  accessCount: number;   // 总访问次数
}

class LRUKCache<K, V> {
  private k: number;
  private cache: Map<K, V>;
  private accessRecords: Map<K, AccessRecord>;
  private maxSize: number;
  
  constructor(k: number, maxSize: number) {
    this.k = k;
    this.maxSize = maxSize;
    this.cache = new Map();
    this.accessRecords = new Map();
  }
  
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.recordAccess(key);
    }
    return value;
  }
  
  put(key: K, value: V): void {
    // 检查是否需要驱逐
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evict();
    }
    
    this.cache.set(key, value);
    this.recordAccess(key);
  }
  
  private recordAccess(key: K): void {
    const record = this.accessRecords.get(key) || {
      timestamps: [],
      accessCount: 0
    };
    
    record.timestamps.push(Date.now());
    record.accessCount++;
    
    // 只保留最近K次
    if (record.timestamps.length > this.k) {
      record.timestamps.shift();
    }
    
    this.accessRecords.set(key, record);
  }
  
  // 计算Backward K-Distance（第K次访问距现在的距离）
  private calculateKDistance(record: AccessRecord): number {
    if (record.timestamps.length < this.k) {
      return Infinity;  // 访问次数不足K次，给予保护期
    }
    return Date.now() - record.timestamps[0];
  }
  
  // 驱逐策略
  private evict(): void {
    let victim: K | null = null;
    let maxKDistance = -1;
    
    for (const [key, record] of this.accessRecords) {
      const kDistance = this.calculateKDistance(record);
      
      // 选择K-Distance最大的作为受害者
      if (kDistance > maxKDistance) {
        maxKDistance = kDistance;
        victim = key;
      }
    }
    
    if (victim !== null) {
      this.cache.delete(victim);
      this.accessRecords.delete(victim);
    }
  }
  
  // 获取热度评分（用于混合策略）
  getHotScore(key: K): number {
    const record = this.accessRecords.get(key);
    if (!record) return 0;
    
    const kDistance = this.calculateKDistance(record);
    const recencyScore = kDistance === Infinity ? 1 : 1 / (kDistance + 1);
    const frequencyScore = Math.log(record.accessCount + 1);
    
    return 0.6 * recencyScore + 0.4 * frequencyScore;
  }
}
```

### 5.3 分层驱逐策略

| 层级 | 驱逐算法 | 触发条件 | 驱逐目标 |
|:---|:---|:---|:---|
| **Focus** | 智能截断 | >8192 tokens | Working层（生成摘要） |
| **Working** | LRU-K (K=2) | >128K tokens | Archive层（压缩归档） |
| **Archive** | 时间衰减 + 容量 | >1M tokens | RAG层（向量索引） |
| **RAG** | 访问频率 | 存储配额 | 冷存储/删除 |

### 5.4 智能截断策略（Focus层专用）

```typescript
// SmartTruncator.ts - 智能截断器

enum TruncationStrategy {
  TAIL_CUTOFF = 'TAIL_CUTOFF',           // 简单尾部截断
  IMPORTANCE_BASED = 'IMPORTANCE_BASED', // 基于重要性评分
  DYNAMIC_SUMMARY = 'DYNAMIC_SUMMARY',   // 动态摘要生成
  CONVERSATION_MERGE = 'CONVERSATION_MERGE', // 对话合并
}

interface ImportanceScore {
  semantic: number;      // 语义重要性
  recency: number;       // 时间近因性
  userEmphasis: number;  // 用户强调（收藏/复制等）
  structural: number;    // 结构性（标题/列表等）
}

class SmartTruncator {
  // 计算重要性评分
  calculateImportance(message: Message): number {
    const scores: ImportanceScore = {
      semantic: this.analyzeSemanticImportance(message),
      recency: this.calculateRecencyScore(message.timestamp),
      userEmphasis: this.getUserInteractionScore(message.id),
      structural: this.getStructuralScore(message)
    };
    
    return (
      0.4 * scores.semantic +
      0.3 * scores.recency +
      0.2 * scores.userEmphasis +
      0.1 * scores.structural
    );
  }
  
  // 智能截断
  truncate(
    messages: Message[],
    targetTokens: number,
    strategy: TruncationStrategy
  ): TruncationResult {
    const currentTokens = this.countTokens(messages);
    
    if (currentTokens <= targetTokens) {
      return { messages, truncated: false };
    }
    
    switch (strategy) {
      case TruncationStrategy.IMPORTANCE_BASED:
        return this.importanceBasedTruncation(messages, targetTokens);
      case TruncationStrategy.DYNAMIC_SUMMARY:
        return this.dynamicSummaryTruncation(messages, targetTokens);
      default:
        return this.tailCutoff(messages, targetTokens);
    }
  }
  
  private importanceBasedTruncation(
    messages: Message[],
    targetTokens: number
  ): TruncationResult {
    // 为每条消息计算重要性
    const scored = messages.map(m => ({
      message: m,
      score: this.calculateImportance(m),
      tokens: this.countTokens([m])
    }));
    
    // 按重要性排序（保留高分）
    scored.sort((a, b) => b.score - a.score);
    
    // 贪心选择，直到达到目标Token数
    const selected: Message[] = [];
    let tokenCount = 0;
    
    for (const item of scored) {
      if (tokenCount + item.tokens <= targetTokens) {
        selected.push(item.message);
        tokenCount += item.tokens;
      }
    }
    
    // 按原始顺序恢复
    selected.sort((a, b) => a.timestamp - b.timestamp);
    
    return {
      messages: selected,
      truncated: true,
      preservedCount: selected.length,
      originalCount: messages.length
    };
  }
}
```

---

## 6. 性能监控与告警

### 6.1 监控指标

| 指标类别 | 指标名称 | 目标值 | 告警阈值 |
|:---|:---|:---|:---|
| **Focus层** | Token利用率 | <90% | >95% |
| **Working层** | 缓存命中率 | >90% | <85% |
| **Archive层** | 压缩率 | >90% | <85% |
| **RAG层** | 检索延迟 | <300ms | >500ms |
| **迁移** | 晋升延迟 | <50ms | >100ms |
| **驱逐** | 降级延迟 | <100ms | >200ms |

### 6.2 自适应调参

```typescript
// AdaptiveTuner.ts - 自适应调参器

class AdaptiveTuner {
  // 根据运行时指标动态调整参数
  tuneParameters(metrics: SystemMetrics): TuningResult {
    const adjustments: TuningResult = {
      lruWeight: 0.5,
      lfuWeight: 0.3,
      semanticWeight: 0.2,
      promotionThreshold: 0.7,
      compressionLevel: 9
    };
    
    // 命中率低 -> 增加LRU权重
    if (metrics.cacheHitRate < 0.85) {
      adjustments.lruWeight = Math.min(0.8, adjustments.lruWeight + 0.1);
      adjustments.lfuWeight -= 0.05;
    }
    
    // 晋升延迟高 -> 降低阈值，减少晋升
    if (metrics.promotionLatency > 100) {
      adjustments.promotionThreshold = Math.min(0.9, adjustments.promotionThreshold + 0.1);
    }
    
    // 存储压力大 -> 提高压缩级别
    if (metrics.storagePressure > 0.8) {
      adjustments.compressionLevel = Math.min(22, adjustments.compressionLevel + 3);
    }
    
    return adjustments;
  }
}
```

---

## 7. 自测验收点

### MEM-001: Focus层<8K Token硬限制

**测试场景**: 持续注入对话，观察Focus层容量边界

```
测试步骤:
1. 初始化Focus层，加载系统消息(~1K)
2. 逐条注入用户消息，每条约200 tokens
3. 监控Focus层实时Token计数
4. 当接近8K时验证截断行为

通过标准:
✓ Focus层Token数始终 ≤ 8192
✓ 超限请求被拒绝或排队
✓ 截断后保留的消息保持语义连贯

失败处理:
- 触发硬限制告警
- 强制降级至Working层
- 通知用户上下文窗口满载
```

### MEM-002: Working层LRU策略

**测试场景**: 模拟典型对话负载，统计缓存命中率

```
测试步骤:
1. 构建10K条历史消息（约2M tokens）
2. 模拟1000次访问模式（80-20分布）
3. 记录每次访问的层命中情况
4. 计算各层命中率

通过标准:
✓ Working层命中率 > 90%
✓ LRU-K正确识别热点数据
✓ 冷启动后快速达到稳态

失败处理:
- 调整LRU/LFU权重
- 增加Working层容量
- 启用预测预加载
```

### MEM-003: Archive层压缩率>90%

**测试场景**: 大规模历史数据压缩验证

```
测试步骤:
1. 准备100K tokens对话历史
2. 应用Archive层压缩策略
3. 测量压缩前后Token数
4. 验证解压后数据完整性

通过标准:
✓ 压缩率 > 90% (压缩后 ≤ 10K tokens等效)
✓ 解压速度与原始数据一致
✓ 语义检索精度损失 < 2%

失败处理:
- 切换压缩算法
- 调整压缩级别
- 分层压缩（热数据低压缩，冷数据高压缩）
```

---

## 8. 与其他工单集成

### 8.1 B-01 上下文快照协议

- `.hctx`格式支持四层状态完整捕获
- 快照中包含各层迁移元数据
- 恢复时重建LRU-K访问记录

### 8.2 B-02 Workspace v2.0

- Focus/Working → Active层
- Archive → Hot/Warm层映射
- RAG → Cold层 + 向量索引

### 8.3 B-05 预测性GC

- LSTM预测Token需求
- GC触发时优先迁移而非删除
- 零停顿：后台异步层间迁移

---

## 9. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|:---|:---|:---|
| Token计数器性能瓶颈 | 延迟增加 | 批处理+缓存+异步 |
| 频繁层间迁移 | 性能抖动 | 迁移冷却期+批量处理 |
| 压缩/解压CPU开销 | 延迟增加 | 异步流水线+硬件加速 |
| 语义评分不准确 | 重要上下文丢失 | 用户反馈循环+在线学习 |

---

**文档状态**: v1.0 草案  
**负责**: 黄瓜睦（架构师）  
**评审**: 待Mike审计  

[TERMINATE:LCR-B03-001]
交付物: design/lcr/b04-memgpt-arch.md
自测状态: MEM-001/002/003 [待验证]
