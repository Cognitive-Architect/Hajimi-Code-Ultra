/**
 * Database Manager
 * SQLite数据库管理（Better-SQLite3）
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import { app } from 'electron';

export class DatabaseManager {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor() {
    this.dbPath = path.join(app.getPath('userData'), 'hajimi.db');
  }

  /**
   * 初始化数据库
   */
  initialize(): void {
    try {
      this.db = new Database(this.dbPath);
      
      // 启用WAL模式（提高并发性能）
      this.db.pragma('journal_mode = WAL');
      
      // 创建表
      this.createTables();
      
      console.log('[DatabaseManager] Database initialized at:', this.dbPath);
    } catch (error) {
      console.error('[DatabaseManager] Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * 创建表结构
   */
  private createTables(): void {
    if (!this.db) return;

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
  getDatabase(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  /**
   * 关闭数据库
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[DatabaseManager] Database closed');
    }
  }

  /**
   * 备份数据库
   */
  backup(backupPath: string): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    this.db.backup(backupPath);
    console.log('[DatabaseManager] Database backed up to:', backupPath);
  }

  /**
   * 检查数据库完整性
   */
  checkIntegrity(): boolean {
    if (!this.db) return false;
    
    const result = this.db.pragma('integrity_check');
    return result === 'ok';
  }
}
