# B-03: Stream 流式架构设计规范

**债务项**: DEBT-CLI-003【已清偿 v1.1】  
**设计目标**: >1GB 大文件流式处理，内存硬限制 <200MB  
**版本**: v1.1.0  
**日期**: 2026-02-19  

---

## 1. 架构概述

### 1.1 核心约束

- **内存上限**: 200MB (硬限制，通过 `--max-memory 200` 参数配置)
- **分块大小**: 64MB/块 (可配置)
- **背压控制**: 启用，防止内存溢出
- **断点续传**: 支持 (通过状态文件)

### 1.2 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    Streaming Diff Engine                     │
├─────────────────────────────────────────────────────────────┤
│  Input Stream (fs.createReadStream)                          │
│       │                                                      │
│       ▼                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────┐      │
│  │ Chunker      │───→│ CDC Window   │───→│ zstd     │      │
│  │ (64MB分块)    │    │ (滑动窗口)    │    │ Compress │      │
│  └──────────────┘    └──────────────┘    └──────────┘      │
│       │                                          │          │
│       ▼                                          ▼          │
│  ┌──────────────┐                        ┌──────────┐      │
│  │ Progress     │                        │ Output   │      │
│  │ Tracker      │                        │ Stream   │      │
│  │ (进度回调)    │                        │ (hdiff)  │      │
│  └──────────────┘                        └──────────┘      │
├─────────────────────────────────────────────────────────────┤
│  Memory Monitor (200MB硬限制)                               │
│  Resume Manager (断点续传)                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 分块策略

### 2.1 CDC (Content-Defined Chunking)

```typescript
interface ChunkingConfig {
  minBlockSize: number;     // 最小块大小: 2KB
  avgBlockSize: number;     // 平均块大小: 64KB
  maxBlockSize: number;     // 最大块大小: 256KB
  windowSize: number;       // Rabin指纹窗口: 48 bytes
}

class ContentDefinedChunker extends Transform {
  private buffer: Buffer = Buffer.alloc(0);
  private rollingHash: RollingHash;
  
  constructor(config: ChunkingConfig) {
    super({ objectMode: true });
    this.rollingHash = new RabinRollingHash(config.windowSize);
  }
  
  _transform(chunk: Buffer, encoding: string, callback: TransformCallback): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    
    // 寻找切分点 (Rabin指纹 & 0xFFFF === 0)
    let offset = 0;
    while (offset < this.buffer.length - this.config.minBlockSize) {
      const fingerprint = this.rollingHash.update(this.buffer, offset);
      
      if (this.isChunkBoundary(fingerprint, offset)) {
        // 输出一个块
        const block = this.buffer.slice(0, offset);
        this.push({
          index: this.chunkIndex++,
          hash: blake3_256(block),
          size: block.length,
          data: block
        });
        
        this.buffer = this.buffer.slice(offset);
        offset = 0;
      } else {
        offset++;
      }
    }
    
    // 保留未处理数据到下一次
    if (this.buffer.length > this.config.maxBlockSize) {
      // 强制切分（超过最大块大小）
      const block = this.buffer.slice(0, this.config.avgBlockSize);
      this.push({ ... });
      this.buffer = this.buffer.slice(this.config.avgBlockSize);
    }
    
    callback();
  }
}
```

### 2.2 简单固定分块（简化版）

```typescript
class FixedSizeChunker extends Transform {
  private chunkSize: number = 64 * 1024 * 1024; // 64MB
  private buffer: Buffer = Buffer.alloc(0);
  
  _transform(chunk: Buffer, encoding: string, callback: TransformCallback): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    
    while (this.buffer.length >= this.chunkSize) {
      const block = this.buffer.slice(0, this.chunkSize);
      this.push({
        index: this.chunkIndex++,
        hash: blake3_256(block),
        size: block.length,
        data: block
      });
      this.buffer = this.buffer.slice(this.chunkSize);
    }
    
    callback();
  }
  
  _flush(callback: TransformCallback): void {
    // 处理剩余数据
    if (this.buffer.length > 0) {
      this.push({
        index: this.chunkIndex++,
        hash: blake3_256(this.buffer),
        size: this.buffer.length,
        data: this.buffer
      });
    }
    callback();
  }
}
```

