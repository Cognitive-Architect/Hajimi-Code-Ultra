# B-06: Archive与RAG外挂接口设计

> **工单编号**: B-06/09  
> **目标**: 设计 Archive 与 RAG 外挂接口，集成 SecondMe 云端能力  
> **输入**: B-04/09架构、B-05/09实现、lib/quintant/adapters/secondme.ts（Mock基线）  
> **输出状态**: 🏗️ 接口设计完成，含P2债务声明

---

## 债务声明

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  DEBT: LCR-B03-003 - P2 - SecondMe集成降级策略                               ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  优先级: P2 (重要但非阻塞)                                                    ║
║  类型: External Integration                                                   ║
║  描述: SecondMe真实API调用与云端同步待外部服务凭证                              ║
║  状态: 接口已定义，实现待SecondMe云端API密钥                                   ║
║  降级方案: 本地失败时自动回退云端Mock/降级服务                                  ║
║  预计清偿: v1.4.0                                                             ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## 1. 架构总览

### 1.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      HAJIMI LCR - Archive & RAG 外挂架构                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Application Layer                               │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │  Chat UI     │  │  Agent Spawn │  │  Workspace   │              │   │
│  │  │  (User)      │  │  (A2A)       │  │  Manager     │              │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │   │
│  └─────────┼─────────────────┼─────────────────┼──────────────────────┘   │
│            │                 │                 │                          │
│            ▼                 ▼                 ▼                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Interface Layer (B-06)                          │   │
│  │  ┌─────────────────────────┐  ┌─────────────────────────┐          │   │
│  │  │   Archive Interface     │  │   RAG Interface         │          │   │
│  │  │   (.hctx序列化)          │  │   (向量检索<200ms)       │          │   │
│  │  │                         │  │                         │          │   │
│  │  │  • Snapshot Export      │  │  • Local Vector Search  │          │   │
│  │  │  • Incremental Delta    │  │  • Cloud Embedding      │          │   │
│  │  │  • Cross-Device Sync    │  │  • Hybrid Retrieval     │          │   │
│  │  │  • Git Integration      │  │  • Cache Layer          │          │   │
│  │  └───────────┬─────────────┘  └───────────┬─────────────┘          │   │
│  └──────────────┼────────────────────────────┼────────────────────────┘   │
│                 │                            │                            │
│                 ▼                            ▼                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Adaptation Layer                                │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │              SecondMe Cloud Sync Protocol                    │   │   │
│  │  │                                                              │   │   │
│  │  │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │   │   │
│  │  │   │  Local LCR  │◄──►│  Sync Agent │◄──►│ SecondMe    │     │   │   │
│  │  │   │  Runtime    │    │  (P2 DEBT)  │    │ Cloud       │     │   │   │
│  │  │   └─────────────┘    └─────────────┘    └─────────────┘     │   │   │
│  │  │          │                                    │               │   │   │
│  │  │          └──────────────┬─────────────────────┘               │   │   │
│  │  │                         │                                    │   │   │
│  │  │                    P2 Fallback                              │   │   │
│  │  │              (本地失败 → 云端降级)                            │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 接口关系图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         接口依赖关系                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────┐                                                       │
│   │  ArchiveManager │◄──────────────────────────────────────┐              │
│   │  (.hctx接口)     │                                       │              │
│   └────────┬────────┘                                       │              │
│            │                                                │              │
│            │ uses                                           │ implements   │
│            ▼                                                │              │
│   ┌─────────────────┐     ┌─────────────────┐              │              │
│   │  ContextSnapper │◄────┤  IStorageBackend │◄─────────────┘              │
│   │  (序列化核心)    │     │  (存储抽象)       │                             │
│   └─────────────────┘     └────────┬──────────┘                             │
│                                    │                                        │
│                    ┌───────────────┼───────────────┐                        │
│                    │               │               │                        │
│                    ▼               ▼               ▼                        │
│           ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                  │
│           │ LocalDisk   │ │  SecondMe   │ │   Git       │                  │
│           │ Backend     │ │  Cloud      │ │  Backend    │                  │
│           └─────────────┘ └──────┬──────┘ └─────────────┘                  │
│                                  │                                         │
│                                  │ P2 Fallback                             │
│                                  ▼                                         │
│                         ┌─────────────────┐                                │
│                         │  CloudMock      │                                │
│                         │  (降级服务)      │                                │
│                         └─────────────────┘                                │
│                                                                             │
│   ┌─────────────────┐                                                       │
│   │   RAGManager    │◄──────────────────────────────────────┐              │
│   │  (检索接口)      │                                       │              │
│   └────────┬────────┘                                       │              │
│            │                                                │              │
│            │ uses                                           │ implements   │
│            ▼                                                │              │
│   ┌─────────────────┐     ┌─────────────────┐              │              │
│   │   HybridRAG     │◄────┤  IEmbeddingProvider            │◄─────────────┘
│   │  (检索引擎)      │     │  (嵌入服务抽象)  │
│   └─────────────────┘     └────────┬──────────┘
│                                    │
│                    ┌───────────────┼───────────────┐
│                    │               │               │
│                    ▼               ▼               ▼
│           ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│           │ LocalHNSW   │ │ SecondMe    │ │  Remote     │
│           │ Index       │ │ Embedding   │ │  API        │
│           └─────────────┘ └──────┬──────┘ └─────────────┘
│                                  │
│                                  │ P2 Fallback
│                                  ▼
│                         ┌─────────────────┐
│                         │  LocalKeyword   │
│                         │  (BM25降级)      │
│                         └─────────────────┘
│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Archive 序列化到 .hctx 接口

### 2.1 接口定义

