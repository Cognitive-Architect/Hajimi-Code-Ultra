/**
 * Database Manager
 * Better-SQLite3 封装（支持 WAL 模式）
 * P0-011~020: 存储系统
 */
export declare class DatabaseManager {
    private dbPath;
    private isInitialized;
    private data;
    constructor(dbPath?: string);
    /**
     * P0-011: Better-SQLite3 连接
     * P0-012: 数据库初始化
     */
    initialize(): Promise<void>;
    /**
     * P0-012: Schema 初始化
     */
    private initSchema;
    /**
     * P0-015: WAL 模式配置
     */
    private configureWAL;
    /**
     * P0-013: 同步事务
     */
    transaction<T>(fn: () => T): T;
    /**
     * P0-014: 读写操作 - CRUD
     */
    saveProject(project: any): Promise<void>;
    getProject(id: string): Promise<any | null>;
    deleteProject(id: string): Promise<void>;
    listProjects(): Promise<any[]>;
    saveFile(file: any): Promise<void>;
    getFile(id: string): Promise<any | null>;
    deleteFile(id: string): Promise<void>;
    listFiles(projectId: string): Promise<any[]>;
    saveUndoStack(projectId: string, stack: any[]): Promise<void>;
    getUndoStack(projectId: string): Promise<any[]>;
    setConfig(key: string, value: any): Promise<void>;
    getConfig<T>(key: string, defaultValue?: T): Promise<T | undefined>;
    /**
     * P0-015: WAL 模式验证
     */
    getJournalMode(): Promise<string>;
    /**
     * P0-016: 项目元数据存储
     */
    updateProjectMetadata(projectId: string, metadata: any): Promise<void>;
    /**
     * P0-017: 文件索引
     */
    createFileIndex(projectId: string, filePath: string): Promise<void>;
    /**
     * P0-018: 数据库备份
     */
    backup(backupPath: string): Promise<void>;
    /**
     * P0-019: 损坏恢复
     */
    repair(): Promise<void>;
    /**
     * P0-020: TSA 适配层
     */
    tsaGet<T>(key: string): Promise<T | null>;
    tsaSet<T>(key: string, value: T): Promise<void>;
    /**
     * 持久化到文件
     */
    private persistToFile;
    /**
     * 从文件加载
     */
    private loadFromFile;
    /**
     * 关闭数据库
     */
    close(): Promise<void>;
}
//# sourceMappingURL=DatabaseManager.d.ts.map