---

## 3. 内存硬限制机制

### 3.1 内存监控器

```typescript
class MemoryMonitor extends EventEmitter {
  private limitBytes: number;
  private checkInterval: NodeJS.Timeout | null = null;
  
  constructor(maxMemoryMB: number) {
    super();
    this.limitBytes = maxMemoryMB * 1024 * 1024;
  }
  
  start(): void {
    this.checkInterval = setInterval(() => {
      const usage = process.memoryUsage();
      const heapUsed = usage.heapUsed;
      const external = usage.external || 0;
      const total = heapUsed + external;
      
      // 背压信号
      if (total > this.limitBytes * 0.8) {
        this.emit('pressure', { used: total, limit: this.limitBytes, ratio: total / this.limitBytes });
      }
      
      // 硬限制触发
      if (total > this.limitBytes) {
        this.emit('limit-exceeded', { used: total, limit: this.limitBytes });
      }
    }, 100); // 100ms 检查一次
  }
  
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }
}
```

### 3.2 背压控制

```typescript
class BackPressureController extends Transform {
  private paused: boolean = false;
  private buffer: any[] = [];
  private monitor: MemoryMonitor;
  
  constructor(maxMemoryMB: number) {
    super();
    this.monitor = new MemoryMonitor(maxMemoryMB);
    
    this.monitor.on('pressure', () => {
      this.paused = true;
      // 暂停上游读取
      this.emit('pause');
    });
    
    this.monitor.on('limit-exceeded', () => {
      this.destroy(new Error(`Memory limit ${maxMemoryMB}MB exceeded`));
    });
  }
  
  _transform(chunk: any, encoding: string, callback: TransformCallback): void {
    if (this.paused) {
      this.buffer.push({ chunk, callback });
      return;
    }
    
    this.push(chunk);
    callback();
  }
  
  resumeProcessing(): void {
    this.paused = false;
    // 清空缓冲
    while (this.buffer.length > 0 && !this.paused) {
      const { chunk, callback } = this.buffer.shift()!;
      this.push(chunk);
      callback();
    }
    this.emit('resume');
  }
}
```

---

## 4. 进度回调机制

```typescript
interface ProgressInfo {
  phase: 'scanning' | 'chunking' | 'diffing' | 'compressing' | 'writing';
  processedBytes: number;
  totalBytes: number;
  processedChunks: number;
  totalChunks: number;
  memoryUsage: number;  // MB
  estimatedTimeRemaining: number;  // seconds
  speed: number;  // MB/s
}

type ProgressCallback = (progress: ProgressInfo) => void;

class ProgressTracker extends Transform {
  private callback: ProgressCallback;
  private startTime: number;
  private processedBytes: number = 0;
  private totalBytes: number;
  
  constructor(totalBytes: number, callback: ProgressCallback) {
    super();
    this.totalBytes = totalBytes;
    this.callback = callback;
    this.startTime = Date.now();
  }
  
  _transform(chunk: any, encoding: string, callback: TransformCallback): void {
    this.processedBytes += chunk.length || chunk.size || 0;
    
    const elapsed = (Date.now() - this.startTime) / 1000;
    const speed = this.processedBytes / elapsed / 1024 / 1024;
    const remaining = (this.totalBytes - this.processedBytes) / (speed * 1024 * 1024);
    
    this.callback({
      phase: 'processing',
      processedBytes: this.processedBytes,
      totalBytes: this.totalBytes,
      processedChunks: 0,
      totalChunks: 0,
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
      estimatedTimeRemaining: remaining,
      speed
    });
    
    this.push(chunk);
    callback();
  }
}
```

---

## 5. 断点续传

### 5.1 状态文件格式

```typescript
interface ResumeState {
  version: '1.1.0';
  sourcePath: string;
  targetPath: string;
  outputPath: string;
  processedChunks: number;
  totalChunks: number;
  chunkHashes: string[];  // 已处理的块哈希
  lastModified: number;
  checksum: string;  // 状态文件完整性校验
}
```