```typescript
/**
 * Archive管理器接口
 * 负责Workspace内容的序列化与反序列化到.hctx格式
 * 
 * 自测点: MEM-007 - Archive序列化到.hctx
 */
export interface IArchiveManager {
  /**
   * 创建全量快照
   * @param workspaceId 工作区ID
   * @param options 序列化选项
   * @returns 序列化后的.hctx数据
   * 
   * 性能目标: <100ms (SNAP-001)
   */
  createFullSnapshot(
    workspaceId: string,
    options?: SnapshotOptions
  ): Promise<HCTXData>;

  /**
   * 创建增量快照
   * @param workspaceId 工作区ID
   * @param baseSnapshot 基准快照
   * @param options 序列化选项
   * @returns 增量.hctx数据
   * 
   * 性能目标: 压缩率>80% (SNAP-002)
   */
  createIncrementalSnapshot(
    workspaceId: string,
    baseSnapshot: HCTXData,
    options?: SnapshotOptions
  ): Promise<HCTXData>;

  /**
   * 解析快照
   * @param hctxData .hctx格式数据
   * @returns 解析后的Workspace内容
   * 
   * 自测: SNAP-003 跨平台零丢失
   */
  parseSnapshot(hctxData: HCTXData): Promise<WorkspaceSnapshot>;

  /**
   * 导出到文件
   * @param hctxData .hctx数据
   * @param filePath 目标文件路径
   */
  exportToFile(hctxData: HCTXData, filePath: string): Promise<void>;

  /**
   * 从文件导入
   * @param filePath 源文件路径
   */
  importFromFile(filePath: string): Promise<HCTXData>;

  /**
   * 验证.hctx完整性
   * @param hctxData 待验证数据
   */
  validate(hctxData: HCTXData): Promise<ValidationResult>;
}

/**
 * .hctx 数据格式
 * 
 * 文件结构:
 * ┌─────────────────────────────────────────────────────────┐
 * │  Header (64 bytes)                                       │
 * │  - Magic: "HCTX" (4 bytes)                              │
 * │  - Version: uint16 (2 bytes)                            │
 * │  - UUID: 16 bytes (UUIDv7)                              │
 * │  - Timestamp: uint64 (8 bytes)                          │
 * │  - Metadata Offset/Length: uint32 x2 (8 bytes)          │
 * │  - Index Offset/Length: uint32 x2 (8 bytes)             │
 * │  - Data Offset/Length: uint32 x2 (8 bytes)              │
 * │  - Checksum: 8 bytes (partial SHA256)                   │
 * ├─────────────────────────────────────────────────────────┤
 * │  Metadata Zone (MessagePack)                            │
 * │  - Workspace info                                        │
 * │  - Object count                                          │
 * │  - Compression info                                      │
 * ├─────────────────────────────────────────────────────────┤
 * │  Index Zone (B+ Tree)                                    │
 * │  - Object ID → Offset mapping                           │
 * ├─────────────────────────────────────────────────────────┤
 * │  Data Zone                                               │
 * │  - Compressed object data                               │
 * ├─────────────────────────────────────────────────────────┤
 * │  Checksum (SHA256)                                       │
 * └─────────────────────────────────────────────────────────┘
 */
export interface HCTXData {
  /** 文件头 */
  header: HCTXHeader;
  /** 原始Buffer数据 */
  buffer: Buffer;
  /** 元数据 */
  metadata: HCTXMetadata;
}

export interface HCTXHeader {
  magic: number;           // 0x48435458 "HCTX"
  version: number;         // 当前版本: 1
  uuid: string;            // UUIDv7
  timestamp: number;       // Unix timestamp (ms)
  parentHash: string | null; // 父快照哈希（增量快照用）
  metadataOffset: number;
  metadataLength: number;
  indexOffset: number;
  indexLength: number;
  dataOffset: number;
  dataLength: number;
  checksum: Buffer;        // SHA256前32字节
}

export interface HCTXMetadata {
  workspaceId: string;
  createdAt: number;
  objectCount: number;
  compression: {
    algorithm: 'none' | 'zstd' | 'lz4';
    level: number;
    ratio: number;
  };
  types: string[];         // 包含的对象类型
}

export interface SnapshotOptions {
  /** 压缩算法 */
  compression?: 'none' | 'zstd' | 'lz4';
  /** 压缩级别 (1-22 for zstd) */
  compressionLevel?: number;
  /** 是否包含Git历史 */
  includeGitHistory?: boolean;
  /** 父快照哈希（增量模式） */
  parentHash?: string;
  /** 加密选项 */
  encryption?: {
    enabled: boolean;
    keyId?: string;
  };
}

export interface WorkspaceSnapshot {
  workspaceId: string;
  timestamp: number;
  objects: SnapshotObject[];
  gitState?: GitState;
}

export interface SnapshotObject {
  id: string;
  type: 'context' | 'state' | 'preference' | 'memory' | 'pattern';
  data: unknown;
  metadata: {
    createdAt: number;
    modifiedAt: number;
    size: number;
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  checksumMatch: boolean;
  version: number;
}
```

### 2.2 ArchiveManager 实现

```typescript
/**
 * Archive管理器实现
 * 
 * @debt LCR-B03-003 - P2 - SecondMe云端Archive备份
 * - 本地Archive失败时，自动同步到SecondMe云端
 * - 预计清偿: v1.4.0
 */
export class ArchiveManager implements IArchiveManager {
  private snapper: ContextSnapper;
  private storage: IStorageBackend;
  private syncAgent: SecondMeSyncAgent;
  
  /** P2债务标记: 是否启用云端降级 */
  private cloudFallbackEnabled: boolean = true;

  constructor(config: ArchiveConfig) {
    this.snapper = new ContextSnapper();
    this.storage = config.storage || new LocalDiskBackend();
    this.syncAgent = new SecondMeSyncAgent(config.syncConfig);
  }

  async createFullSnapshot(
    workspaceId: string,
    options: SnapshotOptions = {}
  ): Promise<HCTXData> {
    const startTime = Date.now();
    
    try {
      // 1. 收集Workspace数据
      const workspace = await this.loadWorkspace(workspaceId);
      
      // 2. 构建对象列表
      const objects = this.buildSnapshotObjects(workspace);
      
      // 3. 使用ContextSnapper创建快照
      const buffer = await this.snapper.createFullSnapshot(objects, {
        compress: options.compression !== 'none',
      });

      // 4. 构建HCTX结构
      const hctx = this.buildHCTX(buffer, workspaceId, options);

      // 5. 异步同步到云端 (P2债务)
      this.syncToCloud(hctx).catch(err => {
        console.warn('[ArchiveManager] Cloud sync failed (P2 debt):', err.message);
      });

      const elapsed = Date.now() - startTime;
      if (elapsed > 100) {
        console.warn(`[ArchiveManager] Snapshot took ${elapsed}ms, target <100ms`);
      }

      return hctx;
    } catch (error) {
      // P2降级策略: 本地失败时尝试云端
      if (this.cloudFallbackEnabled) {
        console.warn('[ArchiveManager] Local snapshot failed, trying cloud fallback (P2)');
        return this.createCloudSnapshot(workspaceId, options);
      }
      throw error;
    }
  }

  async createIncrementalSnapshot(
    workspaceId: string,
    baseSnapshot: HCTXData,
    options: SnapshotOptions = {}
  ): Promise<HCTXData> {
    const workspace = await this.loadWorkspace(workspaceId);
    const newObjects = this.buildSnapshotObjects(workspace);
    
    const buffer = await this.snapper.createIncrementalSnapshot(
      baseSnapshot.buffer,
      newObjects
    );

    return this.buildHCTX(buffer, workspaceId, {
      ...options,
      parentHash: this.calculateHash(baseSnapshot),
    });
  }

  async parseSnapshot(hctxData: HCTXData): Promise<WorkspaceSnapshot> {
    // 验证校验和
    if (!this.verifyChecksum(hctxData)) {
      throw new Error('HCTX checksum verification failed');
    }

    const objects = await this.snapper.parseSnapshot(hctxData.buffer);
    
    return {
      workspaceId: hctxData.metadata.workspaceId,
      timestamp: hctxData.header.timestamp,
      objects,
    };
  }

  // ========== P2降级策略 ==========
  
  /**
   * 云端快照创建（降级方案）
   * @debt LCR-B03-003
   */
  private async createCloudSnapshot(
    workspaceId: string,
    options: SnapshotOptions
  ): Promise<HCTXData> {
    // 尝试通过SecondMe SyncAgent创建云端快照
    const cloudResult = await this.syncAgent.createSnapshot(workspaceId, options);
    
    if (!cloudResult.success) {
      throw new Error('Both local and cloud snapshot failed');
    }

    return cloudResult.data!;
  }

  /**
   * 云端恢复（降级方案）
   * @debt LCR-B03-003
   */
  async restoreFromCloud(workspaceId: string): Promise<WorkspaceSnapshot> {
    const cloudData = await this.syncAgent.retrieveSnapshot(workspaceId);
    return this.parseSnapshot(cloudData);
  }

  // ========== 私有方法 ==========

  private async loadWorkspace(workspaceId: string): Promise<Workspace> {
    // 从存储后端加载
    return this.storage.load(workspaceId);
  }

  private buildSnapshotObjects(workspace: Workspace): SnapshotObject[] {
    return [
      ...workspace.contexts.map(ctx => ({
        id: ctx.id,
        type: 'context' as const,
        data: ctx.data,
        compressed: false,
        compressionAlgo: 'none' as const,
      })),
      ...workspace.states.map(state => ({
        id: state.id,
        type: 'state' as const,
        data: state.data,
        compressed: false,
        compressionAlgo: 'none' as const,
      })),
    ];
  }

  private buildHCTX(
    buffer: Buffer,
    workspaceId: string,
    options: SnapshotOptions
  ): HCTXData {
    // 解析由ContextSnapper生成的buffer
    const header = this.parseHeader(buffer);
    
    return {
      header,
      buffer,
      metadata: {
        workspaceId,
        createdAt: Date.now(),
        objectCount: header.metadataLength, // 简化
        compression: {
          algorithm: options.compression || 'zstd',
          level: options.compressionLevel || 3,
          ratio: 0.8,
        },
        types: ['context', 'state', 'memory'],
      },
    };
  }

  private parseHeader(buffer: Buffer): HCTXHeader {
    return {
      magic: buffer.readUInt32BE(0),
      version: buffer.readUInt16BE(4),
      uuid: buffer.slice(40, 56).toString('hex'),
      timestamp: Number(buffer.readBigUInt64BE(8)),
      parentHash: null,
      metadataOffset: buffer.readUInt32BE(16),
      metadataLength: buffer.readUInt32BE(20),
      indexOffset: buffer.readUInt32BE(24),
      indexLength: buffer.readUInt32BE(28),
      dataOffset: buffer.readUInt32BE(32),
      dataLength: buffer.readUInt32BE(36),
      checksum: buffer.slice(56, 64),
    };
  }

  private verifyChecksum(hctxData: HCTXData): boolean {
    // SHA256校验
    const crypto = require('crypto');
    const calculated = crypto
      .createHash('sha256')
      .update(hctxData.buffer)
      .digest()
      .slice(0, 8);
    return calculated.equals(hctxData.header.checksum);
  }

  private calculateHash(hctxData: HCTXData): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(hctxData.buffer).digest('hex');
  }

  private async syncToCloud(hctxData: HCTXData): Promise<void> {
    // P2债务: 异步云端同步
    await this.syncAgent.syncSnapshot(hctxData);
  }
}
```

