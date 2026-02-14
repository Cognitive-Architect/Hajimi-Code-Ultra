/**
 * Mock Database Manager
 * 用于开发测试，绕过 better-sqlite3 编译问题
 * 生产环境替换为 DatabaseManager
 */

import * as path from 'path';
import * as fs from 'fs/promises';

interface MockTable {
  [key: string]: any[];
}

export class MockDatabaseManager {
  private dbPath: string;
  private tables: MockTable = {};
  private initialized = false;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), 'mock-data.json');
  }

  /**
   * 初始化 Mock 数据库
   */
  async initialize(): Promise<void> {
    try {
      // 尝试加载已有数据
      const data = await fs.readFile(this.dbPath, 'utf-8');
      this.tables = JSON.parse(data);
    } catch {
      // 文件不存在，创建新数据库
      this.tables = {
        projects: [],
        files: [],
        undo_history: [],
        settings: [],
      };
      await this.save();
    }
    
    this.initialized = true;
    console.log('[MockDatabaseManager] Initialized at:', this.dbPath);
  }

  /**
   * 保存数据到文件
   */
  private async save(): Promise<void> {
    await fs.writeFile(this.dbPath, JSON.stringify(this.tables, null, 2));
  }

  /**
   * 插入数据
   */
  async insert(table: string, data: any): Promise<void> {
    if (!this.initialized) throw new Error('Database not initialized');
    
    if (!this.tables[table]) {
      this.tables[table] = [];
    }
    
    this.tables[table].push({
      ...data,
      _id: Date.now().toString(),
      _created: new Date().toISOString(),
    });
    
    await this.save();
  }

  /**
   * 查询数据
   */
  async select(table: string, where?: Partial<any>): Promise<any[]> {
    if (!this.initialized) throw new Error('Database not initialized');
    
    let results = this.tables[table] || [];
    
    if (where) {
      results = results.filter(item => {
        return Object.entries(where).every(([key, value]) => item[key] === value);
      });
    }
    
    return results;
  }

  /**
   * 更新数据
   */
  async update(table: string, where: Partial<any>, data: Partial<any>): Promise<void> {
    if (!this.initialized) throw new Error('Database not initialized');
    
    const items = this.tables[table] || [];
    
    for (const item of items) {
      const match = Object.entries(where).every(([key, value]) => item[key] === value);
      if (match) {
        Object.assign(item, data, { _updated: new Date().toISOString() });
      }
    }
    
    await this.save();
  }

  /**
   * 删除数据
   */
  async delete(table: string, where: Partial<any>): Promise<void> {
    if (!this.initialized) throw new Error('Database not initialized');
    
    const items = this.tables[table] || [];
    this.tables[table] = items.filter(item => {
      return !Object.entries(where).every(([key, value]) => item[key] === value);
    });
    
    await this.save();
  }

  /**
   * 关闭数据库
   */
  async close(): Promise<void> {
    await this.save();
    this.initialized = false;
    console.log('[MockDatabaseManager] Closed');
  }
}
