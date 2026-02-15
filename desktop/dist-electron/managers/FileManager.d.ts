/**
 * File Manager
 * 文件系统操作封装（支持原子写入、回收站）
 */
export interface FileEntry {
    name: string;
    path: string;
    isDirectory: boolean;
    size: number;
    modifiedTime: Date;
}
export declare class FileManager {
    private trashDirectory;
    constructor();
    private getTrashDirectory;
    private ensureTrashDirectory;
    /**
     * 初始化
     */
    initialize(): Promise<void>;
    /**
     * 读取文件
     */
    readFile(filePath: string): Promise<{
        success: boolean;
        data?: string;
        error?: string;
    }>;
    /**
     * 原子写入文件（先写临时文件，再重命名）
     */
    writeFile(filePath: string, content: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * 删除文件（移动到回收站）
     */
    deleteFile(filePath: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * 读取目录内容
     */
    readDirectory(dirPath: string): Promise<{
        success: boolean;
        files?: FileEntry[];
        error?: string;
    }>;
    /**
     * 检查文件是否存在
     */
    exists(filePath: string): Promise<boolean>;
    /**
     * 创建目录
     */
    mkdir(dirPath: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * 获取文件状态
     */
    getFileStats(filePath: string): Promise<{
        success: boolean;
        stats?: any;
        error?: string;
    }>;
    /**
     * 创建目录（别名）
     */
    createDirectory(dirPath: string, recursive?: boolean): Promise<void>;
}
//# sourceMappingURL=FileManager.d.ts.map