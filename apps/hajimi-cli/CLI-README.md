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

### DEBT-CLI-001 (P1)
**仅支持文件，不支持目录递归**

当前 CLI 仅支持单文件 diff/apply。目录递归支持将在 v1.1 中实现�?

### DEBT-CLI-002 (P1)
**原型格式，非优化 CDC+zstd**

当前实现使用简�?JSON 格式存储补丁。完整的 CDC (Content-Defined Chunking) + zstd 帧压缩将在后续版本实现�?

### DEBT-CLI-003 (P0)
**文件大小限制 100MB，v1.1 改用 stream**

当前实现使用 `readFileSync` 全量加载文件到内存，为避免大文件导致 OOM，设置了 100MB 上限。超过此限制的文件将被拒绝并提示错误�?

如需处理更大文件，请等待 v1.1 �?streaming 实现�?

## Self-Tests

```bash
npm test
```

测试覆盖�?
- CLI-FUNC-001: `hajimi diff --help` 显示用法
- CLI-FUNC-002: `hajimi diff a.txt b.txt -o patch.hdiff` 生成有效补丁
- CLI-FUNC-003: `hajimi apply patch.hdiff a.txt -o c.txt` �?BLAKE3-256 一�?
