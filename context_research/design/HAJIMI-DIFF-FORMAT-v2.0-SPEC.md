# HAJIMI-DIFF 容器格式规范 v2.0

**工单编号**: B-03/09  
**版本**: 2.0.0  
**状态**: 草案 → 冻结  
**创建日期**: 2026-02-20  
**作者**: Soyorin-PM (PM人格)

---

## 1. 版本演进与兼容性声明

### 1.1 版本历史

| 版本 | 魔数 | 状态 | 关键特性 |
|------|------|------|----------|
| v0.9.1 | `HAJI` | 冻结 | 基础分块+SHA-256/BLAKE3校验 |
| v1.1.0 | `H1DF` | 维护 | 流式处理+压缩支持 |
| **v2.0** | `HDIF` | **草案** | CDC-Rabin+BLAKE3-256+指令集优化 |

### 1.2 兼容性策略

- **向后兼容**: v2.0解析器可识别v1.1.0/v0.9.1魔数并降级处理
- **向前不兼容**: v1.1.0解析器遇到`HDIF`魔数应报错：`ERR_UNSUPPORTED_VERSION`
- **独立演进**: v2.0格式独立于v1.x系列，不共享内部结构

### 1.3 与v1.1.0的关键差异

| 特性 | v1.1.0 | v2.0 | 说明 |
|------|--------|------|------|
| Magic | `H1DF` | `HDIF` | 新魔数避免混淆 |
| 分块算法 | 固定大小(64KB) | CDC-Rabin | 内容定义分块，重复数据检测更优 |
| 指令集 | 无(原始字节) | Add/Copy/Run | 显式指令编码，解析效率提升 |
| 校验算法 | BLAKE3-256 | BLAKE3-256 | 保持一致，32字节输出 |
| 压缩 | 可选gzip/zstd | 强制zstd | zstd压缩比与速度更优 |
| Footer结构 | 48字节固定 | 100字节固定 | 三哈希+双魔数 |
| Varint编码 | 不支持 | Protobuf风格 | 节省小数值空间 |

---

## 2. 二进制格式规范

### 2.1 文件整体结构

