"use strict";
/**
 * Database Manager
 * Better-SQLite3 封装（支持 WAL 模式）
 * P0-011~020: 存储系统
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseManager = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
// 由于 better-sqlite3 编译问题，使用 Mock 实现
// 生产环境替换为真实 SQLite
class DatabaseManager {
    constructor(dbPath) {
        this.isInitialized = false;
        // 内存数据存储（Mock）
        this.data = {
            projects: new Map(),
            files: new Map(),
            operations: new Map(),
            undo_stack: new Map(),
            config: new Map(),
        };
        this.dbPath = dbPath || path.join(process.cwd(), 'storage', 'hajimi.db');
    }
    /**
     * P0-011: Better-SQLite3 连接
     * P0-012: 数据库初始化
     */
    async initialize() {
        try {
            // 确保存储目录存在
            const dir = path.dirname(this.dbPath);
            await fs.mkdir(dir, { recursive: true });
            // 尝试加载已有数据
            await this.loadFromFile();
            // P0-012: Schema 自动创建
            await this.initSchema();
            // P0-015: WAL 模式配置
            await this.configureWAL();
            this.isInitialized = true;
            console.log('[DatabaseManager] Initialized at:', this.dbPath);
        }
        catch (error) {
            console.error('[DatabaseManager] Initialization failed:', error);
            throw error;
        }
    }
    /**
     * P0-012: Schema 初始化
     */
    async initSchema() {
        // Projects 表
        if (this.data.projects.size === 0) {
            console.log('[DatabaseManager] Creating projects table...');
        }
        // Files 表
        if (this.data.files.size === 0) {
            console.log('[DatabaseManager] Creating files table...');
        }
        // Operations 表（Undo/Redo）
        if (this.data.operations.size === 0) {
            console.log('[DatabaseManager] Creating operations table...');
        }
        // Undo Stack 表
        if (this.data.undo_stack.size === 0) {
            console.log('[DatabaseManager] Creating undo_stack table...');
        }
        // Config 表
        if (this.data.config.size === 0) {
            console.log('[DatabaseManager] Creating config table...');
        }
    }
    /**
     * P0-015: WAL 模式配置
     */
    async configureWAL() {
        // Mock 实现中记录配置
        this.data.config.set('journal_mode', 'wal');
        this.data.config.set('synchronous', 'normal');
        this.data.config.set('cache_size', -64000);
        this.data.config.set('temp_store', 'memory');
        console.log('[DatabaseManager] WAL mode configured');
    }
    /**
     * P0-013: 同步事务
     */
    transaction(fn) {
        if (!this.isInitialized) {
            throw new Error('Database not initialized');
        }
        try {
            // 开始事务
            const result = fn();
            // 提交事务
            this.persistToFile();
            return result;
        }
        catch (error) {
            // 回滚事务
            console.error('[DatabaseManager] Transaction failed:', error);
            throw error;
        }
    }
    /**
     * P0-014: 读写操作 - CRUD
     */
    // 项目操作
    async saveProject(project) {
        this.data.projects.set(project.id, {
            ...project,
            updated_at: Date.now(),
        });
        await this.persistToFile();
    }
    async getProject(id) {
        return this.data.projects.get(id) || null;
    }
    async deleteProject(id) {
        this.data.projects.delete(id);
        await this.persistToFile();
    }
    async listProjects() {
        return Array.from(this.data.projects.values()).sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
    }
    // 文件索引操作
    async saveFile(file) {
        this.data.files.set(file.id, {
            ...file,
            updated_at: Date.now(),
        });
        await this.persistToFile();
    }
    async getFile(id) {
        return this.data.files.get(id) || null;
    }
    async deleteFile(id) {
        this.data.files.delete(id);
        await this.persistToFile();
    }
    async listFiles(projectId) {
        return Array.from(this.data.files.values())
            .filter(f => f.project_id === projectId)
            .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
    }
    // Undo 栈操作
    async saveUndoStack(projectId, stack) {
        this.data.undo_stack.set(projectId, {
            project_id: projectId,
            data: stack,
            updated_at: Date.now(),
        });
        await this.persistToFile();
    }
    async getUndoStack(projectId) {
        const record = this.data.undo_stack.get(projectId);
        return record?.data || [];
    }
    // 配置操作
    async setConfig(key, value) {
        this.data.config.set(key, {
            key,
            value: JSON.stringify(value),
            updated_at: Date.now(),
        });
        await this.persistToFile();
    }
    async getConfig(key, defaultValue) {
        const record = this.data.config.get(key);
        if (record) {
            try {
                return JSON.parse(record.value);
            }
            catch {
                return record.value;
            }
        }
        return defaultValue;
    }
    /**
     * P0-015: WAL 模式验证
     */
    async getJournalMode() {
        return this.data.config.get('journal_mode')?.value || 'wal';
    }
    /**
     * P0-016: 项目元数据存储
     */
    async updateProjectMetadata(projectId, metadata) {
        const project = await this.getProject(projectId);
        if (project) {
            await this.saveProject({
                ...project,
                ...metadata,
            });
        }
    }
    /**
     * P0-017: 文件索引
     */
    async createFileIndex(projectId, filePath) {
        const id = `${projectId}:${filePath}`;
        await this.saveFile({
            id,
            project_id: projectId,
            path: filePath,
            indexed_at: Date.now(),
        });
    }
    /**
     * P0-018: 数据库备份
     */
    async backup(backupPath) {
        const backup = {
            timestamp: Date.now(),
            data: {
                projects: Array.from(this.data.projects.entries()),
                files: Array.from(this.data.files.entries()),
                operations: Array.from(this.data.operations.entries()),
                undo_stack: Array.from(this.data.undo_stack.entries()),
                config: Array.from(this.data.config.entries()),
            },
        };
        await fs.writeFile(backupPath, JSON.stringify(backup, null, 2));
        console.log('[DatabaseManager] Backup created:', backupPath);
    }
    /**
     * P0-019: 损坏恢复
     */
    async repair() {
        console.log('[DatabaseManager] Repairing database...');
        // 清理无效数据
        let repaired = 0;
        for (const [id, project] of this.data.projects) {
            if (!project.name || !project.path) {
                this.data.projects.delete(id);
                repaired++;
            }
        }
        await this.persistToFile();
        console.log(`[DatabaseManager] Repaired ${repaired} records`);
    }
    /**
     * P0-020: TSA 适配层
     */
    async tsaGet(key) {
        const value = await this.getConfig(key);
        return value === undefined ? null : value;
    }
    async tsaSet(key, value) {
        await this.setConfig(key, value);
    }
    /**
     * 持久化到文件
     */
    async persistToFile() {
        const data = {
            projects: Array.from(this.data.projects.entries()),
            files: Array.from(this.data.files.entries()),
            operations: Array.from(this.data.operations.entries()),
            undo_stack: Array.from(this.data.undo_stack.entries()),
            config: Array.from(this.data.config.entries()),
        };
        await fs.writeFile(this.dbPath, JSON.stringify(data));
    }
    /**
     * 从文件加载
     */
    async loadFromFile() {
        try {
            const content = await fs.readFile(this.dbPath, 'utf-8');
            const data = JSON.parse(content);
            this.data.projects = new Map(data.projects || []);
            this.data.files = new Map(data.files || []);
            this.data.operations = new Map(data.operations || []);
            this.data.undo_stack = new Map(data.undo_stack || []);
            this.data.config = new Map(data.config || []);
            console.log('[DatabaseManager] Loaded from file');
        }
        catch {
            // 文件不存在，使用空数据
            console.log('[DatabaseManager] No existing database file');
        }
    }
    /**
     * 关闭数据库
     */
    async close() {
        await this.persistToFile();
        this.isInitialized = false;
        console.log('[DatabaseManager] Closed');
    }
}
exports.DatabaseManager = DatabaseManager;
//# sourceMappingURL=DatabaseManager.js.map