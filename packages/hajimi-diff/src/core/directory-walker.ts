/**
 * Directory Walker - 目录遍历与树构建
 * 
 * DEBT-CLI-001【已清偿 v1.1】
 * 
 * 功能:
 * - 递归遍历目录
 * - 构建 DirectoryTree 结构
 * - 循环引用检测
 * - 内容哈希计算
 */

import * as fs from 'fs';
import * as path from 'path';
import { blake3_256 } from '../hash/blake3_256';

export type EntryType = 'file' | 'directory' | 'symlink' | 'block' | 'char' | 'fifo' | 'socket';

export interface DirectoryEntry {
  type: EntryType;
  path: string;           // 相对路径
  size: number;
  mtime: number;
  mode: number;
  hash?: string;          // BLAKE3-256 (仅文件)
  target?: string;        // symlink 目标
}

export interface DirectoryTree {
  root: string;
  entries: DirectoryEntry[];
  totalFiles: number;
  totalDirs: number;
  totalSize: number;
  treeHash: string;       // Merkle 根哈希
}

export interface WalkOptions {
  recursive?: boolean;        // 默认 true
  followSymlinks?: boolean;   // 默认 false
  ignorePatterns?: string[];  // 忽略模式 (如 node_modules)
  maxDepth?: number;          // 最大深度 (默认无限)
  computeHashes?: boolean;    // 是否计算文件哈希 (默认 true)
}

/**
 * 循环引用检测器
 */
class CircularReferenceDetector {
  private visited: Set<string> = new Set();
  private stack: Set<string> = new Set();
  private deviceInodeMap: Map<string, string> = new Map();

  /**
   * 获取文件唯一标识 (device:inode)
   */
  private getFileId(filePath: string): string {
    try {
      const stats = fs.statSync(filePath);
      return `${stats.dev}:${stats.ino}`;
    } catch {
      return filePath;
    }
  }

  /**
   * 检查是否会产生循环引用
   */
  check(filePath: string): boolean {
    const realPath = fs.realpathSync(filePath);
    const fileId = this.getFileId(realPath);

    if (this.stack.has(fileId)) {
      return true; // 发现循环
    }

    if (this.visited.has(fileId)) {
      return false; // 已处理过，无循环
    }

    this.stack.add(fileId);
    this.visited.add(fileId);
    this.deviceInodeMap.set(filePath, fileId);

    return false;
  }

  /**
   * 标记完成当前路径处理
   */
  done(filePath: string): void {
    const realPath = fs.realpathSync(filePath);
    const fileId = this.getFileId(realPath);
    this.stack.delete(fileId);
  }
}

/**
 * 目录遍历器
 */
export class DirectoryWalker {
  private detector: CircularReferenceDetector;
  private options: Required<WalkOptions>;

  constructor(options: WalkOptions = {}) {
    this.detector = new CircularReferenceDetector();
    this.options = {
      recursive: true,
      followSymlinks: false,
      ignorePatterns: [],
      maxDepth: Infinity,
      computeHashes: true,
      ...options
    };
  }

  /**
   * 检查路径是否应被忽略
   */
  private shouldIgnore(relativePath: string): boolean {
    const parts = relativePath.split(path.sep);
    return this.options.ignorePatterns.some(pattern => {
      // 简单通配符支持
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      return parts.some(part => regex.test(part));
    });
  }

  /**
   * 计算文件 BLAKE3 哈希
   */
  private computeFileHash(filePath: string): string {
    const data = fs.readFileSync(filePath);
    return Buffer.from(blake3_256(data)).toString('hex');
  }