```
┌─────────────────────────────────────────────────────────────┐
│                        Header (7 bytes)                      │
│  ┌─────────┬─────────┬───────┬─────────────┐                │
│  │ Magic   │ Version │ Flags │ AlgorithmID │                │
│  │ 4 bytes │ 1 byte  │1 byte │  1 byte     │                │
│  │ "HDIF"  │  0x20   │ 0x01  │  0x01       │                │
│  └─────────┴─────────┴───────┴─────────────┘                │
├─────────────────────────────────────────────────────────────┤
│                    Block Metadata (变长)                     │
│  ┌────────────────┬────────────────┬────────────────┐       │
│  │ OldBlockCount  │ NewBlockCount  │ BlockSizeHint  │       │
│  │    varint      │    varint      │   2 bytes      │       │
│  └────────────────┴────────────────┴────────────────┘       │
├─────────────────────────────────────────────────────────────┤
│                    Instructions (变长)                       │
│  ┌────────────────────────────────────────────────────┐     │
│  │ InstructionCount (varint)                          │     │
│  │ CompressedInstructionStream (zstd压缩)             │     │
│  │   ├─ Type (2 bits): 00=Add, 01=Copy, 10=Run, 11=Rsrv│    │
│  │   ├─ Offset (varint, 相对于块索引)                  │     │
│  │   ├─ Length (varint, 字节数或块数)                  │     │
│  │   └─ [DataRef for Add: offset_in_payload, length]   │     │
│  └────────────────────────────────────────────────────┘     │
├─────────────────────────────────────────────────────────────┤
│                      Payload (变长)                          │
│  ┌────────────────────────────────────────────────────┐     │
│  │ AddDataBlob (zstd压缩后的新增数据)                  │     │
│  │ 实际字节数据，由Add指令引用                         │     │
│  └────────────────────────────────────────────────────┘     │
├─────────────────────────────────────────────────────────────┤
│                     Footer (100 bytes)                       │
│  ┌────────────────────────────────────────────────────┐     │
│  │ OldFileHash  (32 bytes): BLAKE3-256(old_file)      │     │
│  │ NewFileHash  (32 bytes): BLAKE3-256(new_file)      │     │
│  │ PatchHash    (32 bytes): BLAKE3-256(Header~Payload)│     │
│  │ FooterMagic  (4 bytes): "FEND"                     │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 详细字段定义

#### 2.2.1 Header (7 bytes)

| 字段 | 偏移 | 长度 | 值/说明 |
|------|------|------|---------|
| Magic | 0 | 4 | `0x48 0x44 0x49 0x46` (ASCII "HDIF") |
| Version | 4 | 1 | `0x20` (版本2.0，十六进制编码) |
| Flags | 5 | 1 | 位掩码，见下表 |
| AlgorithmID | 6 | 1 | `0x01` = CDC-Rabin-BLAKE3 |

**Flags位定义**:

```
Bit 0: COMPRESSED  = 1 (强制zstd压缩，保留位用于未来算法)
Bit 1: CHECKSUM    = 1 (启用额外校验层)
Bit 2: EXTENDED    = 0 (保留，用于未来扩展)
Bit 3: ENCRYPTED   = 0 (保留，用于未来加密支持)
Bit 4-7: Reserved  = 0
```

默认值: `0x03` (COMPRESSED | CHECKSUM)

#### 2.2.2 Algorithm ID注册表

| ID | 算法组合 | 状态 |
|----|----------|------|
| 0x00 | 保留/未指定 | - |
| 0x01 | CDC-Rabin + BLAKE3-256 | 标准 |
| 0x02-0x0F | 保留用于未来CDC变体 | 预留 |
| 0x10-0x1F | 保留用于固定块算法 | 预留 |
| 0x20-0xFF | 用户自定义/实验性 | 扩展 |

#### 2.2.3 Block Metadata

```c
struct BlockMetadata {
    uint64_t old_block_count;   // varint编码
    uint64_t new_block_count;   // varint编码
    uint16_t block_size_hint;   // 默认8192 (8KB)，小端序
};
```

**说明**:
- `block_size_hint`: CDC目标平均块大小，非严格限制
- Rabin指纹参数：窗口大小48字节，多项式`0x3DA26E40577532D1`

#### 2.2.4 Instructions

**指令编码格式**:

```
┌──────────────────────────────────────────────────────────┐
│ Instruction Header (1 byte)                              │
│ ┌──────┬──────┬────────────────────────────────────────┐ │
│ │ Type │ Len  │ 扩展标志                                 │ │
│ │2 bits│2 bits│ 4 bits                                 │ │
│ └──────┴──────┴────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────┤
│ Type-Specific Data                                       │
└──────────────────────────────────────────────────────────┘
```

**指令类型表**:

| 类型码 | 名称 | 描述 | 后续字段 |
|--------|------|------|----------|
| `00` | Add | 从Payload添加新数据 | `data_offset: varint`, `data_length: varint` |
| `01` | Copy | 从旧文件复制数据 | `block_index: varint`, `block_count: varint` |
| `10` | Run | RLE编码(重复字节) | `fill_byte: 1 byte`, `run_length: varint` |
| `11` | Reserved | 保留扩展 | - |

**Add指令** (类型=00):
```
┌─────────────┬──────────────────┬──────────────────┐
│ Type(2bits) │ DataOffset       │ DataLength       │
│   00        │    varint        │    varint        │
└─────────────┴──────────────────┴──────────────────┘
含义: 从Payload的DataOffset处复制DataLength字节到新文件
```

**Copy指令** (类型=01):
```
┌─────────────┬──────────────────┬──────────────────┐
│ Type(2bits) │ BlockIndex       │ BlockCount       │
│   01        │    varint        │    varint        │
└─────────────┴──────────────────┴──────────────────┘
含义: 从旧文件的BlockIndex块开始，复制BlockCount个块
```

**Run指令** (类型=10):
```
┌─────────────┬───────────┬──────────────────┐
│ Type(2bits) │ FillByte  │ RunLength        │
│   10        │  1 byte   │    varint        │
└─────────────┴───────────┴──────────────────┘
含义: 在新文件中写入RunLength个FillByte字节
```

### 2.3 Varint编码规范

采用Protocol Buffers Base 128 Varints编码:

```
编码规则:
- 每字节使用低7位存储数据
- 最高位为1表示后续还有字节
- 小端序(先存储低7位)

示例:
值 1    → 0x01
值 127  → 0x7F
值 128  → 0x80 0x01  (10000000 00000001)
值 16383→ 0xFF 0x7F  (11111111 01111111)

