/**
 * Diff Directory Command - 目录级差异比较
 * DEBT-CLI-001【已清偿 v1.1-FIXED】
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

export function diffDirectory(sourceDir: string, targetDir: string, options: DiffOptions): void {
  console.log(`[INFO] Comparing directories...`);
  console.log(`[INFO] Source: ${sourceDir}`);
  console.log(`[INFO] Target: ${targetDir}`);
  
  if (!fs.existsSync(sourceDir)) { console.error(`[ERROR] Source not found`); process.exit(1); }
  if (!fs.existsSync(targetDir)) { console.error(`[ERROR] Target not found`); process.exit(1); }
  
  const walkDir = (dir: string, basePath: string = ''): any[] => {
    const entries: any[] = [];
    const items = fs.readdirSync(dir).sort();
    
    for (const item of items) {
      if (options.ignorePatterns.some(p => item.includes(p))) continue;
      
      const fullPath = path.join(dir, item);
      const relativePath = path.join(basePath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        entries.push({ type: 'dir', path: relativePath, size: 0 });
        if (options.recursive) {
          entries.push(...walkDir(fullPath, relativePath));
        }
      } else {
        entries.push({ type: 'file', path: relativePath, size: stat.size, mtime: stat.mtimeMs });
      }
    }
    return entries;
  };
  
  const sourceEntries = walkDir(sourceDir);
  const targetEntries = walkDir(targetDir);
  
  const changes: any[] = [];
  const sourceMap = new Map(sourceEntries.map((e: any) => [e.path, e]));
  const targetMap = new Map(targetEntries.map((e: any) => [e.path, e]));
  
  for (const [path, src] of sourceMap) {
    const tgt = targetMap.get(path);
    if (!tgt) changes.push({ type: 'removed', path, oldEntry: src });
    else if (src.type !== tgt.type || (src.size !== tgt.size && src.type === 'file')) {
      changes.push({ type: 'modified', path, oldEntry: src, newEntry: tgt });
    }
  }
  
  for (const [path, tgt] of targetMap) {
    if (!sourceMap.has(path)) changes.push({ type: 'added', path, newEntry: tgt });
  }
  
  const result = {
    source: { root: path.basename(sourceDir), entries: sourceEntries.length },
    target: { root: path.basename(targetDir), entries: targetEntries.length },
    changes: changes.sort((a, b) => a.path.localeCompare(b.path)),
    summary: {
      added: changes.filter((c: any) => c.type === 'added').length,
      removed: changes.filter((c: any) => c.type === 'removed').length,
      modified: changes.filter((c: any) => c.type === 'modified').length
    }
  };
  
  fs.writeFileSync(options.output, JSON.stringify(result, null, 2));
  console.log(`[OK] Diff written: ${options.output}`);
  console.log(`[INFO] Changes: +${result.summary.added}/-${result.summary.removed}/~${result.summary.modified}`);
}

export function registerDiffDirectoryCommand(program: Command): void {
  program
    .command('diff-dir')
    .description('Compare two directories')
    .argument('<source>', 'Source directory')
    .argument('<target>', 'Target directory')
    .option('-o, --output <file>', 'Output file', 'dir-diff.json')
    .option('--no-recursive', 'Disable recursive')
    .option('--ignore <patterns>', 'Ignore patterns', 'node_modules,.git,dist')
    .action((source: string, target: string, options: any) => {
      diffDirectory(source, target, {
        output: options.output,
        format: 'json',
        recursive: options.recursive,
        ignorePatterns: options.ignore ? options.ignore.split(',') : []
      });
    });
}
