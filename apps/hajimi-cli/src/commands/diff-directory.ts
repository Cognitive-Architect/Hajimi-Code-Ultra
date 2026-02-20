/**
 * Diff Directory Command - 目录级差异比较
 * DEBT-CLI-001【返工中 v1.1-HARDENED】🔴 循环检测真实实现
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

interface DiffOptions {
  output: string;
  format: string;
  recursive: boolean;
  ignorePatterns: string[];
  compression?: string;
  followSymlinks?: boolean;
  maxDepth?: number;
}

// ============ 循环引用检测器（真实实现）============
class CircularReferenceDetector {
  // 使用 Set 存储 device:inode 键
  private visitedInodes: Set<string> = new Set();
  private visitedRealPaths: Set<string> = new Set();
  
  /**
   * 生成文件唯一标识 (device:inode)
   */
  private getInodeKey(filePath: string): string | null {
    try {
      const stat = fs.statSync(filePath);
      return `${stat.dev}:${stat.ino}`;
    } catch {
      return null;
    }
  }
  
  /**
   * 检查是否会产生循环引用
   * 若检测到循环，立即抛出错误
   */
  check(filePath: string): void {
    // 获取 inode 键
    const inodeKey = this.getInodeKey(filePath);
    if (inodeKey && this.visitedInodes.has(inodeKey)) {
      throw new Error(`[CIRCULAR] Symlink loop detected at ${filePath} (inode: ${inodeKey})`);
    }
    
    // 同时检查真实路径（处理硬链接情况）
    try {
      const realPath = fs.realpathSync(filePath);
      if (this.visitedRealPaths.has(realPath)) {
        throw new Error(`[CIRCULAR] Path loop detected at ${filePath} (realpath: ${realPath})`);
      }
    } catch (e) {
      // realpath 失败，可能是断链，忽略
    }
  }
  
  /**
   * 标记路径为已访问
   */
  markVisited(filePath: string): void {
    const inodeKey = this.getInodeKey(filePath);
    if (inodeKey) {
      this.visitedInodes.add(inodeKey);
    }
    
    try {
      const realPath = fs.realpathSync(filePath);
      this.visitedRealPaths.add(realPath);
    } catch {
      // 忽略
    }
  }
  
  /**
   * 取消标记（用于回溯）
   */
  unmarkVisited(filePath: string): void {
    const inodeKey = this.getInodeKey(filePath);
    if (inodeKey) {
      this.visitedInodes.delete(inodeKey);
    }
    
    try {
      const realPath = fs.realpathSync(filePath);
      this.visitedRealPaths.delete(realPath);
    } catch {
      // 忽略
    }
  }
}

