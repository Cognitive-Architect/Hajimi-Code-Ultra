# Zstd压缩层设计文档 v1.0

**工单**: B-04/09 - 压缩层集成  
**负责人**: 唐音-工程师人格  
**日期**: 2026-02-21  
**状态**: 设计完成 / 待实现

---

## 1. 设计目标

集成zstd压缩算法，实现分层压缩策略，平衡压缩比与解压速度，满足Hajimi存储系统的性能需求。

---

## 2. 压缩策略分层

### 2.1 三层压缩策略

| 数据类型 | 压缩级别 | 策略说明 | 适用场景 |
|---------|---------|---------|---------|
| 元数据 (指令集) | Level 1-3 | 快速解压优先 | 频繁读取的索引、命令等 |
| 内容数据 (Add Blob) | Level 12-19 | 体积优先 | 大文件内容、历史版本 |
| 小文件 (<4KB) | Level 0 | 不压缩 | 避免压缩开销 |

### 2.2 策略选择逻辑

```
if (dataSize < 4096) {
    return NO_COMPRESSION;  // 小文件优化
}

switch (dataType) {
    case 'metadata':
        return { level: 1-3, strategy: 'fast' };
    case 'content':
        return { level: 12-19, strategy: 'max' };
    default:
        return { level: 3, strategy: 'default' };
}
```

---

## 3. 压缩标志位 (基于B-03格式规范)

```
┌─────────────────────────────────────────────────────────┐
│  压缩标志位 (1 byte)                                     │
├─────┬─────┬────────────────────────────────────────────┤
│ Bit │ 值  │ 含义                                         │
├─────┼─────┼────────────────────────────────────────────┤
│ 7   │ 0/1 │ 压缩使能 (0=未压缩, 1=已压缩)               │
│ 6-4 │ 000 │ 压缩算法 (000=zstd, 001-111=预留)           │
│ 3-0 │ xxxx│ 压缩级别标识 (0-15映射到实际level)           │
└─────┴─────┴────────────────────────────────────────────┘
```

### 标志位值表

| 标志值 | 含义 |
|-------|------|
| 0x00 | 未压缩 |
| 0x80-0x8F | zstd level 1-15 |
| 0x90-0x9F | zstd level 16-22 (扩展) |
| 0xA0-0xFF | 预留 |

---

## 4. 架构设计

### 4.1 类图

```
┌─────────────────────────────────────────────┐
│           ZstdCompressor                     │
├─────────────────────────────────────────────┤
│ - codec: ZstdCodec                           │
│ - strategy: CompressionStrategy              │
├─────────────────────────────────────────────┤
│ + compress(data, level): Promise<Buffer>     │
│ + decompress(data): Promise<Buffer>          │
│ + compressStream(level): TransformStream     │
│ + decompressStream(): TransformStream        │
│ + compressWithStrategy(data, type): Buffer   │
└─────────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│FastStrategy  │ │MaxStrategy│ │ NoCompression│
│(meta)        │ │(content) │ │(<4KB)        │
│level 1-3     │ │level 12-19│ │              │
└──────────────┘ └──────────┘ └──────────────┘
```

### 4.2 模块依赖

```
zstd-wrapper.js
    ├── zstd-codec (npm) / @bokuweb/zstd-wasm
    ├── stream (Node.js built-in)
    └── events (Node.js built-in)
```

---

## 5. API接口定义

### 5.1 核心API

```typescript
interface CompressionResult {
    data: Buffer;           // 压缩后数据
    originalSize: number;   // 原始大小
    compressedSize: number; // 压缩后大小
    level: number;          // 使用级别
    ratio: number;          // 压缩比
}

interface CompressOptions {
    level?: number;         // 压缩级别 1-22
    strategy?: 'fast' | 'default' | 'max' | 'auto';
    progressCallback?: (percent: number) => void;
}

class ZstdCompressor {
    // 同步压缩 (小数据)
    compress(data: Buffer | string, level?: number): Buffer;
    
    // 异步压缩 (大数据)
    compressAsync(data: Buffer | string, options?: CompressOptions): Promise<CompressionResult>;
    
    // 解压
    decompress(data: Buffer): Buffer;
    decompressAsync(data: Buffer): Promise<Buffer>;
    
    // 流式处理
    createCompressStream(level?: number): TransformStream;
    createDecompressStream(): TransformStream;
    
    // 智能压缩 (根据数据类型自动选择策略)
    compressSmart(data: Buffer, dataType: 'metadata' | 'content'): CompressionResult;
}
```

