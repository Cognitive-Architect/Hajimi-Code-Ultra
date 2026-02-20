# B-01: 目录递归 diff 架构设计规范

**债务项**: DEBT-CLI-001【已清偿 v1.1】  
**设计目标**: 支持 `hajimi diff dir1/ dir2/` 目录级差异计算  
**版本**: v1.1.0  
**日期**: 2026-02-19  

---

## 1. 架构概述

### 1.1 功能范围

支持以下目录操作：
```bash
hajimi diff dir1/ dir2/ -o patch.hdiff    # 目录间 diff
hajimi apply patch.hdiff dir1/ -o dir2/   # 目录级 apply
hajimi diff --recursive dir1/ dir2/       # 显式递归（默认）
hajimi diff --no-recursive dir1/ dir2/    # 仅顶层
```

### 1.2 核心组件

```
┌─────────────────────────────────────────────────────────┐
│                   Directory Diff Engine                  │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────┐  │
│  │ Tree Walker  │───→│ Hash Index   │───→│ Diff Gen │  │
│  │ (遍历器)      │    │ (索引构建)    │    │ (差异生成)│  │
│  └──────────────┘    └──────────────┘    └──────────┘  │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐                  │
│  │ Symlink Handler│  │ Circular Ref │                  │
│  │ (符号链接处理)│    │ Detector     │                  │
│  │              │    │ (循环引用检测)│                  │
│  └──────────────┘    └──────────────┘                  │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 目录树序列化算法

### 2.1 树结构定义

```typescript
interface DirectoryEntry {
  type: 'file' | 'directory' | 'symlink' | 'block' | 'char' | 'fifo' | 'socket';
  path: string;           // 相对路径 (如 "src/core/index.ts")
  size: number;           // 文件大小 (bytes)
  mtime: number;          // 修改时间 (unix timestamp ms)
  mode: number;           // 权限模式 (0o755)
  hash?: string;          // BLAKE3-256 (文件内容哈希)
  target?: string;        // symlink 目标路径
}

