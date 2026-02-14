/**
 * B-03/06 压力怪·审计员 - 审计存储模块
 * 
 * 将审计日志写入 storage/cold/sandbox-audit/
 * - 文件名格式: {timestamp}-{executionId}.json
 * - 包含SHA256哈希链
 * - 与TSA Archive集成
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { AuditReport, AuditLogStorageEntry, verifyAuditReport } from './audit-logger';

// ==================== 类型定义 ====================

export interface AuditStorageConfig {
  /** 基础存储路径 */
  basePath?: string;
  /** 文件名格式模板 */
  filenameTemplate?: string;
  /** 是否启用压缩 */
  compressionEnabled?: boolean;
  /** 是否启用加密 */
  encryptionEnabled?: boolean;
  /** 最大文件大小（字节） */
  maxFileSize?: number;
  /** 保留天数 */
  retentionDays?: number;
}

export interface StoredAuditFile {
  filename: string;
  filepath: string;
  timestamp: number;
  executionId: string;
  size: number;
  checksum: string;
}

export interface AuditStorageStats {
  totalFiles: number;
  totalSize: number;
  oldestFile?: number;
  newestFile?: number;
  files: StoredAuditFile[];
}

export interface AuditStorageResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  filepath?: string;
}

// ==================== 审计存储 ====================

export class AuditStorage {
  private config: Required<AuditStorageConfig>;
  private initialized: boolean = false;

  // 默认配置
  private static readonly DEFAULT_CONFIG: Required<AuditStorageConfig> = {
    basePath: 'storage/cold/sandbox-audit',
    filenameTemplate: '{timestamp}-{executionId}.json',
    compressionEnabled: false,
    encryptionEnabled: false,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    retentionDays: 90,
  };

  constructor(config?: AuditStorageConfig) {
    this.config = {
      ...AuditStorage.DEFAULT_CONFIG,
      ...config,
    };
  }

  // ==================== 生命周期方法 ====================

