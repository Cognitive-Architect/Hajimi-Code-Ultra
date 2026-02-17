/**
 * Lazy-RAG MVP 接口定义
 * HAJIMI-DEBT-CLEARANCE-001-LAZY-MVP / B-01/09
 * 
 * 功能: 本地轻量级RAG检索引擎（MVP版本）
 * 约束: 仅保留POST /query，全面移除SecondMe引用
 * 
 * @module lib/lcr/types/lazy-rag
 * @version 1.0.0
 * @since 2026-02-17
 */

// ============================================================================
// 基础类型定义
// ============================================================================

/**
 * 向量维度 (基于all-MiniLM-L6-v2)
 */
export type VectorDimension = 384;

/**
 * 支持的平台类型
 */
export type PlatformType = 'win32' | 'linux' | 'darwin';

/**
 * 检索来源
 */
export type RetrievalSource = 'vector' | 'bm25' | 'fusion' | 'bm25-l3-fallback';

/**
 * 查询状态
 */
export type QueryStatus = 'success' | 'timeout' | 'fallback' | 'error';

// ============================================================================
// 跨平台路径配置
// ============================================================================

/**
 * 跨平台数据路径配置
 * 
 * Windows: %APPDATA%/Hajimi-RAG/data/
 * Linux:   ~/.config/hajimi-rag/data/
 * macOS:   ~/Library/Application Support/Hajimi-RAG/data/
 * 
 * 自测: PATH-001 跨平台路径正确解析
 */
export interface IDataPathConfig {
  /** 应用名称 */
  readonly appName: 'hajimi-rag';
  
  /** 数据子目录名 */
  readonly dataDir: 'data';
  
  /** 各平台基础路径模板 */
  platformPaths: {
    readonly win32: '%APPDATA%/Hajimi-RAG/data';
    readonly linux: '~/.config/hajimi-rag/data';
    readonly darwin: '~/Library/Application Support/Hajimi-RAG/data';
  };
  
  /** 文件结构定义 */
  files: {
    /** 原始向量数据 [N x dim x 4 bytes] */
    readonly vectors: 'vectors.bin';
    /** HNSW索引文件 */
    readonly index: 'index.hnsw';
    /** 文档语料库 (id -> content映射) */
    readonly corpus: 'corpus.json';
    /** 索引元数据 */
    readonly metadata: 'meta.json';
    /** 性能基准报告 */
    readonly benchmark: 'benchmark.json';
  };
}

/**
 * 路径解析器接口
 */
export interface IPathResolver {
  /**
   * 获取当前平台的数据目录路径
   */
  getDataDir(): string;
  
  /**
   * 获取完整文件路径
   * @param fileName 文件名
   */
  resolve(fileName: string): string;
  
  /**
   * 确保目录存在
   */
  ensureDir(): Promise<void>;
  
  /**
   * 获取当前平台类型
   */
  getPlatform(): PlatformType;
}

// ============================================================================
// 查询请求/响应接口 (MVP仅保留POST /query)
// ============================================================================

/**
 * 查询请求
 * 
 * 自测: API-001 请求参数验证
 */
export interface IQueryRequest {
  /** 查询文本 */
  query: string;
  
  /** 返回结果数量 (默认5, 最大20) */
  topK?: number;
  
  /** 相似度阈值 (0-1, 默认0.5) */
  threshold?: number;
  
  /** 超时时间 (毫秒, 默认2000) */
  timeout?: number;
  
  /** 是否包含性能埋点 */
  includeTelemetry?: boolean;
}

/**
 * 查询结果项
 */
export interface IQueryResultItem {
  /** 文档唯一ID */
  id: string;
  
  /** 文档内容 */
  content: string;
  
  /** 相似度分数 (0-1) */
  score: number;
  
  /** 检索来源 */
  source: RetrievalSource;
  
  /** 元数据 */
  metadata?: {
    /** 原始来源 */
    source?: string;
    /** 文档类型 */
    type?: string;
    /** 时间戳 */
    timestamp?: number;
    /** 标签 */
    tags?: string[];
  };
  
  /** BM25分数 (融合时有效) */
  bm25Score?: number;
  
