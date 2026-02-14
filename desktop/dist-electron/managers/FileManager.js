"use strict";
/**
 * File Manager
 * 文件系统操作封装（支持原子写入、回收站）
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
exports.FileManager = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const electron_1 = require("electron");
class FileManager {
    constructor() {
        this.trashDirectory = path.join(electron_1.app.getPath('userData'), 'trash');
        this.ensureTrashDirectory();
    }
    async ensureTrashDirectory() {
        try {
            await fs.mkdir(this.trashDirectory, { recursive: true });
        }
        catch (error) {
            console.error('[FileManager] Failed to create trash directory:', error);
        }
    }
    /**
     * 读取文件
     */
    async readFile(filePath) {
        try {
            const data = await fs.readFile(filePath, 'utf-8');
            return { success: true, data };
        }
        catch (error) {
            console.error('[FileManager] Read error:', error);
            return { success: false, error: error.message };
        }
    }
    /**
     * 原子写入文件（先写临时文件，再重命名）
     */
    async writeFile(filePath, content) {
        const tempPath = `${filePath}.tmp`;
        try {
            // 确保目录存在
            const dir = path.dirname(filePath);
            await fs.mkdir(dir, { recursive: true });
            // 先写入临时文件
            await fs.writeFile(tempPath, content, 'utf-8');
            // 原子重命名
            await fs.rename(tempPath, filePath);
            return { success: true };
        }
        catch (error) {
            // 清理临时文件
            try {
                await fs.unlink(tempPath);
            }
            catch { /* ignore */ }
            console.error('[FileManager] Write error:', error);
            return { success: false, error: error.message };
        }
    }
    /**
     * 删除文件（移动到回收站）
     */
    async deleteFile(filePath) {
        try {
            // 生成回收站中的唯一文件名
            const fileName = path.basename(filePath);
            const timestamp = Date.now();
            const trashName = `${fileName}.${timestamp}`;
            const trashPath = path.join(this.trashDirectory, trashName);
            // 移动到回收站目录
            await fs.rename(filePath, trashPath);
            return { success: true };
        }
        catch (error) {
            console.error('[FileManager] Delete error:', error);
            return { success: false, error: error.message };
        }
    }
    /**
     * 读取目录内容
     */
    async readDirectory(dirPath) {
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            const files = await Promise.all(entries.map(async (entry) => {
                const fullPath = path.join(dirPath, entry.name);
                const stats = await fs.stat(fullPath);
                return {
                    name: entry.name,
                    path: fullPath,
                    isDirectory: entry.isDirectory(),
                    size: stats.size,
                    modifiedTime: stats.mtime,
                };
            }));
            return { success: true, files };
        }
        catch (error) {
            console.error('[FileManager] Read directory error:', error);
            return { success: false, error: error.message };
        }
    }
    /**
     * 检查文件是否存在
     */
    async exists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * 创建目录
     */
    async mkdir(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
}
exports.FileManager = FileManager;
//# sourceMappingURL=FileManager.js.map