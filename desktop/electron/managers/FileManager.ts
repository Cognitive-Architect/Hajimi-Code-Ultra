/**
 * File Manager
 * 文件系统操作封装（支持原子写入、回收站）
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedTime: Date;
}

export class FileManager {
  private trashDirectory: string;

  constructor() {
    this.trashDirectory = path.join(app.getPath('userData'), 'trash');
    this.ensureTrashDirectory();
  }

  private async ensureTrashDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.trashDirectory, { recursive: true });
    } catch (error) {
      console.error('[FileManager] Failed to create trash directory:', error);
    }
  }

  /**
   * 读取文件
   */
  async readFile(filePath: string): Promise<{ success: boolean; data?: string; error?: string }> {
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return { success: true, data };
    } catch (error) {
      console.error('[FileManager] Read error:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 原子写入文件（先写临时文件，再重命名）
   */
  async writeFile(filePath: string, content: string): Promise<{ success: boolean; error?: string }> {
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
    } catch (error) {
      // 清理临时文件
      try {
        await fs.unlink(tempPath);
      } catch { /* ignore */ }
      
      console.error('[FileManager] Write error:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 删除文件（移动到回收站）
   */
  async deleteFile(filePath: string): Promise<{ success: boolean; error?: string }> {
    try {
      // 生成回收站中的唯一文件名
      const fileName = path.basename(filePath);
      const timestamp = Date.now();
      const trashName = `${fileName}.${timestamp}`;
      const trashPath = path.join(this.trashDirectory, trashName);
      
      // 移动到回收站目录
      await fs.rename(filePath, trashPath);
      
      return { success: true };
    } catch (error) {
      console.error('[FileManager] Delete error:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 读取目录内容
   */
  async readDirectory(dirPath: string): Promise<{ success: boolean; files?: FileEntry[]; error?: string }> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      const files: FileEntry[] = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(dirPath, entry.name);
          const stats = await fs.stat(fullPath);
          
          return {
            name: entry.name,
            path: fullPath,
            isDirectory: entry.isDirectory(),
            size: stats.size,
            modifiedTime: stats.mtime,
          };
        })
      );
      
      return { success: true, files };
    } catch (error) {
      console.error('[FileManager] Read directory error:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 检查文件是否存在
   */
  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 创建目录
   */
  async mkdir(dirPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
}