### 5.2 压缩级别映射

```javascript
const LEVEL_MAP = {
    // 元数据 - 快速解压
    meta: { min: 1, max: 3, default: 1 },
    
    // 内容数据 - 体积优先
    content: { min: 12, max: 19, default: 15 },
    
    // 小文件 - 不压缩
    small: { min: 0, max: 0, default: 0, threshold: 4096 }
};
```

---

## 6. 错误处理与降级

### 6.1 损坏数据处理 (NG-003)

```javascript
class CompressionError extends Error {
    constructor(code, message, recoverable = false) {
        super(message);
        this.code = code;
        this.recoverable = recoverable;
    }
}

// 错误码定义
const ERROR_CODES = {
    CORRUPTED_DATA: 'COMP-001',    // 数据损坏 - 尝试恢复
    INVALID_LEVEL: 'COMP-002',     // 无效级别 - 降级到default
    MEMORY_LIMIT: 'COMP-003',      // 内存限制 - 切换流式处理
    WASM_LOAD: 'COMP-004'          // WASM加载失败 - 使用JS fallback
};
```

### 6.2 降级策略

| 场景 | 降级行为 |
|-----|---------|
| WASM加载失败 | 使用纯JS实现 (压缩比降低) |
| 压缩失败 | 返回原始数据，记录警告 |
| 解压失败 | 尝试部分解压，返回可用数据 |
| 内存不足 | 自动切换流式处理 |

---

## 7. 性能基准

### 7.1 目标指标

| 指标 | 目标值 | 测试数据 |
|-----|-------|---------|
| 压缩速度 (L3) | >200 MB/s | 1GB随机数据 |
| 解压速度 | >500 MB/s | 任意级别 |
| 压缩比 (L15) | >3.0x | 文本文件 |
| 内存占用 | <100MB | 流式处理 |
| 小文件开销 | <1% | <4KB文件 |

### 7.2 级别对比

| Level | 压缩比 | 速度 | 适用 |
|------|-------|------|-----|
| 1 | 2.5x | 450MB/s | 元数据 |
| 3 | 2.8x | 350MB/s | 默认 |
| 12 | 3.2x | 80MB/s | 内容 |
| 15 | 3.5x | 50MB/s | 推荐 |
| 19 | 3.8x | 15MB/s | 最大压缩 |

---

## 8. 自测点实现

### CF-005: zstd压缩/解压集成
- [ ] 基础压缩/解压功能测试
- [ ] 边界值测试 (空数据、大文件)
- [ ] 跨平台兼容性测试

### RG-003: 压缩级别动态调整
- [ ] 小文件(<4KB)自动跳过压缩
- [ ] 元数据使用fast级别
- [ ] 内容数据使用max级别

### NG-003: 损坏数据优雅降级
- [ ] 无效数据返回原始内容
- [ ] 部分损坏尝试恢复
- [ ] 错误日志记录

### UX-001: 压缩进度回调API
- [ ] 流式处理进度回调
- [ ] 批量处理进度报告
- [ ] 取消操作支持

---

## 9. 技术债务声明

### DEBT-COMP-001: WASM优化 (P2)
- **描述**: 当前使用zstd-codec，WASM版本可提升20-30%性能
- **影响**: 压缩/解压速度
- **计划**: v1.6.0迭代实现
- **工作量**: 3天

### DEBT-COMP-002: 硬件加速调研 (P3)
- **描述**: Intel QAT、AES-NI等硬件加速方案调研
- **影响**: 大规模部署性能
- **计划**: v2.0技术预研
- **工作量**: 5天

---

## 10. 依赖项

```json
{
    "dependencies": {
        "zstd-codec": "^0.1.2",
        "@bokuweb/zstd-wasm": "^0.0.22"
    },
    "devDependencies": {
        "benchmark": "^2.1.4"
    }
}
```

---

## 11. 参考文档

1. [Zstd官方文档](https://facebook.github.io/zstd/) - Compression Levels 1-22
2. B-03格式规范 - 压缩标志位预留
3. Node.js zstd库对比: zstd-codec vs zstd-wasm

---

**文档版本**: v1.0  
**最后更新**: 2026-02-21  
**审核状态**: 待审核