### 2.3 存储后端抽象

```typescript
/**
 * 存储后端接口
 * 支持本地磁盘、SecondMe云端、Git等多种后端
 */
export interface IStorageBackend {
  /** 存储类型 */
  readonly type: 'local' | 'cloud' | 'git' | 'hybrid';
  
  /** 保存Workspace */
  save(workspaceId: string, data: Workspace): Promise<void>;
  
  /** 加载Workspace */
  load(workspaceId: string): Promise<Workspace>;
  
  /** 删除Workspace */
  delete(workspaceId: string): Promise<void>;
  
  /** 列出所有Workspace */
  list(): Promise<string[]>;
  
  /** 检查是否存在 */
  exists(workspaceId: string): Promise<boolean>;
}

/**
 * 本地磁盘存储后端
 */
export class LocalDiskBackend implements IStorageBackend {
  readonly type = 'local';
  private basePath: string;

  constructor(basePath: string = './workspace') {
    this.basePath = basePath;
  }

  async save(workspaceId: string, data: Workspace): Promise<void> {
    const path = `${this.basePath}/${workspaceId}.json`;
    await fs.writeFile(path, JSON.stringify(data));
  }

  async load(workspaceId: string): Promise<Workspace> {
    const path = `${this.basePath}/${workspaceId}.json`;
    const content = await fs.readFile(path, 'utf-8');
    return JSON.parse(content);
  }

  // ... 其他方法实现
}

/**
 * SecondMe云端存储后端
 * @debt LCR-B03-003 - P2
 */
export class SecondMeCloudBackend implements IStorageBackend {
  readonly type = 'cloud';
  private apiKey: string | null = null;
  private mockMode: boolean = true;

  constructor(config?: { apiKey?: string; endpoint?: string }) {
    if (config?.apiKey) {
      this.apiKey = config.apiKey;
      this.mockMode = false;
    }
  }

  async save(workspaceId: string, data: Workspace): Promise<void> {
    if (this.mockMode) {
      console.warn('[SecondMeCloudBackend] P2 DEBT: Running in mock mode');
      return;
    }
    // 真实API调用待实现
    throw new Error('SecondMe Cloud API not configured (P2 debt: LCR-B03-003)');
  }

  async load(workspaceId: string): Promise<Workspace> {
    if (this.mockMode) {
      throw new Error('SecondMe Cloud not available in mock mode');
    }
    throw new Error('SecondMe Cloud API not configured (P2 debt: LCR-B03-003)');
  }

  // ... 其他方法实现
}
```

---

## 3. RAG 向量检索接口（<200ms延迟）

### 3.1 接口定义

```typescript
/**
 * RAG管理器接口
 * 负责混合检索：向量+图谱+关键词
 * 
 * 自测点: MEM-008 - RAG检索延迟<200ms
 */
export interface IRAGManager {
  /**
   * 添加文档到索引
   * @param doc 文档
   */
  addDocument(doc: RAGDocument): Promise<void>;

  /**
   * 批量添加文档
   * @param docs 文档列表
   */
  addDocuments(docs: RAGDocument[]): Promise<void>;

  /**
   * 检索相关文档
   * @param query 查询文本
   * @param options 检索选项
   * @returns 检索结果，按相关性排序
   * 
   * 性能目标: <200ms (MEM-008)
   */
  search(
    query: string,
    options?: SearchOptions
  ): Promise<RAGResult[]>;

  /**
   * 向量检索
   * @param queryVector 查询向量
   * @param limit 返回数量
   * @returns 向量相似度结果
   * 
   * 性能目标: <150ms
   */
  vectorSearch(
    queryVector: number[],
    limit?: number
  ): Promise<RAGResult[]>;

  /**
   * 更新文档
   * @param doc 更新后的文档
   */
  updateDocument(doc: RAGDocument): Promise<void>;

  /**
   * 删除文档
   * @param docId 文档ID
   */
  removeDocument(docId: string): Promise<void>;

  /**
   * 重建索引
   */
  rebuildIndex(): Promise<void>;

  /**
   * 获取索引统计
   */
  getStats(): Promise<RAGStats>;
}

/**
 * RAG文档
 */
export interface RAGDocument {
  /** 文档唯一ID */
  id: string;
  /** 文档内容 */
  content: string;
  /** 预计算向量（可选，将由embedding服务生成） */
  embedding?: number[];
  /** 元数据 */
  metadata: {
    source: string;
    type: 'code' | 'doc' | 'conversation' | 'pattern';
    timestamp: number;
    tags?: string[];
    /** 关联的Workspace ID */
    workspaceId?: string;
  };
}

/**
 * 检索结果
 */
export interface RAGResult {
  /** 匹配文档 */
  document: RAGDocument;
  /** 相似度分数 (0-1) */
  score: number;
  /** 来源检索方式 */
  source: 'vector' | 'graph' | 'keyword' | 'fusion';
  /** 匹配位置（用于高亮） */
  matches?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

/**
 * 检索选项
 */
export interface SearchOptions {
  /** 返回结果数量 */
  limit?: number;
  /** 最小相似度阈值 */
  threshold?: number;
  /** 检索模式 */
  mode?: 'vector' | 'keyword' | 'hybrid' | 'graph';
  /** 过滤条件 */
  filter?: {
    type?: string[];
    source?: string[];
    tags?: string[];
    timeRange?: { start: number; end: number };
  };
  /** 是否使用缓存 */
  useCache?: boolean;
}

/**
 * RAG统计信息
 */
export interface RAGStats {
  totalDocuments: number;
  totalVectors: number;
  indexSizeMB: number;
  avgQueryLatency: number;
  cacheHitRate: number;
}

/**
 * Embedding服务提供者接口
 */
export interface IEmbeddingProvider {
  /** 提供者名称 */
  readonly name: string;
  /** 向量维度 */
  readonly dimensions: number;
  /** 是否可用 */
  isAvailable(): Promise<boolean>;
  /** 生成向量 */
  embed(text: string): Promise<number[]>;
  /** 批量生成向量 */
  embedBatch(texts: string[]): Promise<number[][]>;
}
```