  /** 向量相似度分数 (融合时有效) */
  vectorScore?: number;
}

/**
 * 查询响应
 * 
 * 自测: API-002 响应格式正确
 */
export interface IQueryResult {
  /** 查询ID */
  queryId: string;
  
  /** 查询状态 */
  status: QueryStatus;
  
  /** 检索结果列表 */
  results: IQueryResultItem[];
  
  /** 结果总数 */
  total: number;
  
  /** 查询耗时 (毫秒) */
  latency: number;
  
  /** 是否使用降级 */
  fallback: boolean;
  
  /** 降级原因 (如使用降级) */
  fallbackReason?: 'timeout' | 'not-ready' | 'memory-limit' | 'error';
  
  /** 性能埋点 (如请求时包含) */
  telemetry?: IPerformanceTelemetry;
}

// ============================================================================
// Lazy-RAG引擎核心接口
// ============================================================================

/**
 * Lazy-RAG引擎配置
 * 
 * 自测: CONFIG-001 配置验证
 */
export interface ILazyRAGConfig {
  /** 数据路径配置 */
  dataPath: IDataPathConfig;
  
  /** HNSW索引参数 */
  hnswParams: {
    /** 每个节点最大连接数 */
    M: number;
    /** 构建时搜索范围 */
    efConstruction: number;
    /** 查询时搜索范围 */
    efSearch: number;
  };
  
  /** 融合排序权重 */
  fusionWeights: {
    /** 向量检索权重 (默认0.7) */
    vector: number;
    /** BM25权重 (默认0.3) */
    bm25: number;
  };
  
  /** 性能预算 */
  performanceBudget: {
    /** 冷启动最大时间 (毫秒) */
    coldStartMaxMs: number;
    /** P50延迟目标 (毫秒) */
    p50TargetMs: number;
    /** P95延迟目标 (毫秒) */
    p95TargetMs: number;
    /** 空载内存限制 (MB) */
    idleMemoryMaxMB: number;
    /** 1万向量内存限制 (MB) */
    with10kMemoryMaxMB: number;
  };
  
  /** 降级配置 */
  fallback: IFallbackConfig;
}

/**
 * Lazy-RAG引擎接口
 * 
 * MVP仅实现核心查询功能
 * 
 * 自测: ENGINE-001 引擎初始化
 * 自测: ENGINE-002 延迟加载正确
 */
export interface ILazyRAGEngine {
  /** 配置 */
  readonly config: ILazyRAGConfig;
  
  /** 引擎状态 */
  readonly status: 'uninitialized' | 'loading' | 'ready' | 'error';
  
  /** 是否已就绪 */
  isReady(): boolean;
  
  /**
   * 初始化引擎
   * 
   * 首次调用会触发索引加载（冷启动）
   * 
   * 性能目标: < 5秒
   */
  initialize(): Promise<void>;
  
  /**
   * 执行查询
   * 
   * @param request 查询请求
   * @returns 查询结果
   * 
   * 性能目标: P50<30ms, P95<100ms
   * 
   * 自测: QUERY-001 正常查询
   * 自测: QUERY-002 超时降级
   * 自测: QUERY-003 错误降级
   */
  query(request: IQueryRequest): Promise<IQueryResult>;
  
  /**
   * 获取引擎统计
   */
  getStats(): Promise<IEngineStats>;
  
  /**
   * 关闭引擎
   */
  shutdown(): Promise<void>;
}

/**
 * 引擎统计信息
 */
export interface IEngineStats {
  /** 状态 */
  status: 'uninitialized' | 'loading' | 'ready' | 'error';
  
  /** 索引中的向量数量 */
  vectorCount: number;
  
  /** 向量维度 */
  vectorDimension: number;
  
  /** 当前内存使用 (MB) */
  memoryUsageMB: number;
  
  /** 总查询次数 */
  totalQueries: number;
  
  /** 降级次数 */
  fallbackCount: number;
  
  /** 平均查询延迟 (毫秒) */
  avgLatencyMs: number;
  
  /** 最后冷启动时间 (毫秒) */
  lastColdStartMs: number;
}

