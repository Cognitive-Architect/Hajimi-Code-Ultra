# R-02/09: Better-SQLite3 + OPFS 混合存储方案研究

> 研究工单 | 存储架构师 | 2026-02-14
> 基于 HAJIMI-PERF-DESKTOP-RESEARCH-011 项目桌面级 IDE 存储架构方案

---

## 目录

1. [执行摘要](#1-执行摘要)
2. [存储架构决策记录](#2-存储架构决策记录)
3. [数据库 Schema 设计](#3-数据库-schema-设计)
4. [WAL 配置与最佳实践](#4-wal-配置与最佳实践)
5. [TSA 集成适配层设计](#5-tsa-集成适配层设计)
6. [Windows 特殊考量](#6-windows-特殊考量)
7. [事务管理最佳实践](#7-事务管理最佳实践)
8. [实现路线图](#8-实现路线图)
9. [参考资料](#9-参考资料)

---

## 1. 执行摘要

### 1.1 研究背景

基于现有 TSA (Thermal Storage Architecture) v1.0.0 三层存储架构：
- **HOT**: Redis - 高频访问
- **WARM**: IndexedDB - 中频访问  
- **COLD**: 文件系统 - 低频/归档

### 1.2 核心结论

**推荐方案**: Better-SQLite3 (Node 原生) + OPFS (浏览器) 混合架构

| 场景 | 推荐方案 | 理由 |
|------|---------|------|
| Desktop IDE (Electron/Tauri) | Better-SQLite3 | 原生性能、WAL 支持、大文件优化 |
| Web IDE (Browser) | sql.js + OPFS | WASM 兼容性、沙箱安全 |
| 混合应用 | 自适应切换 | 根据环境自动选择 |

### 1.3 架构演进路线

```
当前 TSA v1.0.0
├── HOT: Redis → 保留（跨会话共享）
├── WARM: IndexedDB → 保留（浏览器兼容）
└── COLD: 文件系统 → 替换为 SQLite（结构化查询）

目标 TSA v2.0.0
├── HOT: Redis/Memory
├── WARM: IndexedDB
├── COLD: SQLite (Better-SQLite3/sql.js)
└── ARCHIVE: OPFS/文件系统
```

---

## 2. 存储架构决策记录

### 2.1 Better-SQLite3 vs sql.js 对比分析

#### 2.1.1 性能对比（>100MB 数据库场景）

| 指标 | Better-SQLite3 | sql.js (WASM) | 胜出 |
|------|---------------|---------------|------|
| **启动时间** | ~10ms（原生加载） | ~200ms（WASM 初始化） | ✅ Better |
| **写入吞吐量** | 80,000+ inserts/sec | 15,000 inserts/sec | ✅ Better |
| **读取吞吐量** | 500,000+ queries/sec | 80,000 queries/sec | ✅ Better |
| **大文件 (>100MB)** | 内存映射，高效 | 需完整加载到内存 | ✅ Better |
| **WAL 模式** | 完整支持 | 有限支持 | ✅ Better |
| **二进制数据** | Buffer 原生支持 | Uint8Array 转换 | ✅ Better |
| **线程安全** | 完整支持 | 单线程限制 | ✅ Better |
| **包体积** | ~5MB (平台二进制) | ~1MB (WASM) | ✅ sql.js |
| **浏览器支持** | ❌ 不支持 | ✅ 支持 | ✅ sql.js |
| **跨平台** | 需平台特定编译 | 一次编译到处运行 | ✅ sql.js |
| **内存占用** | 按需加载 | 完整数据库在内存 | ✅ Better |

#### 2.1.2 功能对比

| 功能 | Better-SQLite3 | sql.js |
|------|---------------|--------|
| 同步 API | ✅ 完整支持 | ✅ 支持 |
| 异步 API | ✅ 支持 | ✅ 支持 |
| 用户自定义函数 | ✅ 支持 | ⚠️ 有限 |
| 虚拟表 | ✅ 支持 | ❌ 不支持 |
| 备份 API | ✅ 支持 | ❌ 不支持 |
| 在线备份 | ✅ 支持 | ❌ 不支持 |
| 负载扩展 | ✅ 支持 | ❌ 不支持 |
| 加密支持 | ✅ 支持 (SEE) | ❌ 不支持 |

#### 2.1.3 Windows 环境特殊考量

| 考量项 | Better-SQLite3 | sql.js |
|--------|---------------|--------|
| 路径长度限制 (MAX_PATH) | ✅ 自动处理 | N/A |
| UNC 路径支持 | ✅ 支持 | N/A |
| 中文路径 | ✅ 支持 | ✅ 支持 |
| 文件锁（多实例） | ✅ Windows 文件锁 | N/A |
| 符号链接 | ✅ 支持 | N/A |
| UAC 权限 | 需处理 | 无此问题 |

### 2.2 推荐方案决策

#### 决策 1: Desktop 环境使用 Better-SQLite3

**状态**: ✅ 采纳

**理由**:
1. **性能优势**: >5x 写入性能，>6x 读取性能
2. **内存效率**: 大文件无需完全加载到内存
3. **WAL 完整支持**: 高并发读写场景必需
4. **Node 原生集成**: 与 Electron/Tauri 完美配合

**风险与缓解**:
| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 平台特定二进制 | 中 | 使用 prebuilt-binaries，CI 自动构建 |
| 包体积增加 | 低 | 可选依赖，按需加载 |
| 构建复杂度 | 中 | Docker 构建环境标准化 |

#### 决策 2: Web 环境使用 sql.js + OPFS

**状态**: ✅ 采纳

**理由**:
1. **浏览器兼容性**: 纯 WASM，无原生依赖
2. **沙箱安全**: 符合浏览器安全模型
3. **OPFS 持久化**: Origin Private File System 提供可靠存储

#### 决策 3: 自适应存储层

**状态**: ✅ 采纳

**实现策略**:
```typescript
// lib/storage/adaptive/sqlite-factory.ts
export class SQLiteStorageFactory {
  static async create(config: SQLiteConfig): Promise<ISQLiteStorage> {
    if (isNode()) {
      // Desktop: Better-SQLite3
      const { BetterSQLiteStorage } = await import('./better-sqlite-storage');
      return new BetterSQLiteStorage(config);
    } else if (isBrowser() && 'storage' in navigator) {
      // Web: sql.js + OPFS
      const { SqljsOPFSStorage } = await import('./sqljs-opfs-storage');
      return new SqljsOPFSStorage(config);
    }
    throw new Error('Unsupported environment for SQLite storage');
  }
}
```

---

## 3. 数据库 Schema 设计

### 3.1 双层架构设计

```
双层存储架构:
├── 全局元数据库 (global-meta.db)
│   ├── projects: 项目列表与元数据
│   ├── settings: 全局设置
│   └── preferences: 用户偏好
│
└── 项目数据库 (Project-{id}.db)
    ├── files: 文件索引与元数据
    ├── operations: 操作日志（Undo/Redo 基础）
    ├── undo_stack: 撤销栈
    ├── snapshots: 项目快照
    └── search_index: 全文搜索索引
```

### 3.2 全局元数据库 Schema

```sql
-- ========================================
-- 全局元数据库: global-meta.db
-- 位置: %APPDATA%/Hajimi/global-meta.db (Windows)
--       ~/.config/Hajimi/global-meta.db (Linux/macOS)
-- ========================================

-- 项目列表
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,           -- 项目根目录绝对路径
    db_path TEXT NOT NULL,                -- 项目数据库路径
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    last_opened_at INTEGER,
    last_modified_at INTEGER,
    size_bytes INTEGER DEFAULT 0,         -- 项目总大小
    file_count INTEGER DEFAULT 0,         -- 文件数量
    is_favorite BOOLEAN DEFAULT 0,
    is_archived BOOLEAN DEFAULT 0,        -- 归档标记
    tags TEXT,                            -- JSON 数组
    metadata TEXT,                        -- JSON 扩展字段
    
    -- 索引
    CONSTRAINT valid_path CHECK (length(path) > 0)
);

CREATE INDEX IF NOT EXISTS idx_projects_last_opened 
    ON projects(last_opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_favorite 
    ON projects(is_favorite) WHERE is_favorite = 1;
CREATE INDEX IF NOT EXISTS idx_projects_archived 
    ON projects(is_archived) WHERE is_archived = 0;

-- 项目标签（规范化）
CREATE TABLE IF NOT EXISTS project_tags (
    project_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (project_id, tag),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tags_tag ON project_tags(tag);

-- 全局设置（键值对）
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'string',  -- string | number | boolean | json
    description TEXT,
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- 用户偏好（按项目或全局）
CREATE TABLE IF NOT EXISTS preferences (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL DEFAULT 'global', -- global | project
    scope_id TEXT,                        -- project_id 当 scope='project'
    category TEXT NOT NULL,               -- editor | ui | git | etc.
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    
    UNIQUE(scope, scope_id, category, key)
);

CREATE INDEX IF NOT EXISTS idx_preferences_scope 
    ON preferences(scope, scope_id);

-- 最近访问记录
CREATE TABLE IF NOT EXISTS recent_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    accessed_at INTEGER DEFAULT (strftime('%s', 'now')),
    access_type TEXT,                     -- open | save | sync
    
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recent_access_time 
    ON recent_access(accessed_at DESC);

-- 数据库版本管理
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER DEFAULT (strftime('%s', 'now')),
    description TEXT
);

INSERT OR IGNORE INTO schema_version (version, description) 
VALUES (1, 'Initial schema');
```

### 3.3 项目数据库 Schema

```sql
-- ========================================
-- 项目数据库: Project-{id}.db
-- 位置: {projectPath}/.hajimi/project.db
-- ========================================

-- 文件索引表
CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,                  -- 内容寻址哈希 (SHA-256)
    relative_path TEXT NOT NULL UNIQUE,   -- 相对项目根目录的路径
    name TEXT NOT NULL,
    extension TEXT,
    parent_dir TEXT NOT NULL,             -- 父目录路径
    
    -- 文件元数据
    size_bytes INTEGER NOT NULL,
    created_at INTEGER,                   -- 文件系统创建时间
    modified_at INTEGER NOT NULL,         -- 文件系统修改时间
    indexed_at INTEGER DEFAULT (strftime('%s', 'now')),
    
    -- 内容哈希（用于去重和变更检测）
    content_hash TEXT NOT NULL,
    
    -- 文件类型
    mime_type TEXT,
    is_binary BOOLEAN DEFAULT 0,
    is_ignored BOOLEAN DEFAULT 0,         -- .gitignore 等
    
    -- 编辑器状态
    last_opened_at INTEGER,
    last_cursor_position INTEGER,
    is_open BOOLEAN DEFAULT 0,
    
    -- 扩展元数据
    metadata TEXT,                        -- JSON: encoding, line_endings, etc.
    
    -- 索引
    CONSTRAINT valid_path CHECK (length(relative_path) > 0)
);

CREATE INDEX IF NOT EXISTS idx_files_parent_dir 
    ON files(parent_dir);
CREATE INDEX IF NOT EXISTS idx_files_extension 
    ON files(extension) WHERE extension IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_files_modified 
    ON files(modified_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_content_hash 
    ON files(content_hash);               -- 用于去重检测
CREATE INDEX IF NOT EXISTS idx_files_open 
    ON files(is_open) WHERE is_open = 1;
CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
    name, 
    content='files',
    content_rowid='rowid'
);

-- 操作日志表（CRDT / Undo-Redo 基础）
CREATE TABLE IF NOT EXISTS operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- 操作类型
    type TEXT NOT NULL,                   -- insert | delete | replace | move | rename
    
    -- 目标文件
    file_id TEXT,
    file_path TEXT,                       -- 操作时的文件路径（历史一致性）
    
    -- 操作内容
    payload JSON NOT NULL,                -- 操作详情
    
    -- 时间戳
    timestamp INTEGER DEFAULT (strftime('%s', 'now')),
    
    -- 序列号（用于排序和冲突解决）
    sequence_number INTEGER NOT NULL,
    
    -- 会话信息
    session_id TEXT,                      -- 生成此操作的会话
    client_id TEXT,                       -- 客户端标识
    
    -- 校验和（数据完整性）
    checksum TEXT,                        -- SHA-256(payload)
    
    -- 索引
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ops_file 
    ON operations(file_id);
CREATE INDEX IF NOT EXISTS idx_ops_time 
    ON operations(timestamp);
CREATE INDEX IF NOT EXISTS idx_ops_sequence 
    ON operations(sequence_number);
CREATE INDEX IF NOT EXISTS idx_ops_session 
    ON operations(session_id);

-- 撤销栈（用户可见的 Undo/Redo）
CREATE TABLE IF NOT EXISTS undo_stack (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- 关联操作
    operation_id INTEGER NOT NULL,
    
    -- 栈位置
    stack_position INTEGER NOT NULL,      -- 栈中的位置，用于导航
    
    -- 操作分组
    group_id TEXT,                        -- 分组 ID（一次用户操作可能包含多个操作）
    
    -- 状态
    is_applied BOOLEAN DEFAULT 1,         -- 当前是否已应用
    
    -- 时间戳
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    
    -- 索引
    FOREIGN KEY (operation_id) REFERENCES operations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_undo_stack_position 
    ON undo_stack(stack_position DESC);
CREATE INDEX IF NOT EXISTS idx_undo_stack_group 
    ON undo_stack(group_id);

-- 项目快照（版本控制）
CREATE TABLE IF NOT EXISTS snapshots (
    id TEXT PRIMARY KEY,                  -- 快照哈希
    parent_id TEXT,                       -- 父快照（形成链）
    
    -- 快照信息
    message TEXT,                         -- 快照描述
    author TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    
    -- 内容树
    tree_hash TEXT NOT NULL,              -- Merkle tree root hash
    
    -- 统计
    file_count INTEGER,
    total_size INTEGER,
    
    -- 标记
    is_auto_save BOOLEAN DEFAULT 0,       -- 自动保存标记
    tags TEXT,                            -- JSON 数组
    
    -- 索引
    FOREIGN KEY (parent_id) REFERENCES snapshots(id)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_parent 
    ON snapshots(parent_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_time 
    ON snapshots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_auto 
    ON snapshots(is_auto_save) WHERE is_auto_save = 1;

-- 快照文件映射（多对多）
CREATE TABLE IF NOT EXISTS snapshot_files (
    snapshot_id TEXT NOT NULL,
    file_id TEXT NOT NULL,
    file_path TEXT NOT NULL,              -- 快照时的路径（支持重命名追踪）
    PRIMARY KEY (snapshot_id, file_id),
    FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_snapshot_files_file 
    ON snapshot_files(file_id);

-- 全文搜索索引
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    content,
    file_id,
    line_numbers,                         -- JSON 数组，匹配行号
    tokenize='porter unicode61'
);

-- 搜索索引元数据
CREATE TABLE IF NOT EXISTS search_metadata (
    file_id TEXT PRIMARY KEY,
    indexed_at INTEGER DEFAULT (strftime('%s', 'now')),
    content_hash TEXT,                    -- 索引时的内容哈希
    word_count INTEGER,
    
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

-- 同步状态（用于云同步）
CREATE TABLE IF NOT EXISTS sync_status (
    id TEXT PRIMARY KEY,                  -- file_id 或 snapshot_id
    entity_type TEXT NOT NULL,            -- 'file' | 'snapshot'
    local_modified_at INTEGER,
    remote_modified_at INTEGER,
    sync_state TEXT DEFAULT 'pending',    -- pending | synced | conflict | error
    last_sync_at INTEGER,
    remote_id TEXT,                       -- 云端 ID
    
    UNIQUE(id, entity_type)
);

CREATE INDEX IF NOT EXISTS idx_sync_state 
    ON sync_status(sync_state) WHERE sync_state != 'synced';

-- 数据库版本
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER DEFAULT (strftime('%s', 'now')),
    description TEXT
);

INSERT OR IGNORE INTO schema_version (version, description) 
VALUES (1, 'Initial project schema');
```

### 3.4 Schema 设计决策说明

| 决策 | 说明 |
|------|------|
| **内容寻址** | 文件使用 SHA-256 作为 ID，天然支持去重 |
| **分离元数据** | 全局和项目数据库分离，避免单点故障 |
| **JSON 扩展字段** | 预留 metadata JSON 字段，支持未来扩展 |
| **FTS5 全文搜索** | SQLite 原生 FTS5 模块，无需外部依赖 |
| **软删除** | 使用 is_archived / is_deleted 标记，支持回收站 |
| **操作日志** | 完整的操作历史，支持 Undo/Redo 和协作 |

---

## 4. WAL 配置与最佳实践

### 4.1 WAL 模式概述

WAL (Write-Ahead Logging) 模式是 SQLite 的并发优化模式：
- **读取者**: 不阻塞写入者
- **写入者**: 不阻塞读取者
- **并发**: 支持单个写入者和多个读取者同时操作

### 4.2 推荐配置代码

```typescript
// lib/desktop/sqlite-manager.ts
import Database from 'better-sqlite3';
import { EventEmitter } from 'events';

export interface SQLiteManagerConfig {
  dbPath: string;
  enableWAL?: boolean;
  walAutocheckpoint?: number;     // WAL 页面数触发 checkpoint (默认 1000)
  synchronous?: 'OFF' | 'NORMAL' | 'FULL' | 'EXTRA';
  cacheSize?: number;             // 页数 (默认 -2000 = 2MB)
  mmapSize?: number;              // 内存映射大小 (默认 2GB)
  tempStore?: 'DEFAULT' | 'FILE' | 'MEMORY';
  busyTimeout?: number;           // 忙等待超时 (默认 5000ms)
}

export const DEFAULT_SQLITE_CONFIG: SQLiteManagerConfig = {
  dbPath: '',
  enableWAL: true,
  walAutocheckpoint: 1000,
  synchronous: 'NORMAL',
  cacheSize: -64000,              // 64MB cache
  mmapSize: 2 * 1024 * 1024 * 1024,  // 2GB mmap
  tempStore: 'MEMORY',
  busyTimeout: 5000,
};

export class SQLiteManager extends EventEmitter {
  private db: Database | null = null;
  private config: SQLiteManagerConfig;
  private checkpointTimer: NodeJS.Timeout | null = null;
  private isClosed: boolean = false;

  constructor(config: Partial<SQLiteManagerConfig>) {
    super();
    this.config = { ...DEFAULT_SQLITE_CONFIG, ...config };
  }

  /**
   * 初始化数据库连接
   */
  async initialize(): Promise<void> {
    if (this.db) {
      throw new Error('Database already initialized');
    }

    try {
      // 创建数据库连接
      this.db = new Database(this.config.dbPath, {
        verbose: process.env.DEBUG_SQLITE ? console.log : undefined,
        fileMustExist: false,
        timeout: this.config.busyTimeout,
      });

      // 应用 WAL 配置
      await this.configureWAL();

      // 应用性能优化
      await this.configurePerformance();

      // 初始化 Schema
      await this.initSchema();

      // 设置自动 checkpoint（如果启用 WAL）
      if (this.config.enableWAL) {
        this.setupAutocheckpoint();
      }

      // 监听数据库错误
      this.db.on('error', (err) => {
        this.emit('error', err);
      });

      this.emit('initialized');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * 配置 WAL 模式
   */
  private configureWAL(): void {
    if (!this.db) return;

    if (this.config.enableWAL) {
      // 启用 WAL 模式
      this.db.pragma('journal_mode = WAL');
      
      // 设置同步模式
      this.db.pragma(`synchronous = ${this.config.synchronous}`);
      
      // 设置 WAL 自动 checkpoint 阈值
      this.db.pragma(`wal_autocheckpoint = ${this.config.walAutocheckpoint}`);
      
      // 设置 WAL 文件大小限制（可选）
      // this.db.pragma('journal_size_limit = 104857600'); // 100MB
      
      this.emit('wal-enabled');
    } else {
      // 回退到 DELETE 模式
      this.db.pragma('journal_mode = DELETE');
      this.db.pragma('synchronous = FULL');
    }
  }

  /**
   * 配置性能参数
   */
  private configurePerformance(): void {
    if (!this.db) return;

    // 缓存大小
    this.db.pragma(`cache_size = ${this.config.cacheSize}`);
    
    // 内存映射大小
    this.db.pragma(`mmap_size = ${this.config.mmapSize}`);
    
    // 临时存储
    this.db.pragma(`temp_store = ${this.config.tempStore}`);
    
    // 外键约束
    this.db.pragma('foreign_keys = ON');
    
    // 查询优化
    this.db.pragma('query_only = OFF');
    this.db.pragma('case_sensitive_like = OFF');
    
    // 自动 vacuum（空闲时整理空间）
    this.db.pragma('auto_vacuum = INCREMENTAL');
  }

  /**
   * 设置自动 checkpoint 定时器
   */
  private setupAutocheckpoint(): void {
    // 每 30 秒执行一次 PASSIVE checkpoint
    this.checkpointTimer = setInterval(() => {
      this.checkpoint('PASSIVE').catch((err) => {
        // PASSIVE 失败通常是因为有读取事务，忽略错误
        if (process.env.DEBUG_SQLITE) {
          console.debug('[SQLite] Passive checkpoint skipped:', err.message);
        }
      });
    }, 30000);
  }

  /**
   * 执行 checkpoint
   * 
   * PASSIVE:  不阻塞，如果无法获取锁则立即返回
   * RESTART:  阻塞直到没有读取者，然后 checkpoint，允许新的 WAL 写入
   * TRUNCATE: 阻塞直到没有读取者，checkpoint 后删除 WAL 文件
   */
  async checkpoint(mode: 'PASSIVE' | 'FULL' | 'RESTART' | 'TRUNCATE' = 'PASSIVE'): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // better-sqlite3 使用 wal_checkpoint pragma
      const result = this.db.pragma(`wal_checkpoint(${mode})`, { simple: true });
      
      // result 格式: [busy, log, checkpointed]
      this.emit('checkpoint', { mode, result });
    } catch (error) {
      this.emit('checkpoint-error', { mode, error });
      throw error;
    }
  }

  /**
   * 获取 WAL 状态
   */
  getWALStatus(): { 
    journalMode: string; 
    walSize: number; 
    pagesInWAL: number;
  } {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const journalMode = this.db.pragma('journal_mode', { simple: true }) as string;
    
    // 从 journal_size_limit 获取 WAL 大小信息
    // 注意：实际 WAL 文件大小需要通过文件系统获取
    
    return {
      journalMode,
      walSize: 0, // 需要通过 fs.stat 获取
      pagesInWAL: 0, // 需要通过分析获取
    };
  }

  /**
   * 执行事务
   */
  transaction<T>(fn: (db: Database) => T): T {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return this.db.transaction(fn)();
  }

  /**
   * 获取原始数据库实例（高级操作）
   */
  getDatabase(): Database {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  /**
   * 关闭数据库
   */
  async close(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;

    // 清理定时器
    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer);
      this.checkpointTimer = null;
    }

    if (this.db) {
      // 关闭前执行 FINAL checkpoint
      try {
        this.db.pragma('wal_checkpoint(TRUNCATE)');
      } catch (error) {
        // 忽略 checkpoint 错误，继续关闭
      }

      this.db.close();
      this.db = null;
    }

    this.emit('closed');
  }
}
```

### 4.3 Checkpoint 策略对比

| 模式 | 行为 | 阻塞 | 使用场景 |
|------|------|------|----------|
| **PASSIVE** | 尝试 checkpoint，如果被读取者阻塞则立即返回 | 否 | 定期后台维护 |
| **FULL** | 等待所有读取者完成，然后 checkpoint | 是（读取者） | 手动触发 |
| **RESTART** | 类似 FULL，但允许 WAL 日志继续增长 | 是（读取者） | 长事务场景 |
| **TRUNCATE** | FULL + 删除 WAL 文件 | 是（读取者） | 应用关闭前 |

### 4.4 推荐 Checkpoint 策略

```typescript
// lib/desktop/wal-manager.ts
export class WALManager {
  private db: Database;
  private config: WALManagerConfig;

  /**
   * 应用启动时：检查 WAL 完整性
   */
  async startupRecovery(): Promise<void> {
    // 1. 检查 WAL 文件是否存在
    const walExists = await this.checkWALFileExists();
    
    if (walExists) {
      // 2. 尝试恢复未提交的 WAL 记录
      try {
        // 自动恢复由 SQLite 在打开时完成
        // 这里可以添加额外的完整性检查
        await this.verifyDatabaseIntegrity();
      } catch (error) {
        // 如果恢复失败，尝试备份并重建
        await this.handleCorruptedWAL();
      }
    }
  }

  /**
   * 定时维护：PASSIVE checkpoint
   */
  async scheduledMaintenance(): Promise<void> {
    // 每 30 秒执行 PASSIVE checkpoint
    try {
      await this.checkpoint('PASSIVE');
    } catch (error) {
      // PASSIVE 失败是正常的，如果 WAL 被读取者锁定
      console.debug('[WAL] Passive checkpoint skipped');
    }
  }

  /**
   * 应用关闭前：TRUNCATE checkpoint
   */
  async gracefulShutdown(): Promise<void> {
    // 尝试执行 TRUNCATE checkpoint
    // 设置较短的超时，避免无限等待
    const timeoutMs = 5000;
    
    try {
      await Promise.race([
        this.checkpoint('TRUNCATE'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Checkpoint timeout')), timeoutMs)
        ),
      ]);
    } catch (error) {
      // 如果超时，尝试 RESTART
      console.warn('[WAL] Truncate checkpoint timeout, trying RESTART');
      await this.checkpoint('RESTART');
    }
  }

  /**
   * 手动优化：整理数据库空间
   */
  async optimize(): Promise<void> {
    // 1. 执行 FULL checkpoint
    await this.checkpoint('FULL');
    
    // 2. 运行 VACUUM 整理空间
    this.db.exec('VACUUM');
    
    // 3. 更新统计信息
    this.db.exec('ANALYZE');
  }
}
```

### 4.5 崩溃恢复机制

```typescript
// lib/desktop/recovery-manager.ts
export class RecoveryManager {
  /**
   * 数据库完整性检查
   */
  async checkIntegrity(): Promise<{
    isValid: boolean;
    errors: string[];
  }> {
    const db = this.getDatabase();
    
    // PRAGMA integrity_check
    const result = db.pragma('integrity_check', { simple: true });
    
    if (result === 'ok') {
      return { isValid: true, errors: [] };
    }
    
    // 返回详细错误信息
    return { 
      isValid: false, 
      errors: Array.isArray(result) ? result : [result] 
    };
  }

  /**
   * 处理损坏的数据库
   */
  async handleCorruption(dbPath: string): Promise<{
    recovered: boolean;
    backupPath?: string;
    error?: Error;
  }> {
    const timestamp = Date.now();
    const backupPath = `${dbPath}.corrupted.${timestamp}`;
    
    try {
      // 1. 备份损坏的数据库
      await fs.copyFile(dbPath, backupPath);
      
      // 2. 尝试使用 .recover 命令恢复
      // 需要 sqlite3 CLI 工具
      const recoveredPath = `${dbPath}.recovered.${timestamp}`;
      
      await execAsync(`sqlite3 "${dbPath}" ".recover" > "${recoveredPath}"`);
      
      // 3. 验证恢复的数据库
      const testDb = new Database(recoveredPath, { readonly: true });
      const integrityResult = testDb.pragma('integrity_check', { simple: true });
      testDb.close();
      
      if (integrityResult === 'ok') {
        // 4. 替换原数据库
        await fs.rename(recoveredPath, dbPath);
        
        return {
          recovered: true,
          backupPath,
        };
      }
      
      // 恢复失败
      await fs.unlink(recoveredPath);
      
      return {
        recovered: false,
        backupPath,
        error: new Error('Recovery verification failed'),
      };
    } catch (error) {
      return {
        recovered: false,
        backupPath,
        error: error as Error,
      };
    }
  }
}
```

---

## 5. TSA 集成适配层设计

### 5.1 架构设计

```
TSA v2.0 分层架构:
┌─────────────────────────────────────────────────────────────┐
│                     TSA Orchestrator                        │
│              (统一接口，自动分层决策)                         │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐    ┌─────────────────┐    ┌───────────────┐
│   HOT Tier   │    │    WARM Tier    │    │   COLD Tier   │
│  (Redis/     │    │   (IndexedDB)   │    │  (SQLite)     │
│   Memory)    │    │                 │    │               │
└──────────────┘    └─────────────────┘    └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
                    ┌─────────────────┐
                    │  ARCHIVE Tier   │
                    │  (OPFS/文件)    │
                    └─────────────────┘
```

### 5.2 SQLite Cold Storage 适配器实现

```typescript
// lib/storage/adapters/sqlite-cold-adapter.ts
import {
  StorageTier,
  StorageItem,
  StorageQuery,
  StorageResult,
  StorageStats,
  StorageEventType,
  StorageEvent,
  SetOptions,
  DataPriority,
  StorageErrorCode,
  IStorageAdapter,
} from '../types';
import {
  BaseStorageAdapter,
  ResultBuilder,
  StorageException,
  DataSerializer,
} from '../dal';
import { SQLiteManager } from '../../desktop/sqlite-manager';
import type { Database } from 'better-sqlite3';

export interface SQLiteColdStorageConfig {
  dbPath: string;
  maxCacheSize?: number;        // 内存缓存条目数
  compressionEnabled?: boolean;
  encryptionKey?: string;
}

/**
 * SQLite Cold Storage 适配器
 * 实现 IStorageAdapter 接口，将 SQLite 作为 TSA 的 COLD 层
 */
export class SQLiteColdStorageAdapter extends BaseStorageAdapter implements IStorageAdapter {
  readonly tier = StorageTier.COLD;
  
  private manager: SQLiteManager;
  private config: SQLiteColdStorageConfig;
  private memoryCache: Map<string, StorageItem<unknown>> = new Map();
  private _isConnected: boolean = false;

  constructor(config: SQLiteColdStorageConfig) {
    super();
    this.config = {
      maxCacheSize: 1000,
      compressionEnabled: false,
      ...config,
    };
    this.manager = new SQLiteManager({
      dbPath: config.dbPath,
      enableWAL: true,
      synchronous: 'NORMAL',
    });
  }

  // ==================== 属性访问器 ====================

  get isAvailable(): boolean {
    return typeof process !== 'undefined' && process.versions?.node !== undefined;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  // ==================== 生命周期 ====================

  async initialize(): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      await this.manager.initialize();
      
      // 初始化冷存储专用表
      this.initColdStorageTables();
      
      // 加载热数据到内存缓存
      await this.warmCache();
      
      this._isConnected = true;
      this.initialized = true;

      this.emitEvent({
        type: 'item:created',
        timestamp: Date.now(),
        key: 'system:initialized',
        tier: this.tier,
      });

      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.CONNECTION_FAILED,
        `Failed to initialize SQLite cold storage: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async close(): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      // 清空内存缓存
      this.memoryCache.clear();
      
      // 关闭数据库连接
      await this.manager.close();
      
      this._isConnected = false;
      this.initialized = false;

      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Failed to close SQLite cold storage: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async healthCheck(): Promise<StorageResult<StorageStats>> {
    const start = performance.now();

    try {
      const db = this.manager.getDatabase();
      
      // 获取表统计
      const countResult = db.prepare('SELECT COUNT(*) as count FROM cold_storage').get() as { count: number };
      
      // 获取数据库文件大小
      const fs = await import('fs/promises');
      const stats = await fs.stat(this.config.dbPath);
      
      const storageStats: StorageStats = {
        tier: this.tier,
        itemCount: countResult.count,
        totalSize: stats.size,
      };

      return ResultBuilder.success(storageStats, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.CONNECTION_LOST,
        `Health check failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  // ==================== CRUD 操作 ====================

  async get<T>(key: string): Promise<StorageResult<T>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      // 1. 先查内存缓存
      const cached = this.memoryCache.get(key);
      if (cached && !this.isExpired(cached)) {
        // 更新访问统计
        this.updateAccessStats(key, cached);
        
        return ResultBuilder.success(cached.value as T, this.tier, performance.now() - start);
      }

      // 2. 查询数据库
      const db = this.manager.getDatabase();
      const row = db.prepare(
        'SELECT * FROM cold_storage WHERE key = ?'
      ).get(key) as ColdStorageRow | undefined;

      if (!row) {
        return ResultBuilder.failure(
          StorageErrorCode.NOT_FOUND,
          `Key not found: ${key}`,
          this.tier
        );
      }

      // 3. 检查是否过期
      if (row.expires_at && row.expires_at < Date.now()) {
        // 异步删除过期数据
        this.delete(key).catch(() => {});
        
        return ResultBuilder.failure(
          StorageErrorCode.NOT_FOUND,
          `Key expired: ${key}`,
          this.tier
        );
      }

      // 4. 反序列化值
      const value = this.deserializeValue(row.value, row.value_type);

      // 5. 更新到缓存
      const item: StorageItem<T> = {
        key,
        value: value as T,
        tier: this.tier,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        expiresAt: row.expires_at,
        accessCount: row.access_count + 1,
        lastAccessedAt: Date.now(),
        priority: row.priority,
        size: row.size_bytes,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      };

      this.updateCache(key, item);
      
      // 6. 异步更新数据库访问统计
      this.updateDBAccessStats(key);

      this.emitEvent({
        type: 'item:accessed',
        timestamp: Date.now(),
        key,
        tier: this.tier,
      });

      return ResultBuilder.success(value as T, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Get failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async set<T>(
    key: string,
    value: T,
    options?: SetOptions
  ): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      const now = Date.now();
      const size = DataSerializer.estimateSize(value);
      const serialized = this.serializeValue(value);

      const db = this.manager.getDatabase();

      // 使用事务确保原子性
      const result = this.manager.transaction((database) => {
        const stmt = database.prepare(`
          INSERT INTO cold_storage (
            key, value, value_type, created_at, updated_at, 
            expires_at, access_count, priority, size_bytes, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            value_type = excluded.value_type,
            updated_at = excluded.updated_at,
            expires_at = excluded.expires_at,
            priority = excluded.priority,
            size_bytes = excluded.size_bytes,
            metadata = excluded.metadata
        `);

        stmt.run(
          key,
          serialized.data,
          serialized.type,
          now,
          now,
          options?.ttl ? now + options.ttl : null,
          options?.priority ?? DataPriority.LOW,
          size,
          options?.metadata ? JSON.stringify(options.metadata) : null
        );

        return true;
      });

      if (!result) {
        throw new Error('Transaction failed');
      }

      // 更新缓存
      const item: StorageItem<T> = {
        key,
        value,
        tier: this.tier,
        createdAt: now,
        updatedAt: now,
        expiresAt: options?.ttl ? now + options.ttl : undefined,
        accessCount: 0,
        lastAccessedAt: now,
        priority: options?.priority ?? DataPriority.LOW,
        size,
        metadata: options?.metadata,
      };

      this.updateCache(key, item);

      this.emitEvent({
        type: 'item:created',
        timestamp: now,
        key,
        tier: this.tier,
      });

      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Set failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async delete(key: string): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      const db = this.manager.getDatabase();
      const result = db.prepare('DELETE FROM cold_storage WHERE key = ?').run(key);

      if (result.changes === 0) {
        return ResultBuilder.failure(
          StorageErrorCode.NOT_FOUND,
          `Key not found: ${key}`,
          this.tier
        );
      }

      // 清除缓存
      this.memoryCache.delete(key);

      this.emitEvent({
        type: 'item:deleted',
        timestamp: Date.now(),
        key,
        tier: this.tier,
      });

      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Delete failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async exists(key: string): Promise<StorageResult<boolean>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      // 先查缓存
      if (this.memoryCache.has(key)) {
        const cached = this.memoryCache.get(key);
        if (cached && !this.isExpired(cached)) {
          return ResultBuilder.success(true, this.tier, performance.now() - start);
        }
      }

      const db = this.manager.getDatabase();
      const row = db.prepare(
        'SELECT 1 FROM cold_storage WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)'
      ).get(key, Date.now()) as { '1': number } | undefined;

      return ResultBuilder.success(!!row, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Exists check failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  // ==================== 批量操作 ====================

  async mget<T>(keys: string[]): Promise<StorageResult<Map<string, T>>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      const result = new Map<string, T>();

      // 使用单个查询获取所有键
      const placeholders = keys.map(() => '?').join(',');
      const db = this.manager.getDatabase();
      
      const rows = db.prepare(
        `SELECT * FROM cold_storage WHERE key IN (${placeholders}) AND (expires_at IS NULL OR expires_at > ?)`
      ).all(...keys, Date.now()) as ColdStorageRow[];

      for (const row of rows) {
        const value = this.deserializeValue(row.value, row.value_type);
        result.set(row.key, value as T);
        
        // 异步更新访问统计
        this.updateDBAccessStats(row.key);
      }

      return ResultBuilder.success(result, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Mget failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async mset<T>(
    entries: Array<{ key: string; value: T }>,
    options?: SetOptions
  ): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      const now = Date.now();

      this.manager.transaction((db) => {
        const insert = db.prepare(`
          INSERT INTO cold_storage (
            key, value, value_type, created_at, updated_at,
            expires_at, access_count, priority, size_bytes, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            value_type = excluded.value_type,
            updated_at = excluded.updated_at
        `);

        for (const { key, value } of entries) {
          const serialized = this.serializeValue(value);
          const size = DataSerializer.estimateSize(value);

          insert.run(
            key,
            serialized.data,
            serialized.type,
            now,
            now,
            options?.ttl ? now + options.ttl : null,
            options?.priority ?? DataPriority.LOW,
            size,
            options?.metadata ? JSON.stringify(options.metadata) : null
          );
        }
      });

      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Mset failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async mdelete(keys: string[]): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      const placeholders = keys.map(() => '?').join(',');
      const db = this.manager.getDatabase();
      
      db.prepare(`DELETE FROM cold_storage WHERE key IN (${placeholders})`).run(...keys);

      // 清除缓存
      for (const key of keys) {
        this.memoryCache.delete(key);
      }

      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Mdelete failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  // ==================== 查询操作 ====================

  async keys(pattern?: string): Promise<StorageResult<string[]>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      const db = this.manager.getDatabase();
      let query = 'SELECT key FROM cold_storage WHERE (expires_at IS NULL OR expires_at > ?)';
      const params: (string | number)[] = [Date.now()];

      if (pattern && pattern !== '*') {
        // 将 glob 模式转换为 LIKE 模式
        const likePattern = pattern
          .replace(/\*/g, '%')
          .replace(/\?/g, '_');
        query += ' AND key LIKE ?';
        params.push(likePattern);
      }

      const rows = db.prepare(query).all(...params) as { key: string }[];
      const keys = rows.map(r => r.key);

      return ResultBuilder.success(keys, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Keys query failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async query(query: StorageQuery): Promise<StorageResult<StorageItem[]>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      const conditions: string[] = ['(expires_at IS NULL OR expires_at > ?)'];
      const params: (string | number)[] = [Date.now()];

      if (query.key) {
        conditions.push('key = ?');
        params.push(query.key);
      }

      if (query.keyPattern) {
        conditions.push('key LIKE ?');
        params.push(query.keyPattern.replace(/\*/g, '%'));
      }

      if (query.priority !== undefined) {
        conditions.push('priority = ?');
        params.push(query.priority);
      }

      if (query.createdBefore) {
        conditions.push('created_at < ?');
        params.push(query.createdBefore);
      }

      if (query.createdAfter) {
        conditions.push('created_at > ?');
        params.push(query.createdAfter);
      }

      let sql = `SELECT * FROM cold_storage WHERE ${conditions.join(' AND ')}`;

      if (query.limit) {
        sql += ' LIMIT ?';
        params.push(query.limit);
      }

      if (query.offset) {
        sql += ' OFFSET ?';
        params.push(query.offset);
      }

      const db = this.manager.getDatabase();
      const rows = db.prepare(sql).all(...params) as ColdStorageRow[];

      const items: StorageItem[] = rows.map(row => ({
        key: row.key,
        value: this.deserializeValue(row.value, row.value_type),
        tier: this.tier,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        expiresAt: row.expires_at,
        accessCount: row.access_count,
        lastAccessedAt: row.last_accessed_at,
        priority: row.priority,
        size: row.size_bytes,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      }));

      return ResultBuilder.success(items, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Query failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  // ==================== 统计和清理 ====================

  async stats(): Promise<StorageResult<StorageStats>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      const db = this.manager.getDatabase();
      
      const stats = db.prepare(`
        SELECT 
          COUNT(*) as count,
          COALESCE(SUM(size_bytes), 0) as total_size,
          MIN(created_at) as oldest,
          MAX(created_at) as newest
        FROM cold_storage
        WHERE expires_at IS NULL OR expires_at > ?
      `).get(Date.now()) as {
        count: number;
        total_size: number;
        oldest: number;
        newest: number;
      };

      const storageStats: StorageStats = {
        tier: this.tier,
        itemCount: stats.count,
        totalSize: stats.total_size,
        oldestItem: stats.oldest,
        newestItem: stats.newest,
      };

      return ResultBuilder.success(storageStats, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Stats failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async clear(): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      const db = this.manager.getDatabase();
      db.prepare('DELETE FROM cold_storage').run();

      // 清空缓存
      this.memoryCache.clear();

      // Vacuum 回收空间
      db.exec('VACUUM');

      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Clear failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async cleanup(): Promise<StorageResult<number>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      const db = this.manager.getDatabase();
      const result = db.prepare(
        'DELETE FROM cold_storage WHERE expires_at IS NOT NULL AND expires_at <= ?'
      ).run(Date.now());

      const cleanedCount = result.changes;

      // 从缓存中移除过期项
      for (const [key, item] of this.memoryCache.entries()) {
        if (item.expiresAt && item.expiresAt < Date.now()) {
          this.memoryCache.delete(key);
        }
      }

      return ResultBuilder.success(cleanedCount, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Cleanup failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  // ==================== 私有辅助方法 ====================

  private initColdStorageTables(): void {
    const db = this.manager.getDatabase();
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS cold_storage (
        key TEXT PRIMARY KEY,
        value BLOB NOT NULL,
        value_type TEXT NOT NULL DEFAULT 'json',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER,
        access_count INTEGER DEFAULT 0,
        last_accessed_at INTEGER,
        priority INTEGER DEFAULT 2,
        size_bytes INTEGER NOT NULL,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_cold_expires ON cold_storage(expires_at) 
        WHERE expires_at IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_cold_accessed ON cold_storage(last_accessed_at);
    `);
  }

  private warmCache(): void {
    // 加载最近访问的数据到缓存
    const db = this.manager.getDatabase();
    const rows = db.prepare(`
      SELECT * FROM cold_storage 
      WHERE (expires_at IS NULL OR expires_at > ?)
      ORDER BY last_accessed_at DESC NULLS LAST
      LIMIT ?
    `).all(Date.now(), this.config.maxCacheSize) as ColdStorageRow[];

    for (const row of rows) {
      const item: StorageItem<unknown> = {
        key: row.key,
        value: this.deserializeValue(row.value, row.value_type),
        tier: this.tier,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        expiresAt: row.expires_at,
        accessCount: row.access_count,
        lastAccessedAt: row.last_accessed_at,
        priority: row.priority,
        size: row.size_bytes,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      };

      this.memoryCache.set(row.key, item);
    }
  }

  private serializeValue(value: unknown): { data: Buffer; type: string } {
    const json = JSON.stringify(value);
    return {
      data: Buffer.from(json, 'utf-8'),
      type: 'json',
    };
  }

  private deserializeValue(data: Buffer, type: string): unknown {
    if (type === 'json') {
      return JSON.parse(data.toString('utf-8'));
    }
    return data;
  }

  private updateCache<T>(key: string, item: StorageItem<T>): void {
    // LRU 策略：如果缓存已满，移除最旧的项
    if (this.memoryCache.size >= this.config.maxCacheSize! && !this.memoryCache.has(key)) {
      const oldestKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(oldestKey);
    }

    this.memoryCache.set(key, item);
  }

  private updateAccessStats(key: string, item: StorageItem<unknown>): void {
    item.accessCount++;
    item.lastAccessedAt = Date.now();
  }

  private updateDBAccessStats(key: string): void {
    try {
      const db = this.manager.getDatabase();
      db.prepare(`
        UPDATE cold_storage 
        SET access_count = access_count + 1, last_accessed_at = ?
        WHERE key = ?
      `).run(Date.now(), key);
    } catch {
      // 忽略更新错误
    }
  }

  private isExpired(item: StorageItem<unknown>): boolean {
    return item.expiresAt !== undefined && item.expiresAt < Date.now();
  }
}

// ==================== 类型定义 ====================

interface ColdStorageRow {
  key: string;
  value: Buffer;
  value_type: string;
  created_at: number;
  updated_at: number;
  expires_at: number | null;
  access_count: number;
  last_accessed_at: number;
  priority: number;
  size_bytes: number;
  metadata: string | null;
}
```

### 5.3 TSA 集成配置示例

```typescript
// lib/storage/config/tsa-sqlite-config.ts
import { TierManager } from '../tier-manager';
import { StorageTier } from '../types';
import { RedisStorageAdapter } from '../hot/redis-store';
import { IndexedDBStorageAdapter } from '../warm/indexeddb-store';
import { SQLiteColdStorageAdapter } from '../adapters/sqlite-cold-adapter';

export async function createTSASQLiteConfig(): Promise<TierManager> {
  const tierManager = new TierManager();

  // HOT Tier: Redis
  const redisAdapter = new RedisStorageAdapter({
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    connectionTimeout: 5000,
    retryAttempts: 3,
  });

  // WARM Tier: IndexedDB
  const indexedDBAdapter = new IndexedDBStorageAdapter({
    dbName: 'hajimi-warm-storage',
    dbVersion: 1,
    stores: ['data'],
  });

  // COLD Tier: SQLite
  const sqliteAdapter = new SQLiteColdStorageAdapter({
    dbPath: getColdStoragePath(),
    maxCacheSize: 1000,
    compressionEnabled: true,
  });

  // 注册适配器
  tierManager.registerAdapter(StorageTier.HOT, redisAdapter);
  tierManager.registerAdapter(StorageTier.WARM, indexedDBAdapter);
  tierManager.registerAdapter(StorageTier.COLD, sqliteAdapter);

  // 配置分层策略
  await tierManager.configure({
    hot: {
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      maxSize: 100 * 1024 * 1024, // 100MB
      defaultTTL: 3600000, // 1 hour
    },
    warm: {
      dbName: 'hajimi-warm-storage',
      dbVersion: 1,
      stores: ['data'],
      maxSize: 500 * 1024 * 1024, // 500MB
    },
    cold: {
      basePath: getColdStoragePath(),
      fileFormat: 'json',
      maxSize: 5 * 1024 * 1024 * 1024, // 5GB
    },
    promotionThreshold: 10,    // 10 次访问升级到 HOT
    demotionThreshold: 1,      // 1 次访问/天降级到 COLD
    hotToWarmTTL: 24 * 3600000,    // 24 hours
    warmToColdTTL: 7 * 24 * 3600000, // 7 days
    coldArchiveTTL: 30 * 24 * 3600000, // 30 days
    cleanupInterval: 3600000,  // 1 hour
    enableAutoMigration: true,
    enableAutoCleanup: true,
  });

  return tierManager;
}

function getColdStoragePath(): string {
  if (process.platform === 'win32') {
    return `${process.env.LOCALAPPDATA}\\Hajimi\\storage\\cold.db`;
  } else if (process.platform === 'darwin') {
    return `${process.env.HOME}/Library/Application Support/Hajimi/storage/cold.db`;
  } else {
    return `${process.env.HOME}/.config/Hajimi/storage/cold.db`;
  }
}
```

---

## 6. Windows 特殊考量

### 6.1 文件路径处理

```typescript
// lib/desktop/utils/windows-path.ts
import path from 'path';
import { promises as fs } from 'fs';

/**
 * Windows 路径处理工具
 */
export class WindowsPathHandler {
  /**
   * 规范化路径（处理中文、空格、特殊字符）
   */
  static normalize(inputPath: string): string {
    // 1. 处理 Windows 长路径前缀
    let normalized = inputPath;
    
    // 如果路径超过 MAX_PATH (260)，添加 \\?\ 前缀
    if (process.platform === 'win32' && inputPath.length > 240) {
      if (!inputPath.startsWith('\\\\?\\') && !inputPath.startsWith('\\\\?\\UNC\')) {
        normalized = '\\\\?\\' + path.resolve(inputPath);
      }
    }

    // 2. 规范化分隔符
    normalized = path.normalize(normalized);

    // 3. 处理中文路径：确保使用 UTF-8
    // Node.js 自动处理 UTF-8，无需额外转换

    return normalized;
  }

  /**
   * 检查路径是否有效
   */
  static validatePath(inputPath: string): {
    valid: boolean;
    error?: string;
  } {
    // 检查非法字符
    const illegalChars = /[<>:"|?*]/;
    if (illegalChars.test(inputPath.replace(/\\/g, '/').split('/').pop() || '')) {
      return { valid: false, error: 'Path contains illegal characters' };
    }

    // 检查保留名称（Windows）
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    const baseName = path.basename(inputPath, path.extname(inputPath));
    if (reservedNames.test(baseName)) {
      return { valid: false, error: 'Path uses reserved Windows name' };
    }

    return { valid: true };
  }

  /**
   * 确保目录存在（递归创建）
   */
  static async ensureDir(dirPath: string): Promise<void> {
    const normalized = this.normalize(dirPath);
    
    try {
      await fs.mkdir(normalized, { recursive: true });
    } catch (error) {
      // 如果目录已存在，忽略错误
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * 安全的文件删除（处理锁定文件）
   */
  static async safeDelete(filePath: string, maxRetries: number = 3): Promise<void> {
    const normalized = this.normalize(filePath);
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        await fs.unlink(normalized);
        return;
      } catch (error) {
        const errno = (error as NodeJS.ErrnoException).code;
        
        if (errno === 'ENOENT') {
          // 文件不存在，视为成功
          return;
        }
        
        if (errno === 'EBUSY' || errno === 'EPERM') {
          // 文件被锁定，等待后重试
          if (i < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
            continue;
          }
        }
        
        throw error;
      }
    }
  }
}
```

### 6.2 文件锁机制（防止多实例数据损坏）

```typescript
// lib/desktop/utils/file-lock.ts
import fs from 'fs';
import path from 'path';

/**
 * 跨平台文件锁
 * 防止多实例同时写入数据库
 */
export class FileLock {
  private lockFile: string;
  private lockFd: number | null = null;
  private isLocked: boolean = false;

  constructor(private dbPath: string) {
    this.lockFile = `${dbPath}.lock`;
  }

  /**
   * 获取排他锁
   */
  async acquire(): Promise<boolean> {
    if (this.isLocked) {
      return true;
    }

    try {
      // Windows: 使用文件打开模式实现锁
      // 尝试以排他模式打开文件
      this.lockFd = fs.openSync(this.lockFile, 'wx');
      
      // 写入进程信息
      const lockInfo = JSON.stringify({
        pid: process.pid,
        started: Date.now(),
      });
      fs.writeSync(this.lockFd, lockInfo);
      
      this.isLocked = true;
      
      // 设置进程退出时自动释放锁
      this.setupCleanup();
      
      return true;
    } catch (error) {
      // 锁文件已存在，检查锁是否过期
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        return await this.checkStaleLock();
      }
      
      throw error;
    }
  }

  /**
   * 释放锁
   */
  async release(): Promise<void> {
    if (!this.isLocked || this.lockFd === null) {
      return;
    }

    try {
      fs.closeSync(this.lockFd);
      fs.unlinkSync(this.lockFile);
    } catch {
      // 忽略清理错误
    } finally {
      this.lockFd = null;
      this.isLocked = false;
    }
  }

  /**
   * 检查锁是否过期（进程已不存在）
   */
  private async checkStaleLock(): Promise<boolean> {
    try {
      const content = fs.readFileSync(this.lockFile, 'utf-8');
      const lockInfo = JSON.parse(content);
      
      // 检查进程是否存在
      const isRunning = this.isProcessRunning(lockInfo.pid);
      
      if (!isRunning) {
        // 进程已不存在，删除过期锁
        fs.unlinkSync(this.lockFile);
        // 重新尝试获取锁
        return await this.acquire();
      }
      
      return false;
    } catch {
      // 读取失败，假设锁已损坏，尝试删除
      try {
        fs.unlinkSync(this.lockFile);
        return await this.acquire();
      } catch {
        return false;
      }
    }
  }

  /**
   * 检查进程是否存在
   */
  private isProcessRunning(pid: number): boolean {
    try {
      // Windows: 使用 process.kill(0) 检查
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 设置进程退出清理
   */
  private setupCleanup(): void {
    const cleanup = () => {
      this.release().catch(() => {});
    };

    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('uncaughtException', cleanup);
  }
}

/**
 * 数据库连接池（单实例限制）
 */
export class SQLiteConnectionPool {
  private static instances: Map<string, Database> = new Map();
  private static locks: Map<string, FileLock> = new Map();

  /**
   * 获取数据库实例（单例模式）
   */
  static async getInstance(dbPath: string): Promise<Database> {
    // 检查是否已有实例
    if (this.instances.has(dbPath)) {
      return this.instances.get(dbPath)!;
    }

    // 获取文件锁
    const lock = new FileLock(dbPath);
    const locked = await lock.acquire();

    if (!locked) {
      throw new Error(
        `Database is locked by another process: ${dbPath}\n` +
        'Please close other instances of the application.'
      );
    }

    this.locks.set(dbPath, lock);

    // 创建数据库实例
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(dbPath, {
      fileMustExist: false,
    });

    this.instances.set(dbPath, db);

    return db;
  }

  /**
   * 释放数据库实例
   */
  static async releaseInstance(dbPath: string): Promise<void> {
    const db = this.instances.get(dbPath);
    if (db) {
      db.close();
      this.instances.delete(dbPath);
    }

    const lock = this.locks.get(dbPath);
    if (lock) {
      await lock.release();
      this.locks.delete(dbPath);
    }
  }
}
```

### 6.3 权限处理（UAC、只读媒体）

```typescript
// lib/desktop/utils/permissions.ts
import fs from 'fs/promises';
import path from 'path';

/**
 * Windows 权限管理
 */
export class WindowsPermissions {
  /**
   * 检查路径是否可写
   */
  static async isWritable(targetPath: string): Promise<boolean> {
    try {
      // 尝试创建临时文件
      const testFile = path.join(targetPath, '.write-test');
      await fs.writeFile(testFile, '');
      await fs.unlink(testFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取可写数据目录
   * 处理 UAC 和只读媒体场景
   */
  static async getWritablePath(preferredPath: string): Promise<string> {
    // 1. 尝试首选路径
    if (await this.isWritable(preferredPath)) {
      return preferredPath;
    }

    // 2. 尝试用户数据目录
    const userDataPath = this.getUserDataPath();
    await fs.mkdir(userDataPath, { recursive: true });
    
    if (await this.isWritable(userDataPath)) {
      return userDataPath;
    }

    // 3. 尝试临时目录
    const tempPath = path.join(process.env.TEMP || './temp', 'Hajimi');
    await fs.mkdir(tempPath, { recursive: true });
    
    if (await this.isWritable(tempPath)) {
      console.warn(`[Permissions] Falling back to temp directory: ${tempPath}`);
      return tempPath;
    }

    throw new Error('No writable location available');
  }

  /**
   * 获取用户数据目录
   */
  static getUserDataPath(): string {
    if (process.platform === 'win32') {
      // Windows: %LOCALAPPDATA%\Hajimi
      return path.join(
        process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE!, 'AppData', 'Local'),
        'Hajimi'
      );
    } else if (process.platform === 'darwin') {
      // macOS: ~/Library/Application Support/Hajimi
      return path.join(
        process.env.HOME!,
        'Library',
        'Application Support',
        'Hajimi'
      );
    } else {
      // Linux: ~/.config/Hajimi
      return path.join(
        process.env.HOME!,
        '.config',
        'Hajimi'
      );
    }
  }

  /**
   * 请求管理员权限（仅 Windows）
   * 注：实际提升权限需要外部进程管理
   */
  static async requestElevation(): Promise<boolean> {
    // 检测是否已有管理员权限
    try {
      // Windows: 尝试写入系统目录
      if (process.platform === 'win32') {
        const testPath = 'C:\\Windows\\Temp\\.hajimi-test';
        await fs.writeFile(testPath, '');
        await fs.unlink(testPath);
        return true;
      }
      return process.getuid?.() === 0;
    } catch {
      return false;
    }
  }
}
```

### 6.4 Windows 最佳实践总结

| 场景 | 推荐方案 | 代码示例 |
|------|---------|---------|
| **长路径** | 使用 `\\?\` 前缀 | `WindowsPathHandler.normalize(path)` |
| **多实例** | 文件锁机制 | `FileLock.acquire()` |
| **只读媒体** | 自动降级到用户目录 | `WindowsPermissions.getWritablePath()` |
| **UAC 限制** | 使用 AppData 目录 | `%LOCALAPPDATA%\Hajimi` |
| **中文路径** | UTF-8 编码 | Node.js 自动处理 |
| **特殊字符** | 路径验证 | `WindowsPathHandler.validatePath()` |

---

## 7. 事务管理最佳实践

### 7.1 嵌套事务处理

SQLite 原生不支持嵌套事务，但支持 SAVEPOINT：

```typescript
// lib/desktop/utils/transaction-manager.ts
import type { Database } from 'better-sqlite3';

/**
 * 嵌套事务管理器
 * 使用 SAVEPOINT 实现嵌套事务语义
 */
export class TransactionManager {
  private savepointStack: string[] = [];
  private isInTransaction: boolean = false;

  constructor(private db: Database) {}

  /**
   * 开始事务（或创建 SAVEPOINT）
   */
  begin(): void {
    if (!this.isInTransaction) {
      // 最外层：BEGIN TRANSACTION
      this.db.exec('BEGIN IMMEDIATE');
      this.isInTransaction = true;
    } else {
      // 嵌套层：SAVEPOINT
      const savepoint = `sp_${this.savepointStack.length}`;
      this.db.exec(`SAVEPOINT ${savepoint}`);
      this.savepointStack.push(savepoint);
    }
  }

  /**
   * 提交事务（或释放 SAVEPOINT）
   */
  commit(): void {
    if (this.savepointStack.length > 0) {
      // 释放 SAVEPOINT
      const savepoint = this.savepointStack.pop()!;
      this.db.exec(`RELEASE ${savepoint}`);
    } else if (this.isInTransaction) {
      // 提交最外层事务
      this.db.exec('COMMIT');
      this.isInTransaction = false;
    }
  }

  /**
   * 回滚事务（或回滚到 SAVEPOINT）
   */
  rollback(): void {
    if (this.savepointStack.length > 0) {
      // 回滚到 SAVEPOINT
      const savepoint = this.savepointStack.pop()!;
      this.db.exec(`ROLLBACK TO ${savepoint}`);
      this.db.exec(`RELEASE ${savepoint}`);
    } else if (this.isInTransaction) {
      // 回滚最外层事务
      this.db.exec('ROLLBACK');
      this.isInTransaction = false;
    }
  }

  /**
   * 执行事务包装函数
   */
  run<T>(fn: () => T): T {
    this.begin();
    try {
      const result = fn();
      this.commit();
      return result;
    } catch (error) {
      this.rollback();
      throw error;
    }
  }

  /**
   * 异步事务包装函数
   */
  async runAsync<T>(fn: () => Promise<T>): Promise<T> {
    this.begin();
    try {
      const result = await fn();
      this.commit();
      return result;
    } catch (error) {
      this.rollback();
      throw error;
    }
  }
}
```

### 7.2 错误处理策略

```typescript
// lib/desktop/utils/error-handler.ts
import { StorageErrorCode } from '../../storage/types';

/**
 * SQLite 错误分类与处理
 */
export class SQLiteErrorHandler {
  /**
   * 解析 SQLite 错误
   */
  static parseError(error: Error): {
    code: StorageErrorCode;
    message: string;
    isRecoverable: boolean;
  } {
    const message = error.message;

    // 唯一约束冲突
    if (message.includes('UNIQUE constraint failed')) {
      return {
        code: StorageErrorCode.ALREADY_EXISTS,
        message: 'Record already exists',
        isRecoverable: true,
      };
    }

    // 外键约束冲突
    if (message.includes('FOREIGN KEY constraint failed')) {
      return {
        code: StorageErrorCode.INVALID_VALUE,
        message: 'Referenced record does not exist',
        isRecoverable: false,
      };
    }

    // 数据库锁定
    if (message.includes('database is locked')) {
      return {
        code: StorageErrorCode.CONNECTION_TIMEOUT,
        message: 'Database is locked by another process',
        isRecoverable: true,
      };
    }

    // 表不存在
    if (message.includes('no such table')) {
      return {
        code: StorageErrorCode.NOT_FOUND,
        message: 'Table does not exist',
        isRecoverable: true,
      };
    }

    // 数据库损坏
    if (message.includes('database disk image is malformed')) {
      return {
        code: StorageErrorCode.UNKNOWN,
        message: 'Database is corrupted',
        isRecoverable: false,
      };
    }

    // 默认
    return {
      code: StorageErrorCode.UNKNOWN,
      message: error.message,
      isRecoverable: false,
    };
  }

  /**
   * 带重试的操作
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    options: {
      maxRetries?: number;
      retryDelay?: number;
      retryableErrors?: StorageErrorCode[];
    } = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      retryDelay = 100,
      retryableErrors = [
        StorageErrorCode.CONNECTION_TIMEOUT,
        StorageErrorCode.CONNECTION_LOST,
      ],
    } = options;

    let lastError: Error | null = null;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        const parsed = this.parseError(lastError);

        if (!parsed.isRecoverable || !retryableErrors.includes(parsed.code)) {
          throw error;
        }

        // 等待后重试
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * (i + 1)));
        }
      }
    }

    throw lastError;
  }
}
```

### 7.3 连接池管理

由于 better-sqlite3 是同步 API，且 SQLite 本身支持多读取单写入，连接池设计为：
- **单写入连接**: 独占写入访问
- **多读取连接**: 共享读取访问（只读模式）

```typescript
// lib/desktop/utils/connection-pool.ts
import Database from 'better-sqlite3';

/**
 * SQLite 连接池
 * 单写入 + 多读取模式
 */
export class SQLiteConnectionPool {
  private writeConnection: Database | null = null;
  private readConnections: Database[] = [];
  private readIndex: number = 0;
  
  private config: {
    dbPath: string;
    maxReadConnections: number;
    busyTimeout: number;
  };

  constructor(config: {
    dbPath: string;
    maxReadConnections?: number;
    busyTimeout?: number;
  }) {
    this.config = {
      maxReadConnections: 4,
      busyTimeout: 5000,
      ...config,
    };
  }

  /**
   * 初始化连接池
   */
  async initialize(): Promise<void> {
    // 创建写入连接
    this.writeConnection = new Database(this.config.dbPath, {
      timeout: this.config.busyTimeout,
    });
    
    // 配置 WAL 模式
    this.writeConnection.pragma('journal_mode = WAL');
    this.writeConnection.pragma(`busy_timeout = ${this.config.busyTimeout}`);

    // 创建读取连接池
    for (let i = 0; i < this.config.maxReadConnections; i++) {
      const conn = new Database(this.config.dbPath, {
        readonly: true,
        timeout: this.config.busyTimeout,
      });
      this.readConnections.push(conn);
    }
  }

  /**
   * 获取写入连接
   */
  getWriteConnection(): Database {
    if (!this.writeConnection) {
      throw new Error('Connection pool not initialized');
    }
    return this.writeConnection;
  }

  /**
   * 获取读取连接（轮询）
   */
  getReadConnection(): Database {
    if (this.readConnections.length === 0) {
      throw new Error('Connection pool not initialized');
    }
    
    const conn = this.readConnections[this.readIndex];
    this.readIndex = (this.readIndex + 1) % this.readConnections.length;
    return conn;
  }

  /**
   * 关闭连接池
   */
  async close(): Promise<void> {
    // 关闭读取连接
    for (const conn of this.readConnections) {
      conn.close();
    }
    this.readConnections = [];

    // 关闭写入连接
    if (this.writeConnection) {
      this.writeConnection.close();
      this.writeConnection = null;
    }
  }
}
```

### 7.4 事务最佳实践总结

| 场景 | 推荐方案 | 注意事项 |
|------|---------|---------|
| **简单事务** | `db.transaction()` | 自动提交/回滚 |
| **嵌套事务** | `TransactionManager` | 使用 SAVEPOINT |
| **批量写入** | 预编译语句 + 事务 | 显著提升性能 |
| **长时间事务** | 避免 | 阻塞 WAL checkpoint |
| **读取操作** | 只读连接 | 不阻塞写入 |
| **并发写入** | 队列序列化 | SQLite 单写入者 |

---

## 8. 实现路线图

### Phase 1: 基础架构（Week 1-2）
- [x] Better-SQLite3 vs sql.js 选型研究
- [x] 数据库 Schema 设计
- [ ] SQLiteManager 核心实现
- [ ] WAL 配置与测试

### Phase 2: TSA 集成（Week 3-4）
- [ ] SQLiteColdStorageAdapter 实现
- [ ] 与现有 TSA 分层管理器集成
- [ ] 数据迁移工具（从文件存储）

### Phase 3: Windows 优化（Week 5）
- [ ] Windows 路径处理
- [ ] 文件锁机制
- [ ] 权限处理
- [ ] UAC 兼容性测试

### Phase 4: 高级特性（Week 6）
- [ ] 嵌套事务支持
- [ ] 连接池优化
- [ ] 崩溃恢复机制
- [ ] 性能基准测试

### Phase 5: 生产就绪（Week 7-8）
- [ ] 完整测试覆盖
- [ ] 文档完善
- [ ] 性能调优
- [ ] 部署准备

---

## 9. 参考资料

### 官方文档
- [Better-SQLite3 Documentation](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)
- [SQLite WAL Mode](https://www.sqlite.org/wal.html)
- [SQLite FTS5](https://www.sqlite.org/fts5.html)
- [OPFS API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)

### 技术文章
- [SQLite on Windows Best Practices](https://sqlite.org/windows.html)
- [WAL Mode Performance Characteristics](https://sqlite.org/wal.html#performance_considerations)
- [Better-SQLite3 vs sql.js Benchmark](https://github.com/WiseLibs/better-sqlite3/issues/403)

### 现有代码参考
- `lib/tsa/index.ts` - TSA 核心实现
- `lib/storage/types.ts` - 存储类型定义
- `lib/storage/tier-manager.ts` - 分层管理器
- `lib/storage/cold/file-store.ts` - 现有冷存储实现

---

## 附录 A: 性能基准测试脚本

```typescript
// scripts/benchmark-sqlite.ts
import Database from 'better-sqlite3';
import { performance } from 'perf_hooks';

interface BenchmarkResult {
  operation: string;
  count: number;
  totalMs: number;
  opsPerSecond: number;
}

async function benchmarkSQLite(dbPath: string): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  
  // 清理
  try { await fs.unlink(dbPath); } catch {}
  
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  
  // 建表
  db.exec(`
    CREATE TABLE test_data (
      id INTEGER PRIMARY KEY,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      metadata TEXT
    );
    CREATE INDEX idx_key ON test_data(key);
  `);
  
  // 插入测试
  const insertCount = 100000;
  const insertStart = performance.now();
  
  const insert = db.prepare('INSERT INTO test_data (key, value, metadata) VALUES (?, ?, ?)');
  db.transaction(() => {
    for (let i = 0; i < insertCount; i++) {
      insert.run(
        `key_${i}`,
        JSON.stringify({ index: i, data: 'x'.repeat(100) }),
        JSON.stringify({ timestamp: Date.now() })
      );
    }
  })();
  
  const insertTime = performance.now() - insertStart;
  results.push({
    operation: 'INSERT',
    count: insertCount,
    totalMs: insertTime,
    opsPerSecond: (insertCount / insertTime) * 1000,
  });
  
  // 查询测试
  const queryCount = 10000;
  const queryStart = performance.now();
  
  const select = db.prepare('SELECT * FROM test_data WHERE key = ?');
  for (let i = 0; i < queryCount; i++) {
    select.get(`key_${Math.floor(Math.random() * insertCount)}`);
  }
  
  const queryTime = performance.now() - queryStart;
  results.push({
    operation: 'SELECT',
    count: queryCount,
    totalMs: queryTime,
    opsPerSecond: (queryCount / queryTime) * 1000,
  });
  
  db.close();
  
  return results;
}

// 运行测试
benchmarkSQLite('./benchmark.db').then(results => {
  console.table(results);
});
```

---

*文档版本: 1.0.0*
*最后更新: 2026-02-14*
*作者: 存储架构师*