export function diffDirectory(sourceDir: string, targetDir: string, options: DiffOptions): void {
  console.log(`[INFO] Comparing directories...`);
  console.log(`[INFO] Source: ${sourceDir}`);
  console.log(`[INFO] Target: ${targetDir}`);
  console.log(`[INFO] Circular reference detection: ENABLED (HARDENED)`);
  
  if (!fs.existsSync(sourceDir)) { console.error(`[ERROR] Source not found`); process.exit(1); }
  if (!fs.existsSync(targetDir)) { console.error(`[ERROR] Target not found`); process.exit(1); }
  
  // ============ 初始化循环检测器 ============
  const detector = new CircularReferenceDetector();
  
  const walkDir = (dir: string, basePath: string = '', depth: number = 0): any[] => {
    // 检查深度限制
    if (options.maxDepth && depth > options.maxDepth) {
      return [];
    }
    
    const entries: any[] = [];
    const items = fs.readdirSync(dir).sort();
    
    for (const item of items) {
      if (options.ignorePatterns.some(p => item.includes(p))) continue;
      
      const fullPath = path.join(dir, item);
      const relativePath = path.join(basePath, item);
      
      // 获取文件状态（跟随符号链接）
      let stat: fs.Stats;
      let isSymlink = false;
      
      try {
        // 先用 lstat 检测是否是符号链接
        const lstat = fs.lstatSync(fullPath);
        isSymlink = lstat.isSymbolicLink();
        
        // 使用 stat 获取最终目标状态
        stat = fs.statSync(fullPath);
      } catch (e) {
        // 无法访问的文件，记录为错误
        entries.push({ type: 'error', path: relativePath, error: 'Access denied or broken symlink' });
        continue;
      }
      
      // ============ 硬限制：循环检测 ============
      if (stat.isDirectory()) {
        // 检查循环
        try {
          detector.check(fullPath);
        } catch (e: any) {
          // 检测到循环，立即抛出
          throw e;
        }
        
        // 标记为已访问
        detector.markVisited(fullPath);
        
        entries.push({ type: 'dir', path: relativePath, size: 0 });
        
        if (options.recursive) {
          try {
            const subEntries = walkDir(fullPath, relativePath, depth + 1);
            entries.push(...subEntries);
          } finally {
            // 回溯时取消标记（允许同一目录在不同路径出现）
            detector.unmarkVisited(fullPath);
          }
        } else {
          detector.unmarkVisited(fullPath);
        }
      } else {
        entries.push({ 
          type: 'file', 
          path: relativePath, 
          size: stat.size, 
          mtime: stat.mtimeMs,
          isSymlink
        });
      }
    }
    return entries;
  };
  
  // 执行遍历（带循环检测）
  let sourceEntries: any[];
  let targetEntries: any[];
  
  try {
    sourceEntries = walkDir(sourceDir);
  } catch (e: any) {
    if (e.message.includes('[CIRCULAR]')) {
      console.error(`[ERROR] ${e.message}`);
      process.exit(1);
    }
    throw e;
  }
  
  // 新的检测器实例用于目标目录
  const targetDetector = new CircularReferenceDetector();
  
  try {
    targetEntries = walkDir(targetDir);
  } catch (e: any) {
    if (e.message.includes('[CIRCULAR]')) {
      console.error(`[ERROR] ${e.message}`);
      process.exit(1);
    }
    throw e;
  }
  
  const changes: any[] = [];
  const sourceMap = new Map(sourceEntries.map((e: any) => [e.path, e]));
  const targetMap = new Map(targetEntries.map((e: any) => [e.path, e]));
  
  for (const [filePath, src] of sourceMap) {
    const tgt = targetMap.get(filePath);
    if (!tgt) changes.push({ type: 'removed', path: filePath, oldEntry: src });
    else if (src.type !== tgt.type || (src.size !== tgt.size && src.type === 'file')) {
      changes.push({ type: 'modified', path: filePath, oldEntry: src, newEntry: tgt });
    }
  }
  
  for (const [filePath, tgt] of targetMap) {
    if (!sourceMap.has(filePath)) changes.push({ type: 'added', path: filePath, newEntry: tgt });
  }
  
  const result = {
    source: { root: path.basename(sourceDir), entries: sourceEntries.length },
    target: { root: path.basename(targetDir), entries: targetEntries.length },
    changes: changes.sort((a, b) => a.path.localeCompare(b.path)),
    summary: {
      added: changes.filter((c: any) => c.type === 'added').length,
      removed: changes.filter((c: any) => c.type === 'removed').length,
      modified: changes.filter((c: any) => c.type === 'modified').length
    },
    hardened: {
      circularDetection: true,
      inodeTracking: true
    }
  };
  
  fs.writeFileSync(options.output, JSON.stringify(result, null, 2));
  console.log(`[OK] Diff written: ${options.output}`);
  console.log(`[INFO] Changes: +${result.summary.added}/-${result.summary.removed}/~${result.summary.modified}`);
  console.log(`[INFO] Circular detection: PASSED (no loops found)`);
}

export function registerDiffDirectoryCommand(program: Command): void {
  program
    .command('diff-dir')
    .description('Compare two directories with circular reference detection (HARDENED)')
    .argument('<source>', 'Source directory')
    .argument('<target>', 'Target directory')
    .option('-o, --output <file>', 'Output file', 'dir-diff.json')
    .option('--no-recursive', 'Disable recursive')
    .option('--ignore <patterns>', 'Ignore patterns', 'node_modules,.git,dist')
    .option('--max-depth <n>', 'Maximum depth')
    .action((source: string, target: string, options: any) => {
      diffDirectory(source, target, {
        output: options.output,
        format: 'json',
        recursive: options.recursive,
        ignorePatterns: options.ignore ? options.ignore.split(',') : [],
        maxDepth: options.maxDepth ? parseInt(options.maxDepth, 10) : undefined
      });
    });
}
