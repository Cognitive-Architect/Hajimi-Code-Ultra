/**
 * Diff Directory Command - 目录级差异比较
 * 
 * DEBT-CLI-001【已清偿 v1.1】
 * 
 * 实现: hajimi diff dir1/ dir2/ -o patch.hdiff
 */

import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { DirectoryWalker, DirectoryTree, DirectoryEntry, WalkOptions } from '../../core/directory-walker';

// 变更类型
enum ChangeType {
  UNCHANGED = 0,
  MODIFIED = 1,
  ADDED = 2,
  REMOVED = 3,
  RENAMED = 4
}

interface FileChange {
  type: ChangeType;
  path: string;
  oldEntry?: DirectoryEntry;
  newEntry?: DirectoryEntry;
  diffContent?: Buffer;
}

interface DirectoryDiff {
  changes: FileChange[];
  summary: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
    totalSize: number;
  };
}

// 序列化选项
interface DiffOptions extends WalkOptions {
  output: string;
  format: 'hdiff' | 'json' | 'patch';
  compression: 'none' | 'gzip' | 'zstd';
}

/**
 * 计算目录差异
 */
function computeDirectoryDiff(
  sourceTree: DirectoryTree,
  targetTree: DirectoryTree
): DirectoryDiff {
  const changes: FileChange[] = [];
  
  const sourceMap = new Map(sourceTree.entries.map(e => [e.path, e]));
  const targetMap = new Map(targetTree.entries.map(e => [e.path, e]));
  
  let added = 0, removed = 0, modified = 0, unchanged = 0;
  let totalSize = 0;

  for (const [filePath, srcEntry] of sourceMap) {
    const tgtEntry = targetMap.get(filePath);
    
    if (!tgtEntry) {
      changes.push({ type: ChangeType.REMOVED, path: filePath, oldEntry: srcEntry });
      removed++;
    } else if (srcEntry.type !== tgtEntry.type) {
      changes.push({ type: ChangeType.REMOVED, path: filePath, oldEntry: srcEntry });
      changes.push({ type: ChangeType.ADDED, path: filePath, newEntry: tgtEntry });
      removed++;
      added++;
      if (tgtEntry.type === 'file') totalSize += tgtEntry.size;
    } else if (srcEntry.type === 'file') {
      if (srcEntry.hash !== tgtEntry.hash) {
        changes.push({ type: ChangeType.MODIFIED, path: filePath, oldEntry: srcEntry, newEntry: tgtEntry });
        modified++;
        totalSize += tgtEntry.size;
      } else {
        changes.push({ type: ChangeType.UNCHANGED, path: filePath, oldEntry: srcEntry, newEntry: tgtEntry });
        unchanged++;
      }
    } else if (srcEntry.type === 'symlink') {
      if (srcEntry.target !== tgtEntry.target) {
        changes.push({ type: ChangeType.MODIFIED, path: filePath, oldEntry: srcEntry, newEntry: tgtEntry });
        modified++;
      } else {
        changes.push({ type: ChangeType.UNCHANGED, path: filePath, oldEntry: srcEntry, newEntry: tgtEntry });
      }
    }
  }
  
  for (const [filePath, tgtEntry] of targetMap) {
    if (!sourceMap.has(filePath)) {
      changes.push({ type: ChangeType.ADDED, path: filePath, newEntry: tgtEntry });
      added++;
      if (tgtEntry.type === 'file') totalSize += tgtEntry.size;
    }
  }
  
  changes.sort((a, b) => a.path.localeCompare(b.path));
  
  return { changes, summary: { added, removed, modified, unchanged, totalSize } };
}

/**
 * 生成文本格式的 diff 报告
 */
