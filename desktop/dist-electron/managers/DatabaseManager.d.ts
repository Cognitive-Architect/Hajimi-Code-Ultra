/**
 * Database Manager
 * SQLite数据库管理（Better-SQLite3）
 */
import Database from 'better-sqlite3';
export declare class DatabaseManager {
    private db;
    private dbPath;
    constructor();
    /**
     * 初始化数据库
     */
    initialize(): void;
    /**
     * 创建表结构
     */
    private createTables;
    /**
     * 获取数据库实例
     */
    getDatabase(): Database.Database;
    /**
     * 关闭数据库
     */
    close(): void;
    /**
     * 备份数据库
     */
    backup(backupPath: string): void;
    /**
     * 检查数据库完整性
     */
    checkIntegrity(): boolean;
}
//# sourceMappingURL=DatabaseManager.d.ts.map