### 3.2 RAGManager 实现

```typescript
/**
 * RAG管理器实现
 * 混合检索：向量(35%) + 图谱(15%) + 关键词(50%)
 * 
 * @debt LCR-B03-003 - P2 - SecondMe云端Embedding服务
 * - 本地向量生成失败时，回退到SecondMe云端Embedding
 * - 预计清偿: v1.4.0
 */
export class RAGManager implements IRAGManager {
  private hybridRAG: HybridRAG;
  private embeddingProvider: IEmbeddingProvider;
  private cache: RAGCache;
  
  /** P2债务标记 */
  private cloudEmbeddingEnabled: boolean = true;
  private fallbackProvider: IEmbeddingProvider | null = null;

  constructor(config: RAGConfig) {
    this.hybridRAG = new HybridRAG();
    this.embeddingProvider = config.embeddingProvider || new LocalEmbeddingProvider();
    this.cache = new RAGCache(config.cacheSize || 1000);
    
    // P2债务: 配置云端降级Provider
    if (config.cloudEmbeddingConfig) {
      this.fallbackProvider = new SecondMeEmbeddingProvider(config.cloudEmbeddingConfig);
    }
  }

  async addDocument(doc: RAGDocument): Promise<void> {
    // 如果没有预计算向量，生成向量
    if (!doc.embedding) {
      doc.embedding = await this.generateEmbedding(doc.content);
    }
    
    this.hybridRAG.addDocument(doc);
  }

  async addDocuments(docs: RAGDocument[]): Promise<void> {
    // 批量生成向量
    const texts = docs.filter(d => !d.embedding).map(d => d.content);
    
    if (texts.length > 0) {
      const embeddings = await this.embeddingProvider.embedBatch(texts);
      let embedIndex = 0;
      
      for (const doc of docs) {
        if (!doc.embedding) {
          doc.embedding = embeddings[embedIndex++];
        }
      }
    }

    // 批量添加
    for (const doc of docs) {
      this.hybridRAG.addDocument(doc);
    }
  }

  async search(query: string, options: SearchOptions = {}): Promise<RAGResult[]> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(query, options);
    
    // 1. 检查缓存
    const cached = this.cache.get(cacheKey);
    if (cached && options.useCache !== false) {
      return cached;
    }

    // 2. 生成查询向量
    let queryVector: number[] | undefined;
    try {
      queryVector = await this.generateEmbedding(query);
    } catch (error) {
      console.warn('[RAGManager] Embedding failed, using keyword only mode');
    }

    // 3. 混合检索
    const results = await this.hybridRAG.search(query, {
      vector: queryVector,
      limit: options.limit || 5,
    });

    // 4. 应用过滤
    const filtered = this.applyFilter(results, options.filter);

    // 5. 应用阈值
    const threshold = options.threshold || 0.5;
    const thresholded = filtered.filter(r => r.score >= threshold);

    // 6. 写入缓存
    this.cache.set(cacheKey, thresholded);

    const elapsed = Date.now() - startTime;
    if (elapsed > 200) {
      console.warn(`[RAGManager] Search took ${elapsed}ms, target <200ms (MEM-008)`);
    }

    return thresholded;
  }

  async vectorSearch(queryVector: number[], limit: number = 5): Promise<RAGResult[]> {
    const startTime = Date.now();
    
    const results = await this.hybridRAG.search('', {
      vector: queryVector,
      limit,
    });

    const elapsed = Date.now() - startTime;
    if (elapsed > 150) {
      console.warn(`[RAGManager] Vector search took ${elapsed}ms, target <150ms`);
    }

    return results.filter(r => r.source === 'vector' || r.source === 'fusion');
  }

  async updateDocument(doc: RAGDocument): Promise<void> {
    // 删除旧版本
    this.hybridRAG.removeDocument(doc.id);
    
    // 添加新版本
    await this.addDocument(doc);
  }

  removeDocument(docId: string): Promise<void> {
    this.hybridRAG.removeDocument(docId);
    return Promise.resolve();
  }

  async rebuildIndex(): Promise<void> {
    // 重建索引逻辑
    console.log('[RAGManager] Rebuilding index...');
    this.hybridRAG.rebuild();
    this.cache.clear();
  }

  async getStats(): Promise<RAGStats> {
    return {
      totalDocuments: this.hybridRAG.getDocumentCount(),
      totalVectors: this.hybridRAG.getVectorCount(),
      indexSizeMB: this.hybridRAG.getIndexSize(),
      avgQueryLatency: this.cache.getAvgLatency(),
      cacheHitRate: this.cache.getHitRate(),
    };
  }

  // ========== P2降级策略 ==========

  /**
   * 生成向量，带云端降级
   * @debt LCR-B03-003
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      // 首先尝试本地生成
      return await this.embeddingProvider.embed(text);
    } catch (error) {
      // P2降级: 本地失败时尝试云端
      if (this.cloudEmbeddingEnabled && this.fallbackProvider) {
        console.warn('[RAGManager] Local embedding failed, falling back to cloud (P2)');
        return await this.fallbackProvider.embed(text);
      }
      throw error;
    }
  }

  private generateCacheKey(query: string, options: SearchOptions): string {
    return `${query}:${JSON.stringify(options)}`;
  }

  private applyFilter(results: RAGResult[], filter?: SearchOptions['filter']): RAGResult[] {
    if (!filter) return results;

    return results.filter(r => {
      if (filter.type && !filter.type.includes(r.document.metadata.type)) {
        return false;
      }
      if (filter.source && !filter.source.includes(r.document.metadata.source)) {
        return false;
      }
      if (filter.tags && !filter.tags.some(t => r.document.metadata.tags?.includes(t))) {
        return false;
      }
      if (filter.timeRange) {
        const ts = r.document.metadata.timestamp;
        if (ts < filter.timeRange.start || ts > filter.timeRange.end) {
          return false;
        }
      }
      return true;
    });
  }
}

/**
 * RAG缓存
 */
class RAGCache {
  private cache: Map<string, { data: RAGResult[]; timestamp: number }>;
  private maxSize: number;
  private ttl: number;
  private queryCount = 0;
  private hitCount = 0;
  private totalLatency = 0;

  constructor(maxSize: number, ttl: number = 300000) { // 默认5分钟TTL
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  get(key: string): RAGResult[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // 检查TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    this.hitCount++;
    return entry.data;
  }

  set(key: string, data: RAGResult[]): void {
    // LRU淘汰
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }

  getHitRate(): number {
    return this.queryCount > 0 ? this.hitCount / this.queryCount : 0;
  }

  getAvgLatency(): number {
    return this.queryCount > 0 ? this.totalLatency / this.queryCount : 0;
  }
}
```

### 3.3 Embedding提供者实现

