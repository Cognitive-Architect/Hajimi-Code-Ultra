# HAJIMI-APPS-AUDIT-001 审计报告（apps/：hajimi-cli + hajimi-bench）

- 包裹来源：apps.zip（审计输入）
- 生成时间(UTC)：2026-02-19T06:02:51Z
- 审计立场：独立代码事实核查（不改代码）

## 0. 执行摘要（3句话）

1) **准入判定：C（NO-GO）**，主要阻塞点是 bench 缺依赖 commander、以及 apps.zip 单独无法运行（缺 @hajimi/diff workspace 链接）。
2) 已声明的 4 项债务大体属实，但存在 **未声明的“可复现/可运行性债务”** 与 **大文件 OOM 风险**。
3) 安全面未发现明显命令注入，但存在可被用户触发的资源耗尽（DoS）与指标口径漂移风险。

## 1. Debt Integrity（债务诚实度）

### 1.1 债务清单补全表

| 债务ID | 组件 | 已声明? | 现状核查 | 建议等级 | 证据 |
|---|---|---:|---|---|---|
| DEBT-CLI-001 | CLI | ✅ | 与代码/README一致 | P1 | CLI-README.md / src/index.ts header |
| DEBT-CLI-002 | CLI | ✅ | 与代码/README一致 | P1 | CLI-README.md / src/index.ts |
| DEBT-BENCH-001 | Bench | ✅ | 与代码/README一致 | P1 | BENCH-README.md / orchestrator.ts header |
| DEBT-BENCH-002 | Bench | ✅ | 与代码/README一致 | P2 | BENCH-README.md / orchestrator.ts header |
| DEBT-CLI-003 | CLI | ❌ | **建议新增**：readFileSync 全量加载，大文件可能 OOM；需明确尺寸上限/改 stream | P1 | src/index.ts:41-42,104-105 |
| DEBT-CLI-004 | CLI | ❌ | **建议新增**：补丁格式含 timestamp 非确定性，影响可复现性 | P1 | src/index.ts:66 |
| DEBT-CLI-005 | CLI | ❌ | **建议新增**：错误码体系缺失，边界错误（EACCES/ENOSPC）体验弱 | P2 | src/index.ts:32-39,70,136 |
| DEBT-BENCH-003 | Bench | ❌ | **建议新增**：缺 commander 依赖/包不自洽，外部无法运行 | P1 | package.json missing commander; dist require fails |
| DEBT-BENCH-004 | Bench | ❌ | **建议新增**：统计学不严谨：单次运行、无方差/置信区间/去极值 | P2 | src/orchestrator.ts: single run loop |
| DEBT-BENCH-005 | Bench | ❌ | **建议新增**：内存指标不是真正 peak（heapUsed delta 可能为负，不含 external Buffer） | P2 | src/orchestrator.ts:115-140 |
| DEBT-BENCH-006 | Bench | ❌ | **建议新增**：README 口径含 zstd/80% 阈值与实现不一致 | P2 | BENCH-README.md Self-Tests |

### 1.2 债务影响评级与清偿优先级建议

- **P0（必须先修）**：DEBT-BENCH-003（bench 缺 commander 依赖/外部不可运行）；apps.zip 外部不可运行（缺 @hajimi/diff 链接）。
- **P1（应尽快修）**：大文件 OOM/全量加载（CLI/Bench）；非确定性 timestamp；README 指标口径漂移。
- **P2（可排期）**：错误码体系；bench 统计学增强；更真实的 peak memory 采集。

## 2. Architecture Compliance（架构合规性）

### 2.1 Monorepo 边界与依赖合规

- 未发现 apps/ 内通过 `import '../../packages/...'` 偷偷越界的相对路径；均通过 `@hajimi/diff` 引用。
- **但**：bench 没有把 `commander` 写进依赖（`src/index.ts` 直接 import），导致 dist 运行失败。

### 2.2 接口契约符合度评分（CLI/Bench → @hajimi/diff）

- 仅调用 `blake3_256(Buffer) -> Uint8Array`；项目内用 `src/types.d.ts` 手写声明。
- 风险点：若真实包导出签名变动，编译期不一定能捕获（因为是本地声明），运行期才炸。

**评分：B**（能用，但契约验证偏弱）

### 2.3 错误处理合规性（边界条件）