// ============================================================================
// 降级策略接口
// ============================================================================

/**
 * 降级配置
 * 
 * 自测: FALLBACK-001 降级策略自动触发
 */
export interface IFallbackConfig {
  /** L3 BM25服务配置 */
  l3Service: {
    /** 服务标识 */
    endpoint: 'internal://l3-bm25';
    /** 超时时间 (毫秒) */
    timeout: number;
    /** 最大重试次数 */
    maxRetries: number;
  };
  
  /** 触发条件 */
  triggers: {
    /** Lazy-RAG未启动时触发 */
    readonly lazyRagNotStarted: true;
    /** 查询超时时间 (毫秒) */
    readonly lazyRagTimeout: 2000;
    /** 内存超过此值(MB)触发降级 */
    readonly memoryExceeded: 512;
    /** P99延迟超过此值(ms)连续10次触发降级 */
    readonly p99LatencyExceeded: 200;
  };
  
  /** 恢复策略 */
  recovery: {
    /** 自动重试间隔 (毫秒) */
    readonly autoRetryInterval: 30000;
    /** 健康检查间隔 (毫秒) */
    readonly healthCheckInterval: 10000;
  };
}

/**
 * L3 BM25降级服务接口
 */
export interface IL3BM25Service {
  /**
   * 基础关键词检索
   * 
   * @param query 查询文本
   * @param topK 返回数量
   * @returns 检索结果
   * 
   * 性能目标: < 50ms
   */
  query(query: string, topK?: number): Promise<IL3QueryResult>;
  
  /**
   * 检查服务健康
   */
  health(): Promise<{ status: 'healthy' | 'degraded' | 'unavailable' }>;
}

/**
 * L3查询结果
 */
export interface IL3QueryResult {
  /** 结果列表 */
  results: Array<{
    id: string;
    content: string;
    score: number;
    source: 'bm25-l3';
  }>;
  
  /** 查询耗时 */
  latency: number;
  
  /** 标记为降级结果 */
  fallback: true;
}

// ============================================================================
// 性能埋点接口
// ============================================================================

/**
 * 查询阶段耗时
 */
export interface IQueryPhaseTimings {
  /** 状态检查耗时 */
  checkStatus: number;
  /** 延迟加载耗时 */
  lazyLoad: number;
  /** 向量检索耗时 */
  vectorSearch: number;
  /** BM25重排序耗时 */
  bm25Rescore: number;
  /** 融合排序耗时 */
  fusionRank: number;
  /** 总耗时 */
  total: number;
}

/**
 * 资源使用统计
 */
export interface IResourceUsage {
  /** 查询前内存 (MB) */
  memoryBefore: number;
  /** 查询后内存 (MB) */
  memoryAfter: number;
  /** CPU使用率百分比 */
  cpuPercent: number;
}

/**
 * 结果统计
 */
export interface IResultStats {
  /** 候选数量 */
  candidates: number;
  /** 返回数量 */
  returned: number;
  /** 是否使用降级 */
  fallbackUsed: boolean;
}

/**
 * 决策门检查结果
 */
export interface IDecisionGateChecks {
  /** P50检查通过 */
  p50Pass: boolean;
  /** P95检查通过 */
  p95Pass: boolean;
  /** P99检查通过 */
  p99Pass: boolean;
  /** 内存检查通过 */
  memoryPass: boolean;
}

/**
 * 性能埋点数据
 * 
 * 自测: PERF-001 所有关键路径埋点
 */
export interface IPerformanceTelemetry {
  /** 查询ID */
  queryId: string;
  
  /** 时间戳 */
  timestamp: number;
  
  /** 各阶段耗时 (毫秒) */
  phases: IQueryPhaseTimings;
  
  /** 资源使用 */
  resources: IResourceUsage;
  
  /** 结果统计 */
  results: IResultStats;
  
  /** 决策门检查 */
  decisionGate: IDecisionGateChecks;
}

// ============================================================================
// 决策门报告接口
// ============================================================================

/**
 * 冷启动测试结果
 */
