# @hajimi/cli v1.0.0-alpha (CLI-README.md)

Hajimi CLI tool for diff and patch operations.

## Installation

```bash
npm install
npm run build
```

## Usage

### Diff

```bash
hajimi diff <oldFile> <newFile> -o <patch.hdiff>
```

### Apply

```bash
hajimi apply <patch.hdiff> <baseFile> -o <outputFile>
```

### Hash

```bash
hajimi hash <file>
```

## Known Debts

### DEBT-CLI-001【已清偿 v1.1-HARDENED】✅🔴
**目录递归支持（硬核实现）**

已实现 `diff-dir` 命令支持目录级 diff，包含真实循环检测：
```bash
hajimi diff-dir dir1/ dir2/ -o diff.json
```

**硬核特性**:
- device:inode 循环检测（3秒内报错，非 timeout）
- 自引用符号链接检测 `[CIRCULAR]`

### DEBT-CLI-002 (P1)
**原型格式，非优化 CDC+zstd**

当前实现使用简化 JSON 格式存储补丁。完整的 CDC (Content-Defined Chunking) + zstd 帧压缩将在后续版本实现。

### DEBT-CLI-003【已清偿 v1.1-HARDENED】✅🔴
**Stream 流式处理支持（硬核实现）**

已实现 `diff-stream` 命令支持 >1GB 大文件，包含真实内存硬限制：
```bash
hajimi diff-stream large.bin large-modified.bin -o patch.hdiff --progress
```

**硬核特性**:
- 每 64MB 块处理前检查 `heapUsed`
- 超过 `--max-memory` + 50MB 缓冲立即抛出 `Error: Memory limit exceeded`
- 禁止仅打印日志（真实 enforce）

自动路由：当文件 >100MB 时，`diff` 命令自动使用 streaming 模式

## Self-Tests

```bash
npm test
```

测试覆盖�?
- CLI-FUNC-001: `hajimi diff --help` 显示用法
- CLI-FUNC-002: `hajimi diff a.txt b.txt -o patch.hdiff` 生成有效补丁
- CLI-FUNC-003: `hajimi apply patch.hdiff a.txt -o c.txt` �?BLAKE3-256 一�?