  /**
   * 初始化存储目录
   */
  async initialize(): Promise<AuditStorageResult<void>> {
    try {
      await fs.mkdir(this.config.basePath, { recursive: true });
      this.initialized = true;
      
      return {
        success: true,
        data: undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to initialize audit storage: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ==================== 存储操作 ====================

  /**
   * 保存审计报告到存储
   * @param report - 审计报告
   * @returns 存储结果
   */
  async save(report: AuditReport): Promise<AuditStorageResult<StoredAuditFile>> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // 验证报告完整性
      if (!verifyAuditReport(report)) {
        return {
          success: false,
          error: 'Audit report integrity check failed',
        };
      }

      // 生成文件名
      const filename = this.generateFilename(report);
      const filepath = path.join(this.config.basePath, filename);

      // 准备存储数据
      const storageEntry: AuditLogStorageEntry = {
        key: `${report.summary.startTime}-${report.summary.executionId}`,
        data: report,
        tier: 'ARCHIVE',
        timestamp: Date.now(),
        checksum: report.hashChain,
      };

      // 序列化数据
      let dataToStore = JSON.stringify(storageEntry, null, 2);

      // 检查文件大小
      const dataSize = Buffer.byteLength(dataToStore, 'utf-8');
      if (dataSize > this.config.maxFileSize) {
        return {
          success: false,
          error: `Audit report exceeds maximum file size: ${dataSize} > ${this.config.maxFileSize}`,
        };
      }

      // 压缩（如果启用）
      if (this.config.compressionEnabled) {
        dataToStore = await this.compress(dataToStore);
      }

      // 加密（如果启用）
      if (this.config.encryptionEnabled) {
        dataToStore = await this.encrypt(dataToStore);
      }

      // 写入文件
      await fs.writeFile(filepath, dataToStore, 'utf-8');

      // 验证写入
      const stats = await fs.stat(filepath);
      const storedFile: StoredAuditFile = {
        filename,
        filepath,
        timestamp: report.summary.startTime,
        executionId: report.summary.executionId,
        size: stats.size,
        checksum: report.hashChain,
      };

      return {
        success: true,
        data: storedFile,
        filepath,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to save audit report: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 读取审计报告
   * @param filename - 文件名或执行ID
   * @returns 审计报告
   */
  async load(filename: string): Promise<AuditStorageResult<AuditReport>> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // 如果传入的是执行ID，查找对应的文件
      if (!filename.endsWith('.json')) {
        const files = await this.list();
        const matched = files.data?.find(f => f.executionId === filename);
        if (!matched) {
          return {
            success: false,
            error: `Audit report not found for executionId: ${filename}`,
          };
        }
        filename = matched.filename;
      }

      const filepath = path.join(this.config.basePath, filename);
      let data = await fs.readFile(filepath, 'utf-8');

      // 解密（如果启用）
      if (this.config.encryptionEnabled) {
        data = await this.decrypt(data);
      }

      // 解压（如果启用）
      if (this.config.compressionEnabled) {
        data = await this.decompress(data);
      }

      const storageEntry: AuditLogStorageEntry = JSON.parse(data);
      
      // 验证完整性
      if (!verifyAuditReport(storageEntry.data)) {
        return {
          success: false,
          error: 'Stored audit report integrity check failed',
        };
      }

      return {
        success: true,
        data: storageEntry.data,
        filepath,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to load audit report: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 列出所有存储的审计文件
   * @returns 文件列表
   */
  async list(): Promise<AuditStorageResult<StoredAuditFile[]>> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const files = await fs.readdir(this.config.basePath);
      const auditFiles: StoredAuditFile[] = [];

      for (const filename of files) {
        if (!filename.endsWith('.json')) continue;

        const filepath = path.join(this.config.basePath, filename);
        const stats = await fs.stat(filepath);

        // 解析文件名获取信息
        const parsed = this.parseFilename(filename);
        
        auditFiles.push({
          filename,
          filepath,
          timestamp: parsed.timestamp,
          executionId: parsed.executionId,
          size: stats.size,
          checksum: '', // 需要加载文件才能获取
        });
      }

      // 按时间戳排序
      auditFiles.sort((a, b) => b.timestamp - a.timestamp);

      return {
        success: true,
        data: auditFiles,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to list audit files: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 获取存储统计信息
   * @returns 统计信息
   */
  async getStats(): Promise<AuditStorageResult<AuditStorageStats>> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const listResult = await this.list();
      if (!listResult.success || !listResult.data) {
        return {
          success: false,
          error: listResult.error,
        };
      }

      const files = listResult.data;
      let totalSize = 0;
      let oldestFile: number | undefined;
      let newestFile: number | undefined;

      for (const file of files) {
        totalSize += file.size;
        
        if (oldestFile === undefined || file.timestamp < oldestFile) {
          oldestFile = file.timestamp;
        }
        if (newestFile === undefined || file.timestamp > newestFile) {
          newestFile = file.timestamp;
        }
      }

      const stats: AuditStorageStats = {
        totalFiles: files.length,
        totalSize,
        oldestFile,
        newestFile,
        files,
      };

      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get storage stats: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 删除审计报告
   * @param filename - 文件名或执行ID
   */
  async delete(filename: string): Promise<AuditStorageResult<void>> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // 如果传入的是执行ID，查找对应的文件
      if (!filename.endsWith('.json')) {
        const files = await this.list();
        const matched = files.data?.find(f => f.executionId === filename);
        if (!matched) {
          return {
            success: false,
            error: `Audit report not found for executionId: ${filename}`,
          };
        }
        filename = matched.filename;
      }

      const filepath = path.join(this.config.basePath, filename);
      await fs.unlink(filepath);

      return {
        success: true,
        data: undefined,
        filepath,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete audit report: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 清理过期文件
   * @returns 清理的文件数
   */
  async cleanup(): Promise<AuditStorageResult<number>> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const cutoffTime = Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000);
      const listResult = await this.list();
      
      if (!listResult.success || !listResult.data) {
        return {
          success: false,
          error: listResult.error,
        };
      }

      let cleanedCount = 0;
      const errors: string[] = [];

      for (const file of listResult.data) {
        if (file.timestamp < cutoffTime) {
          const deleteResult = await this.delete(file.filename);
          if (deleteResult.success) {
            cleanedCount++;
          } else {
            errors.push(`Failed to delete ${file.filename}: ${deleteResult.error}`);
          }
        }
      }

      if (errors.length > 0) {
        return {
          success: cleanedCount > 0,
          data: cleanedCount,
          error: errors.join('; '),
        };
      }

      return {
        success: true,
        data: cleanedCount,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to cleanup audit storage: ${(error as Error).message}`,
      };
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 生成文件名
   */
  private generateFilename(report: AuditReport): string {
    return this.config.filenameTemplate
      .replace('{timestamp}', report.summary.startTime.toString())
      .replace('{executionId}', report.summary.executionId);
  }

  /**
   * 解析文件名
   */
  private parseFilename(filename: string): { timestamp: number; executionId: string } {
    // 移除.json后缀
    const name = filename.replace('.json', '');
    const parts = name.split('-');
    
    if (parts.length >= 2) {
      return {
        timestamp: parseInt(parts[0], 10) || 0,
        executionId: parts.slice(1).join('-'),
      };
    }

    return {
      timestamp: 0,
      executionId: name,
    };
  }

  /**
   * 压缩数据（简单实现，实际可用zlib）
   */
  private async compress(data: string): Promise<string> {
    // 简化的压缩实现 - 实际项目中应使用zlib
    const compressed = Buffer.from(data).toString('base64');
    return `COMPRESSED:${compressed}`;
  }

  /**
   * 解压数据
   */
  private async decompress(data: string): Promise<string> {
    if (!data.startsWith('COMPRESSED:')) {
      return data;
    }
    const compressed = data.substring('COMPRESSED:'.length);
    return Buffer.from(compressed, 'base64').toString('utf-8');
  }

  /**
   * 加密数据（简单实现，实际应使用强加密）
   */
  private async encrypt(data: string): Promise<string> {
    // 简化的加密实现 - 实际项目中应使用crypto.createCipheriv
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(process.env.AUDIT_ENCRYPTION_KEY || 'default-key', 'salt', 32);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(data, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return `ENCRYPTED:${algorithm}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * 解密数据
   */
  private async decrypt(data: string): Promise<string> {
    if (!data.startsWith('ENCRYPTED:')) {
      return data;
    }

    const parts = data.split(':');
    if (parts.length !== 5) {
      throw new Error('Invalid encrypted data format');
    }

    const [, algorithm, ivHex, authTagHex, encrypted] = parts;
    const key = crypto.scryptSync(process.env.AUDIT_ENCRYPTION_KEY || 'default-key', 'salt', 32);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(algorithm, key, iv) as crypto.DecipherGCM;
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    
    return decrypted;
  }
}

// ==================== 便捷函数 ====================

/**
 * 创建审计存储实例
 */
export function createAuditStorage(config?: AuditStorageConfig): AuditStorage {
  return new AuditStorage(config);
}

/**
 * 快速保存审计报告
 */
export async function saveAuditReport(
  report: AuditReport,
  config?: AuditStorageConfig
): Promise<AuditStorageResult<StoredAuditFile>> {
  const storage = createAuditStorage(config);
  await storage.initialize();
  return storage.save(report);
}

/**
 * 快速加载审计报告
 */
export async function loadAuditReport(
  filename: string,
  config?: AuditStorageConfig
): Promise<AuditStorageResult<AuditReport>> {
  const storage = createAuditStorage(config);
  await storage.initialize();
  return storage.load(filename);
}

// ==================== 导出 ====================

export { AuditReport, AuditLogStorageEntry, verifyAuditReport } from './audit-logger';
export default AuditStorage;