export interface IColdStartResult {
  /** 测量值 (毫秒) */
  measured: number;
  /** 目标值 (毫秒) */
  target: number;
  /** 单位 */
  unit: 'ms';
  /** 是否通过 */
  pass: boolean;
  /** 采样数据 */
  samples: number[];
}

/**
 * 延迟测试结果
 */
export interface ILatencyResult {
  measured: number;
  target: number;
  unit: 'ms';
  pass: boolean;
}

/**
 * 内存测试结果
 */
export interface IMemoryResult {
  measured: number;
  target: number;
  unit: 'MB';
  pass: boolean;
}

/**
 * 准确率测试结果
 */
export interface IAccuracyResult {
  measured: number;
  target: number;
  unit: 'ratio';
  pass: boolean;
}

/**
 * 决策门测试结果集合
 */
export interface IDecisionGateResults {
  coldStart: IColdStartResult;
  queryLatency: {
    p50: ILatencyResult;
    p95: ILatencyResult;
    p99: ILatencyResult;
  };
  memoryUsage: {
    idle: IMemoryResult;
    with10k: IMemoryResult;
  };
  accuracy: {
    top5Recall: IAccuracyResult;
  };
}

/**
 * 环境信息
 */
export interface IEnvironmentInfo {
  platform: PlatformType;
  nodeVersion: string;
  cpu: string;
  memory: string;
}

/**
 * 决策门报告摘要
 */
export interface IReportSummary {
  /** 总测试数 */
  totalTests: number;
  /** 通过数 */
  passed: number;
  /** 失败数 */
  failed: number;
  /** 总体结果 */
  overall: 'PASS' | 'FAIL';
}

/**
 * 决策门基准报告
 * 
 * 输出为JSON格式到 benchmark.json
 * 
 * 自测: GATE-001 报告格式正确
 * 自测: GATE-002 决策标准明确可测量
 */
export interface IDecisionGateReport {
  /** 报告版本 */
  reportVersion: string;
  
  /** 决策门ID */
  gateId: string;
  
  /** 报告时间戳 */
  timestamp: number;
  
  /** 环境信息 */
  environment: IEnvironmentInfo;
  
  /** 测试结果 */
  results: IDecisionGateResults;
  
  /** 报告摘要 */
  summary: IReportSummary;
  
  /** 优化建议 */
  recommendations: string[];
}

// ============================================================================
// 决策门配置接口
// ============================================================================

/**
 * 决策门配置
 */
export interface IDecisionGateConfig {
  /** 决策门ID */
  gateId: 'lazy-rag-mvp-v1';
  