  /**
   * 递归遍历目录
   */
  walk(rootPath: string): DirectoryTree {
    const entries: DirectoryEntry[] = [];
    let totalFiles = 0;
    let totalDirs = 0;
    let totalSize = 0;

    const walkRecursive = (currentPath: string, relativePath: string, depth: number): void => {
      // 检查深度限制
      if (depth > this.options.maxDepth) {
        return;
      }

      // 检查忽略模式
      if (this.shouldIgnore(relativePath)) {
        return;
      }

      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(currentPath);
      } catch (err) {
        console.warn(`[WARN] Cannot stat: ${currentPath}`);
        return;
      }

      // 处理符号链接
      if (stat.isSymbolicLink()) {
        const target = fs.readlinkSync(currentPath);
        
        if (!this.options.followSymlinks) {
          // 不跟随符号链接，记录为 symlink 类型
          entries.push({
            type: 'symlink',
            path: relativePath,
            size: 0,
            mtime: stat.mtimeMs,
            mode: stat.mode,
            target
          });
          return;
        }

        // 检测循环引用
        if (this.detector.check(currentPath)) {
          console.warn(`[WARN] Circular reference detected: ${currentPath} -> ${target}`);
          entries.push({
            type: 'symlink',
            path: relativePath,
            size: 0,
            mtime: stat.mtimeMs,
            mode: stat.mode,
            target: '[CIRCULAR]'
          });
          return;
        }

        try {
          const realStat = fs.statSync(currentPath);
          if (realStat.isDirectory()) {
            // 跟随到目录
            this.detector.done(currentPath);
          }
        } catch {
          // 链接目标不存在
          entries.push({
            type: 'symlink',
            path: relativePath,
            size: 0,
            mtime: stat.mtimeMs,
            mode: stat.mode,
            target: '[BROKEN]'
          });
          this.detector.done(currentPath);
          return;
        }
      }

      if (stat.isDirectory()) {
        entries.push({
          type: 'directory',
          path: relativePath,
          size: 0,
          mtime: stat.mtimeMs,
          mode: stat.mode
        });
        totalDirs++;

        if (this.options.recursive) {
          // 递归遍历子项（排序确保一致性）
          let children: string[];
          try {
            children = fs.readdirSync(currentPath).sort();
          } catch {
            console.warn(`[WARN] Cannot read directory: ${currentPath}`);
            return;
          }

          for (const child of children) {
            walkRecursive(
              path.join(currentPath, child),
              path.join(relativePath, child),
              depth + 1
            );
          }
        }
      } else if (stat.isFile()) {
        const entry: DirectoryEntry = {
          type: 'file',
          path: relativePath,
          size: stat.size,
          mtime: stat.mtimeMs,
          mode: stat.mode
        };

        // 计算内容哈希
        if (this.options.computeHashes) {
          try {
            entry.hash = this.computeFileHash(currentPath);
          } catch (err) {
            console.warn(`[WARN] Cannot compute hash: ${currentPath}`);
          }
        }

        entries.push(entry);
        totalFiles++;
        totalSize += stat.size;
      } else if (stat.isSymbolicLink()) {
        // 已在上面处理
      } else {
        // 特殊文件类型 (block, char, fifo, socket)
        const entry: DirectoryEntry = {
          type: stat.isBlockDevice() ? 'block' :
                stat.isCharacterDevice() ? 'char' :
                stat.isFIFO() ? 'fifo' :
                stat.isSocket() ? 'socket' : 'file',
          path: relativePath,
          size: 0,
          mtime: stat.mtimeMs,
          mode: stat.mode
        };
        entries.push(entry);
      }
    };

    walkRecursive(rootPath, '', 0);

    const tree: DirectoryTree = {
      root: path.basename(rootPath),
      entries,
      totalFiles,
      totalDirs,
      totalSize,
      treeHash: this.computeTreeHash(entries)
    };

    return tree;
  }

  /**
   * 计算目录树 Merkle 根哈希
   */
  private computeTreeHash(entries: DirectoryEntry[]): string {
    if (entries.length === 0) {
      return blake3_256(Buffer.from('')).toString('hex');
    }

    // 构建叶子节点哈希
    const hashes: Buffer[] = entries.map(e => {
      const data = `${e.type}:${e.path}:${e.hash || ''}:${e.target || ''}:${e.size}:${e.mtime}`;
      return Buffer.from(blake3_256(Buffer.from(data)));
    });

    // 两两合并直到根
    while (hashes.length > 1) {
      const nextLevel: Buffer[] = [];
      for (let i = 0; i < hashes.length; i += 2) {
        if (i + 1 < hashes.length) {
          nextLevel.push(Buffer.from(blake3_256(Buffer.concat([hashes[i], hashes[i + 1]]))));
        } else {
          nextLevel.push(hashes[i]); // 奇数处理
        }
      }
      hashes.length = 0;
      hashes.push(...nextLevel);
    }

    return hashes[0].toString('hex');
  }
}

/**
 * 快速遍历（不计算哈希，仅统计）
 */
export function quickWalk(rootPath: string, options: WalkOptions = {}): DirectoryTree {
  return new DirectoryWalker({ ...options, computeHashes: false }).walk(rootPath);
}

/**
 * 完整遍历（计算哈希）
 */
export function fullWalk(rootPath: string, options: WalkOptions = {}): DirectoryTree {
  return new DirectoryWalker(options).walk(rootPath);
}