最大支持: 64位无符号整数 (最多10字节)
```

**编码伪代码**:
```python
def encode_varint(value: int) -> bytes:
    result = []
    while value > 0x7F:
        result.append((value & 0x7F) | 0x80)
        value >>= 7
    result.append(value)
    return bytes(result)

def decode_varint(data: bytes, pos: int) -> (int, int):
    result = 0
    shift = 0
    while True:
        byte = data[pos]
        result |= (byte & 0x7F) << shift
        pos += 1
        if not (byte & 0x80):
            break
        shift += 7
    return result, pos
```

### 2.4 Footer (100 bytes)

```c
struct Footer {
    uint8_t  old_file_hash[32];   // BLAKE3-256(原始旧文件)
    uint8_t  new_file_hash[32];   // BLAKE3-256(目标新文件)
    uint8_t  patch_hash[32];      // BLAKE3-256(Header+Metadata+Instructions+Payload)
    uint8_t  footer_magic[4];     // "FEND" (0x46 0x45 0x4E 0x44)
};
```

**PatchHash计算范围**:
- 起始: Header第一个字节 (Magic[0])
- 结束: Payload最后一个字节
- **不包括**: Footer本身

---

## 3. 编码示例

### 3.1 示例1: 小文件完全新增

场景: 旧文件为空，新文件内容"Hello"

```
[Header]
48 44 49 46  | "HDIF" Magic
20           | Version 2.0
03           | Flags: COMPRESSED|CHECKSUM
01           | Algorithm: CDC-Rabin-BLAKE3

[Block Metadata]
00           | OldBlockCount = 0 (varint)
01           | NewBlockCount = 1 (varint)
00 20        | BlockSizeHint = 8192 (小端)

[Instructions - 压缩前]
01           | InstructionCount = 1
00           | Add指令类型(00)
00           | DataOffset = 0
05           | DataLength = 5

[Payload - zstd压缩]
48 65 6C 6C 6F | "Hello" (压缩前5字节)
...zstd压缩后可能更短...

[Footer]
<32 bytes>   | OldFileHash = BLAKE3-256("") = 特殊空值
<32 bytes>   | NewFileHash = BLAKE3-256("Hello")
<32 bytes>   | PatchHash = BLAKE3-256(Header~Payload)
46 45 4E 44  | "FEND" Footer Magic
```

### 3.2 示例2: 部分内容复用

场景: 旧文件"ABCDEFGH"，新文件"ABCXYZGH"

```
[分析]
- 旧文件分块: [ABC][DEF][GH] (假设3字节/块，演示用)
- 新文件分块: [ABC][XYZ][GH]
- 匹配: 块0(ABC), 块2(GH)
- 新增: 块1(XYZ)

[Instructions]
03           | InstructionCount = 3
01 00 01     | Copy: BlockIndex=0, BlockCount=1 (复制ABC)
00 00 03     | Add: DataOffset=0, DataLength=3 (添加XYZ)
01 02 01     | Copy: BlockIndex=2, BlockCount=1 (复制GH)