- CLI 对“文件不存在”有检查（existsSync），但对 **权限不足(EACCES)**、**磁盘满(ENOSPC)**、**输出目录不存在** 等没有统一策略与错误码。
- Bench 对 adapter compress/decompress 失败是 `continue`，会生成“部分结果”，可能掩盖失败率。

### 2.4 测试有效性与覆盖缺口

- CLI：6 个 E2E 测试覆盖 help/diff/apply/hash/缺文件。
- Bench：5 个测试覆盖 orchestrator 的核心逻辑，但 **没有测试内置 adapters（gzip/hajimi-diff）**。
- 缺口：invalid patch、权限/磁盘满、超大文件、并发写同一 output、bench 指标稳定性（多次运行）。

## 3. Risk Discovery（潜在风险挖掘）

### 3.1 风险矩阵（概率 × 影响）

| 风险 | 概率 | 影响 | 等级 | 说明 |
|---|---:|---:|---|---|
| 外部不可运行（缺依赖/缺 workspace 链接） | 高 | 高 | 🚨P0 | bench 缺 commander；@hajimi/diff 未随包提供，导致无法复现自测/基准。 |
| 大文件 OOM（readFileSync 全量加载） | 中-高 | 高 | ⚠️P1 | 用户给大文件即可触发内存爆炸/进程被 kill。 |
| 指标口径漂移（README 提 zstd/阈值，但实现无） | 中 | 中 | ⚠️P1 | 结果被误读，决策错误。 |
| 非确定性 timestamp（影响可复现） | 中 | 中 | ⚠️P1 | 同一输入每次产物不同，难以做基线 diff。 |
| 错误码缺失导致自动化难 | 中 | 低-中 | P2 | 下游难以稳定处理错误。 |

### 3.2 安全 PoC（如有）

- 未发现 shell 执行/命令注入路径（未使用 `exec` / `spawn` 执行业务命令）。
- **可触发 DoS 的最小 PoC（资源耗尽）**：给 CLI/Bench 输入超大文件，会在 `readFileSync` 处拉满内存。

```js
// 伪代码示意：创建超大文件后运行 hajimi diff
// node bigfile.js
const fs = require('fs');
const fd = fs.openSync('big.bin', 'w');
// 写入 2GB 0 字节（示意）
fs.writeSync(fd, Buffer.alloc(1024*1024), 0, 1024*1024, 0);
fs.closeSync(fd);
// 然后：hajimi diff big.bin big.bin -o patch.hdiff
```


## 4. Constructive Solutions（建设性方案）

### 4.1 Quick Win（1-2 天）

1) **补齐 bench 的 commander 依赖**，并在发布检查中加一条：`node dist/index.js --help` 必须可运行。
2) **明确外部审计包交付口径**：必须包含冻结版 `packages/hajimi-diff/`，或提供可安装 tarball，让 `@hajimi/diff` 可被 require。
3) 文案口径统一：把所有“SHA256”改为“BLAKE3-256”，并把 README 的 zstd/阈值改成真实基线。

### 4.2 Medium Effort（1-2 周）

1) **hajimi verify**：读取 patch，校验 magic/version/hash/size，并输出统一错误码（类似 `git fsck`）。
2) Bench 科学度：同一 case 多次运行，去极值，输出均值/标准差，至少给出 95% CI 的粗略估计。
3) 错误码体系：例如 `E1001` 文件不存在、`E1002` 权限、`E1003` 磁盘满、`E2001` patch 格式错误等。

### 4.3 Long Term（v1.1+）

1) Streaming 支持：把 CLI/Bench 的 readFileSync 改为 stream 管道，支持 >1GB。
2) 真实 peak memory：采集 `rss`/`external`，或使用采样方式，而不是 heapUsed delta。

## 5. v1.0 准入建议（Go/No-Go）

- 推荐判定：**C（NO-GO）**

### 阻塞项（必须修复后再评估）
- bench 缺 commander 依赖导致不可运行。
- 外部审计若只拿 apps.zip 无法运行（缺 @hajimi/diff workspace 链接/包）。

### 通过项（当前可接受）
- 未发现明显命令注入；核心逻辑较短，阅读成本低。
- CLI/Bench 的已声明债务与代码一致（主要是“原型/未优化”）。

## 附：关键证据片段（路径+行号）

### CLI：readFileSync + timestamp + SHA256 文案不一致