```typescript
/**
 * 本地Embedding提供者
 * 使用轻量级本地模型
 */
export class LocalEmbeddingProvider implements IEmbeddingProvider {
  readonly name = 'local';
  readonly dimensions = 384; // all-MiniLM-L6-v2 维度
  private model: any; // 模型实例

  async isAvailable(): Promise<boolean> {
    // 检查本地模型是否加载
    return this.model !== undefined;
  }

  async embed(text: string): Promise<number[]> {
    if (!this.model) {
      throw new Error('Local embedding model not loaded');
    }
    // 调用本地模型生成向量
    return this.model.embed(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.model) {
      throw new Error('Local embedding model not loaded');
    }
    return this.model.embedBatch(texts);
  }
}

/**
 * SecondMe云端Embedding提供者
 * @debt LCR-B03-003 - P2
 */
export class SecondMeEmbeddingProvider implements IEmbeddingProvider {
  readonly name = 'secondme-cloud';
  readonly dimensions = 1536; // OpenAI兼容维度
  
  private apiKey: string | null = null;
  private endpoint: string;
  private mockMode: boolean = true;

  constructor(config?: { apiKey?: string; endpoint?: string }) {
    this.endpoint = config?.endpoint || 'https://api.secondme.io/v1';
    if (config?.apiKey) {
      this.apiKey = config.apiKey;
      this.mockMode = false;
    }
  }

  async isAvailable(): Promise<boolean> {
    if (this.mockMode) return false;
    
    try {
      const response = await fetch(`${this.endpoint}/health`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async embed(text: string): Promise<number[]> {
    if (this.mockMode) {
      console.warn('[SecondMeEmbedding] P2 DEBT: Running in mock mode');
      // 返回随机向量作为mock
      return Array(this.dimensions).fill(0).map(() => Math.random() - 0.5);
    }

    const response = await fetch(`${this.endpoint}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        input: text,
        model: 'text-embedding-3-small',
      }),
    });

    if (!response.ok) {
      throw new Error(`SecondMe embedding failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // 批量调用
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }
}
```

---

## 4. SecondMe云端同步协议

### 4.1 协议架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SecondMe Cloud Sync Protocol                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐                              ┌─────────────────┐      │
│  │   Local LCR     │                              │  SecondMe Cloud │      │
│  │                 │◄────────────────────────────►│                 │      │
│  │  ┌───────────┐  │      Sync Channel            │  ┌───────────┐  │      │
│  │  │ Workspace │  │  ┌──────────────────────┐   │  │  Agent    │  │      │
│  │  │  Manager  │  │  │  WebSocket / HTTPS   │   │  │  Service  │  │      │
│  │  └─────┬─────┘  │  │                      │   │  └─────┬─────┘  │      │
│  │        │        │  │  Protocol: LCR-SYNC  │   │        │        │      │
│  │        ▼        │  │  Version: 1.0        │   │        ▼        │      │
│  │  ┌───────────┐  │  │                      │   │  ┌───────────┐  │      │
│  │  │  Archive  │  │  │  Auth: API Key + JWT │   │  │  Cloud    │  │      │
│  │  │  Manager  │──┼──►  Encryption: E2E     │   │  │  Storage  │  │      │
│  │  └───────────┘  │  │  Compression: zstd   │   │  └───────────┘  │      │
│  │        │        │  └──────────────────────┘   │        │        │      │
│  │        ▼        │                              │        ▼        │      │
│  │  ┌───────────┐  │                              │  ┌───────────┐  │      │
│  │  │   RAG     │  │                              │  │  Vector   │  │      │
│  │  │  Manager  │──┘                              │  │   Store   │  │      │
│  │  └───────────┘                                 │  └───────────┘  │      │
│  │        │                                       │                 │      │
│  │        ▼                                       │                 │      │
│  │  ┌───────────┐                                 │                 │      │
│  │  │  Sync     │                                 │                 │      │
│  │  │  Agent    │                                 │                 │      │
│  │  └───────────┘                                 │                 │      │
│  └─────────────────┘                              └─────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 同步代理实现

```typescript
/**
 * SecondMe同步代理
 * 负责本地与SecondMe云端的同步
 * 
 * @debt LCR-B03-003 - P2
 */
export class SecondMeSyncAgent {
  private config: SecondMeConfig;
  private ws: WebSocket | null = null;
  private messageQueue: SyncMessage[] = [];
  private syncState: SyncState = 'disconnected';

  constructor(config: SecondMeConfig) {
    this.config = config;
  }

  /**
   * 连接到SecondMe云端
   */
  async connect(): Promise<void> {
    if (!this.config.apiKey) {
      console.warn('[SecondMeSyncAgent] P2 DEBT: No API key, running in mock mode');
      this.syncState = 'mock';
      return;
    }

    try {
      this.ws = new WebSocket(this.config.wsEndpoint, {
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
      });

      this.ws.on('open', () => {
        this.syncState = 'connected';
        this.flushMessageQueue();
      });

      this.ws.on('message', (data) => this.handleMessage(JSON.parse(data.toString())));
      
      this.ws.on('error', (error) => {
        console.error('[SecondMeSyncAgent] WebSocket error:', error);
        this.syncState = 'error';
      });

      this.ws.on('close', () => {
        this.syncState = 'disconnected';
        // 自动重连
        setTimeout(() => this.connect(), 5000);
      });
    } catch (error) {
      console.error('[SecondMeSyncAgent] Connection failed:', error);
      this.syncState = 'error';
    }
  }

  /**
   * 同步快照到云端
   */
  async syncSnapshot(hctxData: HCTXData): Promise<SyncResult> {
    if (this.syncState === 'mock') {
      return { success: false, error: 'Mock mode - cloud sync disabled (P2 debt)' };
    }

    const message: SyncMessage = {
      type: 'SNAPSHOT_SYNC',
      timestamp: Date.now(),
      payload: {
        workspaceId: hctxData.metadata.workspaceId,
        snapshotHash: this.calculateHash(hctxData),
        size: hctxData.buffer.length,
        data: hctxData.buffer.toString('base64'),
      },
    };

    return this.sendMessage(message);
  }

  /**
   * 从云端检索快照
   */
  async retrieveSnapshot(workspaceId: string): Promise<HCTXData> {
    if (this.syncState === 'mock') {
      throw new Error('Cloud retrieval not available in mock mode (P2 debt)');
    }

    const message: SyncMessage = {
      type: 'SNAPSHOT_RETRIEVE',
      timestamp: Date.now(),
      payload: { workspaceId },
    };

    const result = await this.sendMessage(message);
    
    if (!result.success) {
      throw new Error(`Failed to retrieve snapshot: ${result.error}`);
    }

    // 解析返回的HCTX数据
    return this.parseHCTXFromPayload(result.payload);
  }

  /**
   * 同步RAG索引到云端
   */
  async syncRAGIndex(stats: RAGStats, vectors: number[][]): Promise<SyncResult> {
    if (this.syncState === 'mock') {
      return { success: false, error: 'Mock mode - RAG sync disabled (P2 debt)' };
    }

    const message: SyncMessage = {
      type: 'RAG_SYNC',
      timestamp: Date.now(),
      payload: {
        stats,
        vectorCount: vectors.length,
        // 实际实现应增量同步
      },
    };

    return this.sendMessage(message);
  }

  /**
   * 创建云端快照（降级方案）
   * @debt LCR-B03-003
   */
  async createSnapshot(workspaceId: string, options: SnapshotOptions): Promise<SyncResult> {
    // 调用SecondMe API创建云端快照
    try {
      const response = await fetch(`${this.config.apiEndpoint}/snapshots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({ workspaceId, options }),
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json();
      return { success: true, data: data.snapshot };
    } catch (error) {
      return { 
        success: false, 
        error: `SecondMe API call failed: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  /**
   * 获取同步状态
   */
  getStatus(): SyncStatus {
    return {
      state: this.syncState,
      queueLength: this.messageQueue.length,
      lastSyncAt: null, // 简化
    };
  }

  // ========== 私有方法 ==========

  private async sendMessage(message: SyncMessage): Promise<SyncResult> {
    if (this.syncState !== 'connected') {
      this.messageQueue.push(message);
      return { success: false, error: 'Not connected, queued for later' };
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Timeout' });
      }, 30000);

      const handler = (data: Buffer) => {
        const response = JSON.parse(data.toString());
        if (response.correlationId === message.timestamp) {
          clearTimeout(timeout);
          this.ws?.off('message', handler);
          resolve({ success: response.success, data: response.payload, error: response.error });
        }
      };

      this.ws?.on('message', handler);
      this.ws?.send(JSON.stringify(message));
    });
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.syncState === 'connected') {
      const message = this.messageQueue.shift();
      if (message) {
        this.ws?.send(JSON.stringify(message));
      }
    }
  }

  private handleMessage(message: SyncMessage): void {
    switch (message.type) {
      case 'SYNC_ACK':
        console.log('[SecondMeSyncAgent] Sync acknowledged');
        break;
      case 'SYNC_ERROR':
        console.error('[SecondMeSyncAgent] Sync error:', message.payload);
        break;
      default:
        console.log('[SecondMeSyncAgent] Unknown message type:', message.type);
    }
  }

  private calculateHash(hctxData: HCTXData): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(hctxData.buffer).digest('hex').slice(0, 16);
  }

  private parseHCTXFromPayload(payload: any): HCTXData {
    // 从payload解析HCTX数据
    const buffer = Buffer.from(payload.data, 'base64');
    return {
      header: payload.header,
      buffer,
      metadata: payload.metadata,
    };
  }
}

// ========== 类型定义 ==========

interface SecondMeConfig {
  apiKey?: string;
  apiEndpoint: string;
  wsEndpoint: string;
  timeout?: number;
}

type SyncState = 'disconnected' | 'connecting' | 'connected' | 'error' | 'mock';

interface SyncMessage {
  type: 'SNAPSHOT_SYNC' | 'SNAPSHOT_RETRIEVE' | 'RAG_SYNC' | 'SYNC_ACK' | 'SYNC_ERROR';
  timestamp: number;
  correlationId?: number;
  payload: Record<string, unknown>;
}

interface SyncResult {
  success: boolean;
  data?: HCTXData;
  error?: string;
}

interface SyncStatus {
  state: SyncState;
  queueLength: number;
  lastSyncAt: number | null;
}
```

---

## 5. P2降级策略（本地失败时回退云端）

### 5.1 降级策略架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    P2 Fallback Strategy (LCR-B03-003)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    Fallback Controller                             │   │
│   │                                                                     │   │
│   │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐            │   │
│   │   │   PRIMARY   │───►│  FALLBACK   │───►│   EMERGENCY│            │   │
│   │   │   (本地)     │    │  (云端)      │    │   (降级服务)│            │   │
│   │   └─────────────┘    └─────────────┘    └─────────────┘            │   │
│   │          │                  │                  │                   │   │
│   │          │                  │                  │                   │   │
│   │          ▼                  ▼                  ▼                   │   │
│   │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐            │   │
│   │   │ LocalDisk   │    │ SecondMe    │    │  LocalCache │            │   │
│   │   │ Backend     │    │ Cloud       │    │  ( stale )  │            │   │
│   │   └─────────────┘    └─────────────┘    └─────────────┘            │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    降级触发条件                                      │   │
│   │                                                                     │   │
│   │   Archive管理器:                                                     │   │
│   │   • 本地磁盘写入失败 → 云端备份                                      │   │
│   │   • 本地文件损坏 → 云端恢复                                          │   │
│   │   • 磁盘空间不足 → 云端归档                                          │   │
│   │                                                                     │   │
│   │   RAG检索引擎:                                                       │   │
│   │   • 本地向量生成失败 → 云端Embedding                                 │   │
│   │   • 本地索引损坏 → 云端检索                                          │   │
│   │   • 检索超时(>200ms) → 简化关键词检索                                │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 降级控制器实现

```typescript
/**
 * P2降级控制器
 * 
 * @debt LCR-B03-003
 * 
 * 降级策略:
 * 1. 首先尝试本地处理
 * 2. 本地失败时，自动切换到云端
 * 3. 云端也失败时，使用最简化的降级服务
 */
export class P2FallbackController {
  private archiveManager: ArchiveManager;
  private ragManager: RAGManager;
  private cloudSyncAgent: SecondMeSyncAgent;
  private localCache: LocalFallbackCache;
  
  /** 降级统计 */
  private stats: FallbackStats = {
    archiveLocalSuccess: 0,
    archiveCloudFallback: 0,
    archiveEmergencyFallback: 0,
    ragLocalSuccess: 0,
    ragCloudFallback: 0,
    ragKeywordFallback: 0,
  };

  constructor(config: FallbackConfig) {
    this.archiveManager = config.archiveManager;
    this.ragManager = config.ragManager;
    this.cloudSyncAgent = config.cloudSyncAgent;
    this.localCache = new LocalFallbackCache();
  }

  /**
   * Archive操作 - 带P2降级
   */
  async archiveWithFallback(
    workspaceId: string,
    options?: SnapshotOptions
  ): Promise<HCTXData> {
    try {
      // 尝试本地
      const result = await this.archiveManager.createFullSnapshot(workspaceId, options);
      this.stats.archiveLocalSuccess++;
      return result;
    } catch (localError) {
      console.warn('[P2FallbackController] Local archive failed:', localError);

      try {
        // 降级1: 云端备份
        console.log('[P2FallbackController] Falling back to cloud archive (P2)');
        const cloudResult = await this.cloudSyncAgent.createSnapshot(workspaceId, options);
        
        if (cloudResult.success) {
          this.stats.archiveCloudFallback++;
          return cloudResult.data!;
        }
        
        throw new Error('Cloud fallback also failed');
      } catch (cloudError) {
        // 降级2: 本地缓存
        console.warn('[P2FallbackController] Cloud fallback failed:', cloudError);
        console.log('[P2FallbackController] Using emergency local cache (P2)');
        
        const emergencyResult = await this.localCache.getLastSnapshot(workspaceId);
        if (emergencyResult) {
          this.stats.archiveEmergencyFallback++;
          return emergencyResult;
        }
        
        throw new Error('All fallback strategies failed');
      }
    }
  }

  /**
   * RAG检索 - 带P2降级
   */
  async searchWithFallback(
    query: string,
    options?: SearchOptions
  ): Promise<RAGResult[]> {
    const startTime = Date.now();
    
    try {
      // 尝试本地检索
      const results = await this.ragManager.search(query, {
        ...options,
        useCache: true,
      });
      
      const elapsed = Date.now() - startTime;
      
      // 如果超时，记录但继续
      if (elapsed > 200) {
        console.warn(`[P2FallbackController] Local search slow: ${elapsed}ms`);
      }
      
      this.stats.ragLocalSuccess++;
      return results;
    } catch (localError) {
      console.warn('[P2FallbackController] Local RAG failed:', localError);

      try {
        // 降级1: 云端Embedding + 检索
        console.log('[P2FallbackController] Falling back to cloud embedding (P2)');
        const cloudResults = await this.searchViaCloud(query, options);
        this.stats.ragCloudFallback++;
        return cloudResults;
      } catch (cloudError) {
        // 降级2: 纯关键词检索
        console.warn('[P2FallbackController] Cloud RAG failed:', cloudError);
        console.log('[P2FallbackController] Using keyword-only search (P2)');
        
        const keywordResults = await this.keywordOnlySearch(query, options);
        this.stats.ragKeywordFallback++;
        return keywordResults;
      }
    }
  }

  /**
   * 向量生成 - 带P2降级
   */
  async embedWithFallback(text: string): Promise<number[]> {
    try {
      // 尝试本地
      return await this.ragManager['generateEmbedding'](text);
    } catch {
      // 降级到云端
      console.log('[P2FallbackController] Falling back to cloud embedding (P2)');
      return this.embedViaCloud(text);
    }
  }

  /**
   * 获取降级统计
   */
  getStats(): FallbackStats {
    return { ...this.stats };
  }

  /**
   * 获取健康状态
   */
  getHealth(): FallbackHealth {
    const totalArchive = this.stats.archiveLocalSuccess + 
                        this.stats.archiveCloudFallback + 
                        this.stats.archiveEmergencyFallback;
    
    const totalRAG = this.stats.ragLocalSuccess + 
                    this.stats.ragCloudFallback + 
                    this.stats.ragKeywordFallback;
    
    return {
      archiveHealth: totalArchive > 0 ? this.stats.archiveLocalSuccess / totalArchive : 1,
      ragHealth: totalRAG > 0 ? this.stats.ragLocalSuccess / totalRAG : 1,
      fallbackRate: (this.stats.archiveCloudFallback + this.stats.ragCloudFallback) / 
                    (totalArchive + totalRAG || 1),
      status: this.determineStatus(),
    };
  }

  // ========== 私有降级方法 ==========

  private async searchViaCloud(query: string, options?: SearchOptions): Promise<RAGResult[]> {
    // 调用云端检索API
    // 简化实现
    throw new Error('Cloud search not implemented (P2 debt)');
  }

  private async embedViaCloud(text: string): Promise<number[]> {
    // 调用云端Embedding API
    const provider = new SecondMeEmbeddingProvider({
      apiKey: process.env.SECONDME_API_KEY,
    });
    return provider.embed(text);
  }

  private async keywordOnlySearch(query: string, options?: SearchOptions): Promise<RAGResult[]> {
    // 纯关键词检索，不使用向量
    // 返回简化结果，确保功能可用
    const keywords = query.toLowerCase().split(/\s+/);
    
    // 从缓存或简化索引中检索
    return this.localCache.keywordSearch(keywords, options?.limit || 5);
  }

  private determineStatus(): 'healthy' | 'degraded' | 'critical' {
    const health = this.getHealth();
    
    if (health.archiveHealth > 0.9 && health.ragHealth > 0.9) {
      return 'healthy';
    } else if (health.archiveHealth > 0.5 && health.ragHealth > 0.5) {
      return 'degraded';
    } else {
      return 'critical';
    }
  }
}

/**
 * 本地降级缓存
 * 用于紧急回退
 */
class LocalFallbackCache {
  private snapshots: Map<string, HCTXData> = new Map();
  private keywordIndex: Map<string, Set<string>> = new Map();

  async getLastSnapshot(workspaceId: string): Promise<HCTXData | null> {
    return this.snapshots.get(workspaceId) || null;
  }

  saveSnapshot(workspaceId: string, data: HCTXData): void {
    this.snapshots.set(workspaceId, data);
  }

  keywordSearch(keywords: string[], limit: number): RAGResult[] {
    const scores: Map<string, number> = new Map();
    
    for (const keyword of keywords) {
      const docs = this.keywordIndex.get(keyword);
      if (docs) {
        for (const docId of docs) {
          scores.set(docId, (scores.get(docId) || 0) + 1);
        }
      }
    }
    
    // 返回Top-K
    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([docId, score]) => ({
        document: { id: docId, content: '', metadata: { source: 'cache', type: 'conversation', timestamp: Date.now() } },
        score: score / keywords.length,
        source: 'keyword' as const,
      }));
  }
}

// ========== 类型定义 ==========

interface FallbackConfig {
  archiveManager: ArchiveManager;
  ragManager: RAGManager;
  cloudSyncAgent: SecondMeSyncAgent;
}

interface FallbackStats {
  archiveLocalSuccess: number;
  archiveCloudFallback: number;
  archiveEmergencyFallback: number;
  ragLocalSuccess: number;
  ragCloudFallback: number;
  ragKeywordFallback: number;
}

interface FallbackHealth {
  archiveHealth: number;
  ragHealth: number;
  fallbackRate: number;
  status: 'healthy' | 'degraded' | 'critical';
}
```

---

## 6. 自测点验证

### 6.1 MEM-007: Archive序列化到.hctx

```typescript
/**
 * MEM-007 验证测试
 * 
 * 验证内容:
 * 1. .hctx文件格式正确性
 * 2. 序列化性能<100ms
 * 3. 数据完整性校验
 * 4. 跨平台兼容性
 */
describe('MEM-007: Archive序列化到.hctx', () => {
  
  test('HCTX文件头格式正确', async () => {
    const manager = new ArchiveManager({});
    const snapshot = await manager.createFullSnapshot('test-workspace');
    
    // 验证魔数
    expect(snapshot.header.magic).toBe(0x48435458); // "HCTX"
    // 验证版本
    expect(snapshot.header.version).toBe(1);
    // 验证时间戳
    expect(snapshot.header.timestamp).toBeLessThanOrEqual(Date.now());
  });

  test('序列化性能<100ms', async () => {
    const manager = new ArchiveManager({});
    const startTime = Date.now();
    
    await manager.createFullSnapshot('test-workspace');
    
    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(100);
  });

  test('数据完整性校验', async () => {
    const manager = new ArchiveManager({});
    const snapshot = await manager.createFullSnapshot('test-workspace');
    
    const validation = await manager.validate(snapshot);
    expect(validation.valid).toBe(true);
    expect(validation.checksumMatch).toBe(true);
  });

  test('解析后数据完整', async () => {
    const manager = new ArchiveManager({});
    const original = await manager.createFullSnapshot('test-workspace');
    
    const parsed = await manager.parseSnapshot(original);
    expect(parsed.workspaceId).toBe(original.metadata.workspaceId);
    expect(parsed.objects.length).toBeGreaterThan(0);
  });
});
```

**验证状态**: □ 待实现

### 6.2 MEM-008: RAG检索延迟<200ms

```typescript
/**
 * MEM-008 验证测试
 * 
 * 验证内容:
 * 1. 向量检索<150ms
 * 2. 混合检索<200ms
 * 3. Top-5准确率>85%
 * 4. 降级策略有效性
 */
describe('MEM-008: RAG检索延迟<200ms', () => {
  
  test('向量检索延迟<150ms', async () => {
    const manager = new RAGManager({});
    const queryVector = Array(384).fill(0).map(() => Math.random());
    
    const startTime = Date.now();
    await manager.vectorSearch(queryVector, 5);
    const elapsed = Date.now() - startTime;
    
    expect(elapsed).toBeLessThan(150);
  });

  test('混合检索延迟<200ms', async () => {
    const manager = new RAGManager({});
    
    // 预热
    await manager.search('预热查询');
    
    const startTime = Date.now();
    await manager.search('测试查询', { limit: 5 });
    const elapsed = Date.now() - startTime;
    
    expect(elapsed).toBeLessThan(200);
  });

  test('Top-5准确率>85%', async () => {
    const manager = new RAGManager({});
    
    // 添加测试文档
    await manager.addDocuments(testDocuments);
    
    // 测试查询
    const results = await manager.search('相关查询', { limit: 5 });
    const accuracy = calculateAccuracy(results, expectedResults);
    
    expect(accuracy).toBeGreaterThan(0.85);
  });

  test('降级策略触发时延迟<300ms', async () => {
    const controller = new P2FallbackController({
      archiveManager: new ArchiveManager({}),
      ragManager: new RAGManager({}),
      cloudSyncAgent: new SecondMeSyncAgent({}),
    });
    
    const startTime = Date.now();
    await controller.searchWithFallback('测试查询');
    const elapsed = Date.now() - startTime;
    
    // 降级模式下放宽到300ms
    expect(elapsed).toBeLessThan(300);
  });
});
```

**验证状态**: □ 待实现

### 6.3 DEBT-LCR-002: P2降级策略标记

```typescript
/**
 * DEBT-LCR-002 验证测试
 * 
 * 验证内容:
 * 1. P2债务标记正确
 * 2. 降级策略自动触发
 * 3. 降级统计准确
 * 4. 健康状态报告
 */
describe('DEBT-LCR-002: P2降级策略', () => {
  
  test('Archive本地失败时触发云端降级', async () => {
    const controller = new P2FallbackController(config);
    
    // 模拟本地失败
    jest.spyOn(controller['archiveManager'], 'createFullSnapshot')
      .mockRejectedValue(new Error('Disk full'));
    
    const result = await controller.archiveWithFallback('test-workspace');
    
    expect(result).toBeDefined();
    expect(controller.getStats().archiveCloudFallback).toBeGreaterThan(0);
  });

  test('RAG检索降级到关键词检索', async () => {
    const controller = new P2FallbackController(config);
    
    // 模拟向量生成失败
    jest.spyOn(controller['ragManager'], 'search')
      .mockRejectedValue(new Error('Embedding failed'));
    
    const results = await controller.searchWithFallback('测试查询');
    
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    expect(controller.getStats().ragKeywordFallback).toBeGreaterThan(0);
  });

  test('健康状态报告准确', async () => {
    const controller = new P2FallbackController(config);
    
    // 执行一些操作
    await controller.archiveWithFallback('ws1');
    await controller.searchWithFallback('query1');
    
    const health = controller.getHealth();
    
    expect(health.status).toMatch(/healthy|degraded|critical/);
    expect(health.archiveHealth).toBeGreaterThanOrEqual(0);
    expect(health.archiveHealth).toBeLessThanOrEqual(1);
  });

  test('P2债务标记存在', () => {
    const manager = new ArchiveManager({});
    
    // 验证债务标记
    expect(manager['cloudFallbackEnabled']).toBe(true);
    expect(manager.constructor.toString()).toContain('LCR-B03-003');
  });
});
```

**验证状态**: □ 待实现

---

## 7. 集成示例

### 7.1 基础使用

```typescript
import { ArchiveManager } from './archive-manager';
import { RAGManager } from './rag-manager';
import { P2FallbackController } from './fallback-controller';

// 初始化
const archiveManager = new ArchiveManager({
  storage: new LocalDiskBackend('./workspace'),
  syncConfig: {
    apiKey: process.env.SECONDME_API_KEY, // P2债务: 可选
    apiEndpoint: 'https://api.secondme.io/v1',
    wsEndpoint: 'wss://ws.secondme.io/v1',
  },
});

const ragManager = new RAGManager({
  embeddingProvider: new LocalEmbeddingProvider(),
  cloudEmbeddingConfig: {
    apiKey: process.env.SECONDME_API_KEY, // P2债务: 降级用
  },
  cacheSize: 1000,
});

// P2降级控制器
const fallbackController = new P2FallbackController({
  archiveManager,
  ragManager,
  cloudSyncAgent: archiveManager['syncAgent'],
});

// 创建Archive（自动P2降级）
const hctxData = await fallbackController.archiveWithFallback('my-workspace');
await fs.writeFile('backup.hctx', hctxData.buffer);

// RAG检索（自动P2降级）
const results = await fallbackController.searchWithFallback('相关问题', {
  limit: 5,
  threshold: 0.7,
});

// 显示结果
for (const result of results) {
  console.log(`Score: ${result.score.toFixed(2)}, Source: ${result.source}`);
  console.log(`Content: ${result.document.content.substring(0, 100)}...`);
}
```

### 7.2 配置示例

```typescript
// config/lcr-archive-rag.ts
export const lcrArchiveRAGConfig = {
  archive: {
    compression: 'zstd' as const,
    compressionLevel: 3,
    includeGitHistory: true,
    encryption: {
      enabled: false,
    },
  },
  
  rag: {
    embedding: {
      dimensions: 384,
      batchSize: 32,
    },
    retrieval: {
      defaultLimit: 5,
      defaultThreshold: 0.5,
      maxLatency: 200, // ms
    },
    cache: {
      size: 1000,
      ttl: 300000, // 5分钟
    },
  },
  
  // P2债务配置
  secondme: {
    enabled: true, // 启用云端降级
    apiKey: process.env.SECONDME_API_KEY,
    endpoint: process.env.SECONDME_ENDPOINT || 'https://api.secondme.io/v1',
    fallbackOnLocalFailure: true,
    syncInterval: 60000, // 1分钟
  },
};
```

---

## 8. 风险与缓解

| 风险ID | 风险描述 | 影响 | 缓解措施 |
|--------|----------|------|----------|
| B06-R01 | .hctx格式向后兼容性 | 高 | 版本号+迁移工具 |
| B06-R02 | P2降级导致云端费用激增 | 中 | 降级次数限制+告警 |
| B06-R03 | 向量检索索引过大 | 中 | 分层索引+增量更新 |
| B06-R04 | SecondMe API变更 | 中 | 接口抽象层+适配器 |
| B06-R05 | 跨平台字节序问题 | 低 | 大端序强制+测试 |

---

## 9. 工时估算

| 任务 | 工时 | 优先级 | 债务关联 |
|------|------|--------|----------|
| ArchiveManager实现 | 8h | P0 | 基础功能 |
| RAGManager实现 | 8h | P0 | 基础功能 |
| SecondMeSyncAgent骨架 | 4h | P0 | P2债务接口 |
| P2FallbackController | 4h | P0 | 降级策略 |
| 单元测试（3个自测点） | 4h | P0 | MEM-007/008 |
| SecondMe真实API集成 | 8h | P2 | LCR-B03-003 |
| 性能优化 | 4h | P1 | <200ms保障 |
| **总计** | **40h ≈ 5天** | - | - |

---

## 10. 债务清偿计划

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DEBT-LCR-B03-003 清偿计划                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  债务ID: LCR-B03-003                                                         │
│  描述: SecondMe集成降级策略 - 真实API调用                                     │
│  优先级: P2                                                                  │
│  预计清偿: v1.4.0                                                           │
│                                                                             │
│  清偿任务:                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ □ 1. 获取SecondMe API密钥和文档                                     │   │
│  │ □ 2. 实现SecondMeCloudBackend.save()真实调用                        │   │
│  │ □ 3. 实现SecondMeCloudBackend.load()真实调用                        │   │
│  │ □ 4. 实现SecondMeEmbeddingProvider.embed()真实调用                  │   │
│  │ □ 5. 实现SecondMeSyncAgent WebSocket连接                            │   │
│  │ □ 6. 集成测试（本地+云端混合场景）                                    │   │
│  │ □ 7. 性能基准测试（延迟、吞吐量）                                     │   │
│  │ □ 8. 文档更新和债务标记移除                                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  验收标准:                                                                   │
│  • Archive云端备份成功率 > 99%                                              │
│  • RAG云端Embedding延迟 < 100ms                                             │
│  • 降级策略触发次数 < 1%（正常情况下）                                       │
│  • 单元测试覆盖率 > 80%                                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. 结论

本设计文档定义了Archive与RAG外挂接口，包含以下核心组件：

1. **Archive管理器**: 实现Workspace到.hctx格式的序列化/反序列化
   - 64字节文件头 + MessagePack元数据 + B+树索引 + 数据区 + SHA256校验
   - 性能目标: 序列化<100ms (MEM-007)

2. **RAG管理器**: 实现混合检索（向量+图谱+关键词）
   - 性能目标: 检索<200ms (MEM-008)
   - 融合权重: 向量35% + 图谱15% + 关键词50%

3. **SecondMe同步协议**: 本地与云端的双向同步
   - WebSocket长连接 + HTTPS REST API
   - 支持Snapshot同步、RAG索引同步

4. **P2降级策略**: 本地失败时自动回退云端
   - 三级降级: 本地 → 云端 → 缓存/关键词
   - 自动触发、统计监控、健康报告

**P2债务声明 (LCR-B03-003)**: 
- SecondMe真实API调用待外部服务凭证
- 当前实现包含完整的降级策略骨架
- 预计v1.4.0清偿

**可行性结论**: ✅ **接口设计完成**，可进入实现阶段。

---

*文档版本: 1.0.0*  
*创建日期: 2026-02-17*  
*作者: Soyorin (PM)*
