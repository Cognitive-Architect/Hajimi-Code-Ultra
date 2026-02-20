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

### DEBT-CLI-001【已清偿 v1.1-FIXED】✅
**目录递归支持**

已实现 `diff-dir` 命令支持目录级 diff：
```bash
hajimi diff-dir dir1/ dir2/ -o diff.json
```

### DEBT-CLI-002 (P1)
**原型格式，非优化 CDC+zstd**

当前实现使用简化 JSON 格式存储补丁。完整的 CDC (Content-Defined Chunking) + zstd 帧压缩将在后续版本实现。

### DEBT-CLI-003【已清偿 v1.1-FIXED】✅
**Stream 流式处理支持**

已实现 `diff-stream` 命令支持 >1GB 大文件：
```bash
hajimi diff-stream large.bin large-modified.bin -o patch.hdiff --progress
```

自动路由：当文件 >100MB 时，`diff` 命令自动使用 streaming 模式

## Self-Tests

```bash
npm test
```

测试覆盖�?
- CLI-FUNC-001: `hajimi diff --help` 显示用法
- CLI-FUNC-002: `hajimi diff a.txt b.txt -o patch.hdiff` 生成有效补丁
- CLI-FUNC-003: `hajimi apply patch.hdiff a.txt -o c.txt` �?BLAKE3-256 一�?