```text
  38 |         process.exit(1);
  39 |       }
  40 | 
  41 |       const oldData = fs.readFileSync(oldFile);
  42 |       const newData = fs.readFileSync(newFile);
  43 | 
  44 |       // DEBT-CLI-002: 原型阶段使用简化 diff
  45 |       // 实际应调用 packages/hajimi-diff CDC + zstd 实现
  46 |       console.log(`[INFO] Computing diff...`);
  47 |       console.log(`[INFO] Old file: ${oldFile} (${oldData.length} bytes)`);
  48 |       console.log(`[INFO] New file: ${newFile} (${newData.length} bytes)`);
  49 |       console.log(`[INFO] Algorithm: ${options.algorithm}`);
  50 | 
  51 |       // 原型：计算 BLAKE3 哈希用于一致性校验
  52 |       const oldHash = Buffer.from(blake3_256(oldData)).toString('hex');
  53 |       const newHash = Buffer.from(blake3_256(newData)).toString('hex');
  54 | 
  55 |       // 生成简化补丁格式（原型）
  56 |       const patch = {
  57 |         magic: 'HAJI',
  58 |         version: '0.9.1',
  59 |         algorithm: options.algorithm,
  60 |         oldHash,
  61 |         newHash,
  62 |         oldSize: oldData.length,
  63 |         newSize: newData.length,
  64 |         // 原型：存储完整新文件（实际应存储 CDC 分块 + zstd 压缩）
  65 |         data: newData.toString('base64'),
  66 |         timestamp: new Date().toISOString(),
  67 |       };
  68 | 
  69 |       const patchBuffer = Buffer.from(JSON.stringify(patch, null, 2));
  70 |       fs.writeFileSync(options.output, patchBuffer);
  71 | 
  72 |       const ratio = ((1 - patchBuffer.length / newData.length) * 100).toFixed(2);
  73 |       console.log(`[OK] Patch written: ${options.output}`);
  74 |       console.log(`[INFO] Patch size: ${patchBuffer.length} bytes`);
  75 |       console.log(`[INFO] New file size: ${newData.length} bytes`);
  76 |       console.log(`[INFO] "Compression" ratio: ${ratio}% (prototype format)`);
  77 |       console.log(`[WARN] DEBT-CLI-002: Using prototype format, not optimized CDC+zstd`);
  78 | 
```

```text
 134 |       // 原型：从补丁恢复数据
 135 |       const outputData = Buffer.from(patch.data, 'base64');
 136 |       fs.writeFileSync(options.output, outputData);
 137 | 
 138 |       // 验证输出哈希
 139 |       const outputHash = Buffer.from(blake3_256(outputData)).toString('hex');
 140 |       if (outputHash !== patch.newHash) {
 141 |         console.error('[ERROR] Output hash mismatch!');
 142 |         process.exit(1);
 143 |       }
 144 | 
 145 |       console.log(`[OK] Applied patch: ${options.output}`);
 146 |       console.log(`[INFO] Output size: ${outputData.length} bytes`);
 147 |       console.log(`[OK] SHA256 verification passed`);
 148 | 
```

### Bench：import commander + timestamp

