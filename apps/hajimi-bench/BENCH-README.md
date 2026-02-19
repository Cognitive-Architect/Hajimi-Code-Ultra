# @hajimi/bench v1.0.0-alpha (BENCH-README.md)

Hajimi Benchmark Suite - Algorithm Arena (ID-129)

## Architecture

```
┌─────────────────────────────────────────────────────────────�?
�?                   Benchmark Arena                          �?
├──────────────┬───────────────────┬──────────────────────────�?
�?  选手�?     �?    考题�?       �?     裁判系统            �?
�? (Adapters)  �?   (Datasets)     �?  (Orchestrator)         �?
├──────────────┼───────────────────┼──────────────────────────�?
�?�?hajimi-diff�?�?ai-chat/        �?�?压缩率评�?             �?
�?�?gzip       �?�?code/           �?�?速度评分                �?
�?�?raw        �?�?git/            �?�?内存监控                �?
�?             �?�?extreme/        �?�?正确性校�?(BLAKE3-256)    �?
└──────────────┴───────────────────┴──────────────────────────�?
```

## Installation

```bash
npm install
npm run build
```

## Usage

### Run benchmark

```bash
npm run bench -- --adapter=hajimi-diff --dataset=ai-chat
```

### List adapters

```bash
npm run bench -- --list-adapters
```

### List datasets

```bash
npm run bench -- --list-datasets
```

## Adapter Interface

```typescript
interface Adapter {
  name: string;
  version: string;
  compress: (input: Buffer) => Promise<Buffer>;
  decompress: (patch: Buffer, base: Buffer) => Promise<Buffer>;
}
```

## Dataset Format

Datasets are stored in `fixtures/<dataset-name>/`:

```
fixtures/ai-chat/
├── base.txt      # Old content
└── target.txt    # New content
```

Or with multiple cases:

```
fixtures/ai-chat/
├── case1/
�?  ├── base.txt
�?  └── target.txt
└── case2/
    ├── base.txt
    └── target.txt
```

## Output

- Markdown report: `results/benchmark-report.md`
- JSON data: `results/benchmark-results.json`

## Known Debts

### DEBT-BENCH-001 (P1)
**仅支持内存测试，流式 >1GB 未实�?*

当前所有测试数据加载到内存中处理。大文件 (>1GB) 流式处理将在 v1.1 中实现�?

### DEBT-BENCH-002 (P2)
**单线程实现，多线程优化待实现**

当前实现为单线程。多线程并行测试将在后续版本实现�?

### DEBT-BENCH-003 (P0)
**文件大小限制 100MB，v1.1 改用 stream**

Bench 目前使用 fs.statSync 同步检查文件大小，限制 100MB。超大文件支持将在 v1.1 通过流式处理实现。

## Self-Tests

- `BENCH-FUNC-001`: `npm run bench -- --adapter=hajimi-diff --dataset=ai-chat` 执行无报�?
- `BENCH-FUNC-002`: 输出 JSON 包含 `compression_ratio`, `speed_mbps`, `correctness: true`
- `BENCH-FUNC-003`: Hajimi-Diff �?AI 对话场景压缩�?> 80%（对�?zstd�?
- `BENCH-DEBT-001`: README 声明大文件流式处理未实现