[Payload]
58 59 5A     | "XYZ"
```

### 3.3 示例3: 包含Run指令

场景: 新文件包含大量零填充区域

```
[Instructions]
02           | InstructionCount = 2
00 00 0A     | Add: 添加10字节数据
10 00 64     | Run: FillByte=0x00, RunLength=100 (100个零字节)
```

---

## 4. 自测点验证

### 4.1 CF-004: .hdiff生成与解析往返测试

**测试目标**: 验证.hdiff文件可被正确生成和解析

**测试步骤**:
```typescript
async function testRoundTrip() {
    // 准备测试文件
    const oldFile = generateTestFile('old.bin', 1024 * 1024);  // 1MB
    const newFile = mutateFile(oldFile, mutationRate: 0.1);     // 10%变异
    
    // 生成diff
    const patch = await createHdiffV2(oldFile, newFile);
    fs.writeFileSync('test.hdiff', patch);
    
    // 解析并应用
    const parsed = parseHdiffV2(patch);
    const reconstructed = await applyPatch(oldFile, parsed);
    
    // 验证
    assert(blake3_256(reconstructed) === blake3_256(newFile));
    assert(parsed.footer.newFileHash === blake3_256(newFile));
}
```

**通过标准**:
- 重构文件哈希与原始新文件匹配
- Footer中的newFileHash与计算值一致

### 4.2 RG-002: 魔数校验

**测试目标**: 防止损坏/错误格式输入

**测试用例**:
```typescript
const testCases = [
    { input: Buffer.from('XXXX'), expected: 'ERR_INVALID_MAGIC' },
    { input: Buffer.from('H1DF'), expected: 'ERR_DEPRECATED_VERSION' },
    { input: Buffer.from('HDIF'), expected: 'OK' },
    { input: Buffer.from(''),   expected: 'ERR_TRUNCATED' },
    { input: Buffer.from('HDI'), expected: 'ERR_TRUNCATED' },
];
```

**错误码定义**:
| 错误码 | 触发条件 |
|--------|----------|
| `ERR_INVALID_MAGIC` | 魔数不是"HDIF"、"H1DF"或"HAJI" |
| `ERR_DEPRECATED_VERSION` | 魔数是"H1DF"/"HAJI"，需要降级处理 |
| `ERR_TRUNCATED` | 文件长度不足7字节(无法读取完整Header) |
| `ERR_UNSUPPORTED_VERSION` | Version字段不是0x20 |

### 4.3 NG-002: 截断文件检测

**测试目标**: 检测不完整的Footer

**检测逻辑**:
```typescript
function validateFooterIntegrity(fileBuffer: Buffer): boolean {
    const MIN_FILE_SIZE = 7 + 100; // Header + Footer最小值
    if (fileBuffer.length < MIN_FILE_SIZE) {
        throw new Error('ERR_TRUNCATED_FILE');
    }
    
    // 检查Footer Magic
    const footerOffset = fileBuffer.length - 4;
    const footerMagic = fileBuffer.slice(footerOffset, footerOffset + 4);
    if (footerMagic.toString('ascii') !== 'FEND') {
        throw new Error('ERR_CORRUPTED_FOOTER');
    }
    
    // 验证PatchHash覆盖范围
    const patchHash = fileBuffer.slice(footerOffset - 32, footerOffset);
    const payloadEnd = footerOffset - 32;
    const computedHash = blake3_256(fileBuffer.slice(0, payloadEnd));
    
    if (!constantTimeEquals(patchHash, computedHash)) {
        throw new Error('ERR_PATCH_HASH_MISMATCH');
    }
    
    return true;
}
```

### 4.4 E2E-001: 全链路测试

**测试场景**: 文件 → CDC → Diff → .hdiff → Apply → 验证

```
┌──────────┐     CDC-Rabin      ┌──────────┐
│ Old File │ ─────────────────→ │  Blocks  │
└──────────┘                    └────┬─────┘
                                     │
┌──────────┐     CDC-Rabin      ┌────▼─────┐
│ New File │ ─────────────────→ │  Blocks  │
└──────────┘                    └────┬─────┘
                                     │
                              ┌──────▼─────────┐
                              │  Diff Engine   │
                              │  (匹配/新增)    │
                              └──────┬─────────┘
                                     │
                              ┌──────▼─────────┐
                              │  Encoder       │
                              │  (.hdiff v2.0) │
                              └──────┬─────────┘
                                     │
                              ┌──────▼─────────┐
                              │  Decoder       │
                              └──────┬─────────┘
                                     │
                              ┌──────▼─────────┐
                              │  Apply Patch   │
                              └──────┬─────────┘
                                     │
                              ┌──────▼─────────┐
                              │  Reconstructed │
                              │  File          │
                              └────────────────┘
```

**验证检查点**:
1. CDC分块边界正确性
2. Add/Copy/Run指令覆盖率100%
3. 应用后文件哈希与预期一致
4. 内存使用峰值<200MB (流式处理)

---

## 5. 扩展预留

### 5.1 未来压缩算法升级

Flags位预留支持多算法:

```
Bit 0-1: Compression Algorithm
   00 = zstd (默认)
   01 = lz4 (速度优先)
   10 = brotli (压缩比优先)
   11 = 预留
```

### 5.2 加密支持 (预留)

```
Bit 3 (ENCRYPTED) = 1时:
- Header后增加EncryptionHeader
- Payload使用AEAD加密 (ChaCha20-Poly1305)
- PatchHash计算加密后数据
```

### 5.3 扩展指令集 (预留)

类型码`11` (Reserved)扩展:
```
11 00 = CopyWithTransform (数据变换后复制)
11 01 = ChecksumVerify (内联校验点)
11 10 = Seek (跳转指令，支持稀疏文件)
11 11 = 预留
```

---

## 6. 实现参考

### 6.1 TypeScript接口定义

```typescript
// 核心类型定义
interface HdiffV2Header {
    magic: 'HDIF';
    version: 0x20;
    flags: {
        compressed: boolean;
        checksum: boolean;
        extended: boolean;
        encrypted: boolean;
    };
    algorithmId: 0x01;
}