```text
  13 | import * as fs from 'fs';
  14 | import * as path from 'path';
  15 | import { Command } from 'commander';
  16 | import { BenchmarkOrchestrator, Adapter } from './orchestrator';
  17 | import { blake3_256 } from '@hajimi/diff';
  18 | import * as zlib from 'zlib';
  19 | import { promisify } from 'util';
  20 | 
  21 | const gzip = promisify(zlib.gzip);
  22 | const gunzip = promisify(zlib.gunzip);
  23 | 
  24 | const program = new Command();
  25 | 
  26 | program
  27 |   .name('hajimi-bench')
  28 |   .description('Hajimi Benchmark Suite - Algorithm Arena')
  29 |   .version('1.0.0-alpha');
  30 | 
  31 | program
  32 |   .option('-a, --adapter <name>', 'Adapter to benchmark', 'hajimi-diff')
  33 |   .option('-d, --dataset <name>', 'Dataset to use', 'ai-chat')
  34 |   .option('--list-adapters', 'List available adapters')
  35 |   .option('--list-datasets', 'List available datasets')
  36 |   .option('-o, --output <file>', 'Output report file', 'results/benchmark-report.md')
  37 |   .option('--json <file>', 'Output JSON results', 'results/benchmark-results.json')
  38 |   .action(async (options: {
  39 |     adapter: string;
  40 |     dataset: string;
  41 |     listAdapters: boolean;
  42 |     listDatasets: boolean;
  43 |     output: string;
  44 |     json: string;
  45 |   }) => {
  46 |     const fixturesDir = path.join(__dirname, '..', 'fixtures');
  47 |     const orchestrator = new BenchmarkOrchestrator(fixturesDir);
  48 | 
  49 |     // Register adapters
  50 |     // 1. Hajimi-Diff (prototype)
  51 |     orchestrator.registerAdapter({
  52 |       name: 'hajimi-diff',
  53 |       version: '0.9.1-alpha',
  54 |       compress: async (input: Buffer) => {
  55 |         // DEBT-BENCH-001: 原型使用简单 JSON 格式，非优化 CDC+zstd
  56 |         const hash = Buffer.from(blake3_256(input)).toString('hex');
  57 |         const envelope = {
  58 |           magic: 'HAJI-BENCH',
  59 |           algorithm: 'prototype',
  60 |           hash,
  61 |           size: input.length,
  62 |           data: input.toString('base64'),
  63 |           timestamp: new Date().toISOString(),
  64 |         };
  65 |         return Buffer.from(JSON.stringify(envelope));
  66 |       },
  67 |       decompress: async (patch: Buffer, base: Buffer) => {
  68 |         const envelope = JSON.parse(patch.toString());
  69 |         return Buffer.from(envelope.data, 'base64');
  70 |       },
  71 |     });
  72 | 
  73 |     // 2. Raw (baseline - no compression)
  74 |     orchestrator.registerAdapter({
  75 |       name: 'raw',
```

### Orchestrator：正确性注释写 SHA256，但实际用 BLAKE3；memory 采集方式

```text
 111 | 
 112 |     for (const testCase of cases) {
 113 |       console.log(`[Benchmark] ${adapterName} / ${datasetName} / ${testCase.name}`);
 114 | 
 115 |       // Measure memory before
 116 |       const memBefore = process.memoryUsage();
 117 |       const startTime = performance.now();
 118 | 
 119 |       // Compress
 120 |       let patch: Buffer;
 121 |       try {
 122 |         patch = await adapter.compress(testCase.target);
 123 |       } catch (err) {
 124 |         console.error(`[ERROR] Compression failed: ${err}`);
 125 |         continue;
 126 |       }
 127 | 
 128 |       // Decompress
 129 |       let output: Buffer;
 130 |       try {
 131 |         output = await adapter.decompress(patch, testCase.base);
 132 |       } catch (err) {
 133 |         console.error(`[ERROR] Decompression failed: ${err}`);
 134 |         continue;
 135 |       }
 136 | 
 137 |       const durationMs = performance.now() - startTime;
 138 |       const memAfter = process.memoryUsage();
 139 |       const peakMemoryMb = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;
 140 | 
 141 |       // Verify correctness (SHA256 must match)
 142 |       const targetHash = Buffer.from(blake3_256(testCase.target)).toString('hex');
 143 |       const outputHash = Buffer.from(blake3_256(output)).toString('hex');
 144 |       const correctness = targetHash === outputHash;
 145 | 
 146 |       if (!correctness) {
 147 |         console.error(`[ERROR] Hash mismatch! Expected: ${targetHash}, Got: ${outputHash}`);
 148 |       }
 149 | 
 150 |       // Calculate metrics
 151 |       const compressionRatio = 1 - (patch.length / testCase.target.length);
 152 |       const speedMbps = (testCase.target.length / 1024 / 1024) / (durationMs / 1000);
 153 | 
 154 |       results.push({
 155 |         adapter: adapterName,
 156 |         dataset: datasetName,
 157 |         testCase: testCase.name,
 158 |         compressionRatio,
 159 |         speedMbps,
 160 |         peakMemoryMb,
 161 |         correctness,
 162 |         durationMs,
 163 |       });
 164 | 
 165 |       console.log(`[Result] Ratio: ${(compressionRatio * 100).toFixed(2)}%, Speed: ${speedMbps.toFixed(2)} MB/s, Correct: ${correctness}`);
```

## Receipts 索引

- `receipts/require_cli_dist.json`：require CLI dist 失败（缺 @hajimi/diff）。
- `receipts/require_bench_dist.json`：require Bench dist 失败（缺 commander）。
- `receipts/ls_apps.json`：审计输入文件清单（节选）。