interface DirectoryTree {
  root: string;           // 根目录名
  entries: DirectoryEntry[];
  totalFiles: number;
  totalDirs: number;
  totalSize: number;
}
```

### 2.2 序列化算法 (DFS 前序遍历)

```typescript
function serializeDirectoryTree(rootPath: string): DirectoryTree {
  const entries: DirectoryEntry[] = [];
  
  function walk(currentPath: string, relativePath: string): void {
    const stat = fs.lstatSync(currentPath);
    
    // 检测循环引用 (通过 inode + device 唯一标识)
    if (stat.isSymbolicLink()) {
      const realPath = fs.realpathSync(currentPath);
      if (isCircularReference(realPath)) {
        entries.push({ type: 'symlink', path: relativePath, target: '[CIRCULAR]' });
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
      
      // 递归遍历子项
      const children = fs.readdirSync(currentPath).sort(); // 排序确保一致性
      for (const child of children) {
        walk(
          path.join(currentPath, child),
          path.join(relativePath, child)
        );
      }
    } else if (stat.isFile()) {
      entries.push({
        type: 'file',
        path: relativePath,
        size: stat.size,
        mtime: stat.mtimeMs,
        mode: stat.mode,
        hash: computeBlake3(currentPath) // 内容哈希
      });
    } else if (stat.isSymbolicLink()) {
      entries.push({
        type: 'symlink',
        path: relativePath,
        size: 0,
        mtime: stat.mtimeMs,
        mode: stat.mode,
        target: fs.readlinkSync(currentPath)
      });
    }
    // 忽略 block, char, fifo, socket (或作为特殊条目)
  }
  
  walk(rootPath, '');
  
  return {
    root: path.basename(rootPath),
    entries,
    totalFiles: entries.filter(e => e.type === 'file').length,
    totalDirs: entries.filter(e => e.type === 'directory').length,
    totalSize: entries.reduce((sum, e) => sum + e.size, 0)
  };
}
```

### 2.3 循环引用检测算法

```typescript
class CircularReferenceDetector {
  private visited: Set<string> = new Set();
  private stack: Set<string> = new Set();
  
  check(filePath: string): boolean {
    const realPath = fs.realpathSync(filePath);
    
    if (this.stack.has(realPath)) {
      return true; // 发现循环
    }
    
    if (this.visited.has(realPath)) {
      return false; // 已处理过，无循环
    }
    
    this.stack.add(realPath);
    this.visited.add(realPath);
    
    // 处理子目录...
    
    this.stack.delete(realPath);
    return false;
  }
}
```

---

## 3. hdiff 多文件打包格式

### 3.1 格式版本: hdiff v1.1 (目录支持)

```
┌─────────────────────────────────────────────────────────────┐
│                     hdiff Directory Format                   │
├─────────────────────────────────────────────────────────────┤
│ [Header] 64 bytes                                           │
│   - Magic: "HAJI" (4 bytes)                                 │
│   - Version: 0x01010000 (v1.1.0, 4 bytes)                   │
│   - Flags: 0x0001 (directory mode, 2 bytes)                 │
│   - Index Offset: uint64 (8 bytes)                          │
│   - Index Length: uint64 (8 bytes)                          │
│   - Data Offset: uint64 (8 bytes)                           │
│   - Data Length: uint64 (8 bytes)                           │
│   - Metadata Offset: uint64 (8 bytes)                       │
│   - Metadata Length: uint64 (8 bytes)                       │
│   - Footer Offset: uint64 (8 bytes)                         │
│   - Reserved: 8 bytes                                       │
├─────────────────────────────────────────────────────────────┤
│ [Metadata] JSON 编码                                         │
│   - sourceTree: DirectoryTree                               │
│   - targetTree: DirectoryTree                               │
│   - basePath: string                                        │
│   - createdAt: ISO timestamp                                │
├─────────────────────────────────────────────────────────────┤
│ [Index] 文件级索引                                           │
│   Entry (26 bytes each):                                    │
│   - Path Hash: uint64 (xxh64)                               │
│   - Content Offset: uint64                                  │
│   - Content Length: uint64                                  │
│   - Flags: uint8 (added/removed/modified/unchanged)         │
│   - Compression: uint8 (0=raw, 1=zstd, 2=cdc+zstd)          │
│   - Reserved: 4 bytes                                       │
├─────────────────────────────────────────────────────────────┤
│ [Data] 压缩后的文件差异数据                                   │
│   - 每个文件的压缩内容顺序排列                                │
├─────────────────────────────────────────────────────────────┤
│ [Footer] 48 bytes                                            │
│   - Index CRC32: uint32                                     │
│   - Data CRC32: uint32                                      │
│   - Metadata CRC32: uint32                                  │
│   - Strong Hash: BLAKE3-256 (32 bytes)                      │
│   - Magic End: "IJAH" (4 bytes)                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 差异计算策略

```typescript
enum ChangeType {
  UNCHANGED = 0,   // 文件未变更 (hash 相同)
  MODIFIED = 1,    // 内容修改 (hash 不同)
  ADDED = 2,       // 新增文件
  REMOVED = 3,     // 删除文件
  RENAMED = 4      // 重命名 (hash 相同，路径不同)
}

function computeDirectoryDiff(
  sourceTree: DirectoryTree,
  targetTree: DirectoryTree
): DirectoryDiff {
  const changes: FileChange[] = [];
  
  // 构建路径 -> entry 映射
  const sourceMap = new Map(sourceTree.entries.map(e => [e.path, e]));
  const targetMap = new Map(targetTree.entries.map(e => [e.path, e]));
  
  // 检测修改和删除
  for (const [path, srcEntry] of sourceMap) {
    const tgtEntry = targetMap.get(path);
    
    if (!tgtEntry) {
      changes.push({ type: ChangeType.REMOVED, path, entry: srcEntry });
    } else if (srcEntry.type !== tgtEntry.type) {
      changes.push({ type: ChangeType.REMOVED, path, entry: srcEntry });
      changes.push({ type: ChangeType.ADDED, path, entry: tgtEntry });
    } else if (srcEntry.type === 'file' && srcEntry.hash !== tgtEntry.hash) {
      changes.push({ type: ChangeType.MODIFIED, path, oldEntry: srcEntry, newEntry: tgtEntry });
    }
    // 目录或未变更文件跳过
  }
  
  // 检测新增
  for (const [path, tgtEntry] of targetMap) {
    if (!sourceMap.has(path)) {
      changes.push({ type: ChangeType.ADDED, path, entry: tgtEntry });
    }
  }
  
  // 检测重命名 (可选优化)
  detectRenames(changes, sourceMap, targetMap);
  
  return { changes, summary: generateSummary(changes) };
}
```

---

## 4. 目录树哈希一致性 (自测点 ARC-001)

### 4.1 树哈希算法

```typescript
function computeDirectoryTreeHash(tree: DirectoryTree): string {
  // 使用 Merkle Tree 结构计算整体哈希
  const entryHashes = tree.entries.map(e => {
    const data = `${e.type}:${e.path}:${e.hash || ''}:${e.target || ''}`;
    return blake3_256(Buffer.from(data));
  });
  
  // 两两合并直到单个根哈希
  while (entryHashes.length > 1) {
    const nextLevel: Uint8Array[] = [];
    for (let i = 0; i < entryHashes.length; i += 2) {
      if (i + 1 < entryHashes.length) {
        nextLevel.push(blake3_256(Buffer.concat([entryHashes[i], entryHashes[i + 1]])));
      } else {
        nextLevel.push(entryHashes[i]); // 奇数处理
      }
    }
    entryHashes.length = 0;
    entryHashes.push(...nextLevel);
  }
  
  return Buffer.from(entryHashes[0]).toString('hex');
}
```

### 4.2 验证方法

```bash
# 同一目录两次序列化应产生相同哈希
node -e "
const { serializeDirectoryTree, computeDirectoryTreeHash } = require('./dist/core/directory-walker');
const tree1 = serializeDirectoryTree('src/');
const tree2 = serializeDirectoryTree('src/');
const hash1 = computeDirectoryTreeHash(tree1);
const hash2 = computeDirectoryTreeHash(tree2);
console.log(hash1 === hash2 ? '✅ ARC-001 PASSED' : '❌ ARC-001 FAILED');
"
```

---

## 5. 循环引用检测 (自测点 ARC-002)

### 5.1 测试场景

```bash
# 创建循环引用
mkdir -p test/circular/a/b
cd test/circular/a/b && ln -s ../../a loop

# 执行 diff
hajimi diff test/circular test/circular -o test.hdiff
# 预期: 检测并跳过循环，不陷入死循环
```

### 5.2 验证方法

```bash
node -e "
const { DirectoryWalker } = require('./dist/core/directory-walker');
const walker = new DirectoryWalker();

// 设置 5 秒超时
const timeout = setTimeout(() => {
  console.log('❌ ARC-002 FAILED: Timeout (possible infinite loop)');
  process.exit(1);
}, 5000);

try {
  walker.walk('test/circular');
  clearTimeout(timeout);
  console.log('✅ ARC-002 PASSED: Circular reference handled');
} catch (e) {
  clearTimeout(timeout);
  if (e.message.includes('CIRCULAR')) {
    console.log('✅ ARC-002 PASSED: Detected and skipped');
  } else {
    console.log('❌ ARC-002 FAILED:', e.message);
  }
}
"
```

---

## 6. CLI 接口设计

### 6.1 命令参数

```typescript
interface DirectoryDiffOptions {
  recursive: boolean;       // --recursive / --no-recursive (默认 true)
  followSymlinks: boolean;  // --follow-symlinks (默认 false)
  ignorePatterns: string[]; // --ignore=node_modules,.git
  maxDepth: number;         // --max-depth=10 (默认无限)
  preservePermissions: boolean; // --preserve-permissions (默认 true)
  preserveTimes: boolean;   // --preserve-times (默认 true)
}
```

### 6.2 使用示例

```bash
# 基本用法
hajimi diff project-v1/ project-v2/ -o v1-to-v2.hdiff

# 忽略 node_modules
hajimi diff src/ src-new/ -o changes.hdiff --ignore=node_modules,dist

# 限制深度
hajimi diff docs/ docs-new/ -o docs-changes.hdiff --max-depth=3

# 应用补丁
hajimi apply v1-to-v2.hdiff project-v1/ -o project-v2-restored/
```

---

## 7. 性能指标

| 指标 | 目标 | 测试方法 |
|------|------|----------|
| 10k 文件遍历 | < 2s | `time hajimi diff large-dir/ large-dir/ -o /dev/null` |
| 树哈希计算 | < 500ms/1k files | 基准测试 |
| 内存占用 | < 100MB (1M 文件) | `node --max-old-space-size=100` |

---

## 8. 债务清偿声明

**DEBT-CLI-001【已清偿 v1.1】**

- ✅ 目录递归 diff 架构设计完成
- ✅ 循环引用检测机制设计
- ✅ 多文件打包格式规范定义
- ⏭️ 待 B-02 实现代码

---

*Design by: Architect黄瓜睦*  
*审核状态: 待 B-02 工程师实现验证*