  /** 通过标准 */
  criteria: {
    coldStart: {
      target: 5000;
      measurement: 'max';
      samples: 3;
    };
    queryLatency: {
      p50: { target: 30; unit: 'ms' };
      p95: { target: 100; unit: 'ms' };
      p99: { target: 200; unit: 'ms' };
    };
    memoryUsage: {
      idle: { target: 100; unit: 'MB' };
      with10k: { target: 200; unit: 'MB' };
    };
    accuracy: {
      top5Recall: { target: 0.85; unit: 'ratio' };
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

// ============================================================================
// 错误类型
// ============================================================================

/**
 * Lazy-RAG错误类型
 */
export type LazyRAGErrorType = 
  | 'NOT_INITIALIZED'    // 引擎未初始化
  | 'INDEX_NOT_FOUND'    // 索引文件不存在
  | 'INDEX_CORRUPTED'    // 索引文件损坏
  | 'QUERY_TIMEOUT'      // 查询超时
  | 'MEMORY_LIMIT'       // 内存限制
  | 'INVALID_QUERY'      // 无效查询
  | 'FALLBACK_FAILED';   // 降级也失败

/**
 * Lazy-RAG错误
 */
export interface ILazyRAGError {
  type: LazyRAGErrorType;
  message: string;
  queryId?: string;
  timestamp: number;
}

// ============================================================================
// 常量定义
// ============================================================================

/**
 * Lazy-RAG MVP 常量
 */
export const LazyRAGConstants = {
  /** 默认topK */
  DEFAULT_TOP_K: 5,
  /** 最大topK */
  MAX_TOP_K: 20,
  /** 默认相似度阈值 */
  DEFAULT_THRESHOLD: 0.5,
  /** 默认超时 (毫秒) */
  DEFAULT_TIMEOUT_MS: 2000,
  /** 向量维度 */
  VECTOR_DIMENSION: 384 as VectorDimension,
  /** 冷启动超时 (毫秒) */
  COLD_START_TIMEOUT_MS: 5000,
  /** HNSW默认参数 */
  HNSW_DEFAULT: {
    M: 16,
    efConstruction: 200,
    efSearch: 64,
  },
  /** 融合默认权重 */
  FUSION_WEIGHTS: {
    vector: 0.7,
    bm25: 0.3,
  },
  /** 性能预算默认值 */
  PERFORMANCE_BUDGET: {
    coldStartMaxMs: 5000,
    p50TargetMs: 30,
    p95TargetMs: 100,
    idleMemoryMaxMB: 100,
    with10kMemoryMaxMB: 200,
  },
} as const;

// ============================================================================
// 工厂函数类型
// ============================================================================

/**
 * 创建Lazy-RAG引擎的工厂函数
 */
export type LazyRAGEngineFactory = (config?: Partial<ILazyRAGConfig>) => ILazyRAGEngine;

/**
 * 创建路径解析器的工厂函数
 */
export type PathResolverFactory = (config?: Partial<IDataPathConfig>) => IPathResolver;

/**
 * 创建L3 BM25服务的工厂函数
 */
export type L3BM25ServiceFactory = () => IL3BM25Service;

// ============================================================================
// 导出默认配置
// ============================================================================

/**
 * 默认配置
 */
export const DefaultLazyRAGConfig: ILazyRAGConfig = {
  dataPath: {
    appName: 'hajimi-rag',
    dataDir: 'data',
    platformPaths: {
      win32: '%APPDATA%/Hajimi-RAG/data',
      linux: '~/.config/hajimi-rag/data',
      darwin: '~/Library/Application Support/Hajimi-RAG/data',
    },
    files: {
      vectors: 'vectors.bin',
      index: 'index.hnsw',
      corpus: 'corpus.json',
      metadata: 'meta.json',
      benchmark: 'benchmark.json',
    },
  },
  hnswParams: {
    M: 16,
    efConstruction: 200,
    efSearch: 64,
  },
  fusionWeights: {
    vector: 0.7,
    bm25: 0.3,
  },
  performanceBudget: {
    coldStartMaxMs: 5000,
    p50TargetMs: 30,
    p95TargetMs: 100,
    idleMemoryMaxMB: 100,
    with10kMemoryMaxMB: 200,
  },
  fallback: {
    l3Service: {
      endpoint: 'internal://l3-bm25',
      timeout: 2000,
      maxRetries: 1,
    },
    triggers: {
      lazyRagNotStarted: true,
      lazyRagTimeout: 2000,
      memoryExceeded: 512,
      p99LatencyExceeded: 200,
    },
    recovery: {
      autoRetryInterval: 30000,
      healthCheckInterval: 10000,
    },
  },
};

/**
 * 默认决策门配置
 */
export const DefaultDecisionGateConfig: IDecisionGateConfig = {
  gateId: 'lazy-rag-mvp-v1',
  criteria: {
    coldStart: {
      target: 5000,
      measurement: 'max',
      samples: 3,
    },
    queryLatency: {
      p50: { target: 30, unit: 'ms' },
      p95: { target: 100, unit: 'ms' },
      p99: { target: 200, unit: 'ms' },
    },
    memoryUsage: {
      idle: { target: 100, unit: 'MB' },
      with10k: { target: 200, unit: 'MB' },
    },
    accuracy: {
      top5Recall: { target: 0.85, unit: 'ratio' },
    },
  },
  benchmarkDataset: {
    name: 'hajimi-rag-benchmark-v1',
    queryCount: 100,
    vectorCount: 10000,
    dimension: 384,
  },
};

export default {
  constants: LazyRAGConstants,
  defaultConfig: DefaultLazyRAGConfig,
  defaultGateConfig: DefaultDecisionGateConfig,
};
