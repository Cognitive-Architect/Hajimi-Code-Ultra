/**
 * Mock Database Manager
 * 用于开发测试，绕过 better-sqlite3 编译问题
 * 生产环境替换为 DatabaseManager
 */
export declare class MockDatabaseManager {
    private dbPath;
    private tables;
    private initialized;
    constructor(dbPath?: string);
    /**
     * 初始化 Mock 数据库
     */
    initialize(): Promise<void>;
    /**
     * 保存数据到文件
     */
    private save;
    /**
     * 插入数据
     */
    insert(table: string, data: any): Promise<void>;
    /**
     * 查询数据
     */
    select(table: string, where?: Partial<any>): Promise<any[]>;
    /**
     * 更新数据
     */
    update(table: string, where: Partial<any>, data: Partial<any>): Promise<void>;
    /**
     * 删除数据
     */
    delete(table: string, where: Partial<any>): Promise<void>;
    /**
     * 关闭数据库
     */
    close(): Promise<void>;
}
//# sourceMappingURL=MockDatabaseManager.d.ts.map