interface BlockMetadata {
    oldBlockCount: number;
    newBlockCount: number;
    blockSizeHint: number;
}

type Instruction = 
    | { type: 'add'; dataOffset: number; dataLength: number }
    | { type: 'copy'; blockIndex: number; blockCount: number }
    | { type: 'run'; fillByte: number; runLength: number };

interface HdiffV2Footer {
    oldFileHash: Uint8Array;  // 32 bytes
    newFileHash: Uint8Array;  // 32 bytes
    patchHash: Uint8Array;    // 32 bytes
    footerMagic: 'FEND';
}
```

### 6.2 解析器骨架

```typescript
class HdiffV2Parser {
    private buffer: Buffer;
    private pos: number = 0;
    
    constructor(data: Buffer) {
        this.buffer = data;
        this.validateMagic();
    }
    
    private validateMagic(): void {
        const magic = this.buffer.slice(0, 4).toString('ascii');
        if (magic !== 'HDIF') {
            if (magic === 'H1DF' || magic === 'HAJI') {
                throw new Error('ERR_DEPRECATED_VERSION: Use legacy parser');
            }
            throw new Error('ERR_INVALID_MAGIC');
        }
    }
    
    parseHeader(): HdiffV2Header {
        return {
            magic: 'HDIF',
            version: this.buffer[4],
            flags: this.parseFlags(this.buffer[5]),
            algorithmId: this.buffer[6]
        };
    }
    
    private parseFlags(byte: number) {
        return {
            compressed: !!(byte & 0x01),
            checksum: !!(byte & 0x02),
            extended: !!(byte & 0x04),
            encrypted: !!(byte & 0x08)
        };
    }
    
    parseVarint(): number {
        let result = 0;
        let shift = 0;
        while (true) {
            const byte = this.buffer[this.pos++];
            result |= (byte & 0x7F) << shift;
            if (!(byte & 0x80)) break;
            shift += 7;
        }
        return result;
    }
    
    parseFooter(): HdiffV2Footer {
        const footerStart = this.buffer.length - 100;
        const magicOffset = this.buffer.length - 4;
        
        const footerMagic = this.buffer.slice(magicOffset, magicOffset + 4).toString('ascii');
        if (footerMagic !== 'FEND') {
            throw new Error('ERR_CORRUPTED_FOOTER');
        }
        
        return {
            oldFileHash: this.buffer.slice(footerStart, footerStart + 32),
            newFileHash: this.buffer.slice(footerStart + 32, footerStart + 64),
            patchHash: this.buffer.slice(footerStart + 64, footerStart + 96),
            footerMagic: 'FEND'
        };
    }
}
```

---

## 7. 附录

### 7.1 文件扩展名与MIME类型

| 项目 | 值 |
|------|-----|
| 文件扩展名 | `.hdiff` 或 `.hdif` |
| MIME类型 | `application/vnd.hajimi.hdiff-v2` |
| 魔法文件描述 | `Hajimi Diff v2.0 container format` |

### 7.2 测试向量

**Golden Vector 1 - 空文件diff**:
```
Input: old="", new=""
Expected hdiff (hex):
48 44 49 46 20 03 01  00 00 00 20  00  28 B5 2F FD ...
...
<Footer hashes>
46 45 4E 44
```

**Golden Vector 2 - 完全替换**:
```
Input: old="AAAAAAAAAA", new="BBBBBBBBBB"
Expected: 主要是Add指令，无Copy
```

**Golden Vector 3 - 完全相同**:
```
Input: old="Test", new="Test"
Expected: 全Copy指令，Payload为空
```

### 7.3 相关文档索引

- B-02/09: 差分指令集编码规范 (Add/Copy/Run)
- B-04/09: BLAKE3-256哈希实现规范
- B-05/09: CDC-Rabin分块算法参数
- DEBT-B07-001: BLAKE3纯JS实现债务声明

---

**文档状态**: 草案 v2.0.0-draft1  
**下次评审**: 2026-02-27  
**评审人**: Kimi Code CLI / Soyo-Dev  