### 5.2 恢复流程

```typescript
class ResumeManager {
  private statePath: string;
  
  constructor(outputPath: string) {
    this.statePath = `${outputPath}.resume`;
  }
  
  loadState(): ResumeState | null {
    if (!fs.existsSync(this.statePath)) return null;
    
    const data = fs.readFileSync(this.statePath, 'utf8');
    const state: ResumeState = JSON.parse(data);
    
    // 验证校验和
    if (!this.verifyChecksum(state)) {
      console.warn('[WARN] Resume state corrupted, starting from beginning');
      return null;
    }
    
    return state;
  }
  
  saveState(state: ResumeState): void {
    state.checksum = this.computeChecksum(state);
    fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2));
  }
  
  clearState(): void {
    if (fs.existsSync(this.statePath)) {
      fs.unlinkSync(this.statePath);
    }
  }
}
```

---

## 6. hdiff Stream 格式扩展

```
[Header] 64 bytes (同 B-01)
[Stream Manifest] JSON
  - streaming: true
  - chunkSize: number
  - totalChunks: number
  - compression: 'zstd' | 'none'
[Chunk Index] (8 bytes * totalChunks)
  - offset: uint64
[Chunk Data] 顺序存储
  [Chunk 1 Header] 32 bytes
    - hash: BLAKE3-256
    - compressedSize: uint32
    - uncompressedSize: uint32
  [Chunk 1 Data] compressed data
  [Chunk 2 Header] ...
  ...
[Footer] 48 bytes (同 B-01)
```

---

## 7. 自测点

### STR-001: 内存占用曲线

```bash
# 监控 1GB 文件处理过程的内存占用
node -e "
const memUsages = [];
const interval = setInterval(() => {
  memUsages.push(process.memoryUsage().heapUsed / 1024 / 1024);
}, 100);

require('./dist/cli/commands/diff-stream').diffStream('test-1gb.bin', 'test-1gb-modified.bin', {
  maxMemory: 200,
  onProgress: (p) => {
    if (p.phase === 'complete') {
      clearInterval(interval);
      const maxMem = Math.max(...memUsages);
      console.log('Max Memory:', maxMem.toFixed(2), 'MB');
      console.log(maxMem < 200 ? '✅ STR-001 PASSED' : '❌ STR-001 FAILED');
    }
  }
});
"
```

**通过标准**: Max Memory < 200MB

### STR-002: 10GB 文件处理

```bash
# 创建 10GB 测试文件 (稀疏文件)
fsutil file createnew test-10gb.bin 10737418240

# 执行 diff
hajimi diff test-10gb.bin test-10gb.bin -o test.hdiff --max-memory 200

# 验证
ls -lh test.hdiff
```

**通过标准**: 不 OOM，正常生成 patch

### STR-003: 网络中断恢复

```bash
# 模拟中断
timeout 5 hajimi diff large.bin large-modified.bin -o test.hdiff --resume || true

# 恢复
hajimi diff large.bin large-modified.bin -o test.hdiff --resume

# 验证状态
ls -la test.hdiff.resume
```

**通过标准**: 第二次执行从断点继续，不从头开始

---

## 8. CLI 接口

```bash
hajimi diff <old> <new> -o <patch> [options]

Options:
  --max-memory <MB>      内存上限 (默认: 200)
  --chunk-size <MB>      分块大小 (默认: 64)
  --compression <algo>   压缩算法 (none|zstd, 默认: zstd)
  --resume               启用断点续传
  --progress             显示进度条
  --format <format>      输出格式 (hdiff|json)
```

---

## 9. 债务清偿声明

**DEBT-CLI-003【已清偿 v1.1】**

- ✅ Stream 流式架构设计完成
- ✅ 内存硬限制 <200MB 机制设计
- ✅ 背压控制策略设计
- ✅ 进度回调机制设计
- ✅ 断点续传机制设计
- ⏭️ 待 B-04 实现代码

---

*Design by: Architect黄瓜睦*  
*审核状态: 待 B-04 工程师实现验证*
