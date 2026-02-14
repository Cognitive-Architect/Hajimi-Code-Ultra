"use strict";
/**
 * Database Manager
 * SQLite数据库管理（Better-SQLite3）
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseManager = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path = __importStar(require("path"));
const electron_1 = require("electron");
class DatabaseManager {
    constructor() {
        this.db = null;
        this.dbPath = path.join(electron_1.app.getPath('userData'), 'hajimi.db');
    }
    /**
     * 初始化数据库
     */
    initialize() {
        try {
            this.db = new better_sqlite3_1.default(this.dbPath);
            // 启用WAL模式（提高并发性能）
            this.db.pragma('journal_mode = WAL');
            // 创建表
            this.createTables();
            console.log('[DatabaseManager] Database initialized at:', this.dbPath);
        }
        catch (error) {
            console.error('[DatabaseManager] Failed to initialize database:', error);
            throw error;
        }
    }
    /**
     * 创建表结构
     */
    createTables() {
        if (!this.db)
            return;
        // 项目表
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        last_opened INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        is_favorite INTEGER DEFAULT 0,
        settings TEXT
      );
    `);
        // 文件索引表
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT,
        path TEXT NOT NULL,
        name TEXT NOT NULL,
        size INTEGER,
        modified_time INTEGER,
        content_hash TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_files_project ON files(project_id);
      CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
    `);
        // Undo/Redo历史表
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS undo_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT,
        action_type TEXT NOT NULL,
        file_path TEXT,
        old_content TEXT,
        new_content TEXT,
        timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        sequence INTEGER,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_undo_project ON undo_history(project_id);
      CREATE INDEX IF NOT EXISTS idx_undo_sequence ON undo_history(sequence);
    `);
        // 设置表
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `);
        console.log('[DatabaseManager] Tables created');
    }
    /**
     * 获取数据库实例
     */
    getDatabase() {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        return this.db;
    }
    /**
     * 关闭数据库
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            console.log('[DatabaseManager] Database closed');
        }
    }
    /**
     * 备份数据库
     */
    backup(backupPath) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        this.db.backup(backupPath);
        console.log('[DatabaseManager] Database backed up to:', backupPath);
    }
    /**
     * 检查数据库完整性
     */
    checkIntegrity() {
        if (!this.db)
            return false;
        const result = this.db.pragma('integrity_check');
        return result === 'ok';
    }
}
exports.DatabaseManager = DatabaseManager;
//# sourceMappingURL=DatabaseManager.js.map