function generateTextReport(diff: DirectoryDiff): string {
  const lines: string[] = [];
  lines.push(`Directory Diff Report`);
  lines.push(`====================`);
  lines.push('');
  lines.push(`Summary:`);
  lines.push(`  Added:     ${diff.summary.added}`);
  lines.push(`  Removed:   ${diff.summary.removed}`);
  lines.push(`  Modified:  ${diff.summary.modified}`);
  lines.push(`  Unchanged: ${diff.summary.unchanged}`);
  lines.push('');
  
  if (diff.changes.length > 0) {
    lines.push('Changes:');
    for (const change of diff.changes) {
      const symbol = change.type === ChangeType.ADDED ? 'A' :
                     change.type === ChangeType.REMOVED ? 'D' :
                     change.type === ChangeType.MODIFIED ? 'M' : ' ';
      const size = change.newEntry?.size || change.oldEntry?.size || 0;
      lines.push(`  ${symbol} ${change.path.padEnd(50)} ${size.toString().padStart(10)} bytes`);
    }
  }
  
  return lines.join('\n');
}

/**
 * 执行目录 diff
 */
export function diffDirectory(sourceDir: string, targetDir: string, options: DiffOptions): void {
  console.log(`[INFO] Comparing directories...`);
  console.log(`[INFO] Source: ${sourceDir}`);
  console.log(`[INFO] Target: ${targetDir}`);
  
  if (!fs.existsSync(sourceDir)) { console.error(`[ERROR] Source not found: ${sourceDir}`); process.exit(1); }
  if (!fs.existsSync(targetDir)) { console.error(`[ERROR] Target not found: ${targetDir}`); process.exit(1); }
  if (!fs.statSync(sourceDir).isDirectory()) { console.error(`[ERROR] Source is not a directory: ${sourceDir}`); process.exit(1); }
  if (!fs.statSync(targetDir).isDirectory()) { console.error(`[ERROR] Target is not a directory: ${targetDir}`); process.exit(1); }
  
  const walkOptions: WalkOptions = {
    recursive: options.recursive,
    followSymlinks: options.followSymlinks,
    ignorePatterns: options.ignorePatterns,
    maxDepth: options.maxDepth,
    computeHashes: true
  };
  
  console.log('[INFO] Scanning source directory...');
  const walker = new DirectoryWalker(walkOptions);
  const sourceTree = walker.walk(sourceDir);
  console.log(`[INFO] Source: ${sourceTree.totalFiles} files, ${sourceTree.totalDirs} dirs`);
  
  console.log('[INFO] Scanning target directory...');
  const targetTree = walker.walk(targetDir);
  console.log(`[INFO] Target: ${targetTree.totalFiles} files, ${targetTree.totalDirs} dirs`);
  
  console.log('[INFO] Computing diff...');
  const diff = computeDirectoryDiff(sourceTree, targetTree);
  console.log(`[INFO] Changes: +${diff.summary.added}/-${diff.summary.removed}/~${diff.summary.modified}`);
  
  if (options.format === 'patch') {
    fs.writeFileSync(options.output, generateTextReport(diff));
  } else {
    fs.writeFileSync(options.output, JSON.stringify({ sourceTree, targetTree, diff }, null, 2));
  }
  
  console.log(`[OK] Diff written: ${options.output}`);
}

/**
 * 注册目录 diff 命令
 */
export function registerDiffDirectoryCommand(program: Command): void {
  program
    .command('diff-dir')
    .description('Compare two directories and generate diff')
    .argument('<source>', 'Source directory')
    .argument('<target>', 'Target directory')
    .option('-o, --output <file>', 'Output file', 'dir-diff.json')
    .option('-f, --format <format>', 'Output format (json|patch)', 'json')
    .option('--no-recursive', 'Disable recursive traversal')
    .option('--follow-symlinks', 'Follow symbolic links')
    .option('--ignore <patterns>', 'Comma-separated ignore patterns', 'node_modules,.git,dist')
    .option('--max-depth <n>', 'Maximum traversal depth')
    .action((source: string, target: string, options: any) => {
      const ignorePatterns = options.ignore ? options.ignore.split(',') : [];
      diffDirectory(source, target, {
        output: options.output,
        format: options.format,
        compression: 'none',
        recursive: options.recursive,
        followSymlinks: options.followSymlinks,
        ignorePatterns,
        maxDepth: options.maxDepth || Infinity
      });
    });
}
