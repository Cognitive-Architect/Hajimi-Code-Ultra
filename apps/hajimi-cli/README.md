# @hajimi/cli v1.0.0-alpha

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

当前 CLI 仅支持单文件 diff/apply。目录递归支持将在 v1.1 中实现。

### DEBT-CLI-002 (P1)
**原型格式，非优化 CDC+zstd**

当前实现使用简化 JSON 格式存储补丁。完整的 CDC (Content-Defined Chunking) + zstd 帧压缩将在后续版本实现。

## Self-Tests

```bash
npm test
```

测试覆盖：
- CLI-FUNC-001: `hajimi diff --help` 显示用法
- CLI-FUNC-002: `hajimi diff a.txt b.txt -o patch.hdiff` 生成有效补丁
- CLI-FUNC-003: `hajimi apply patch.hdiff a.txt -o c.txt` 后 SHA256 一致
