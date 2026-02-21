/**
 * HAJIMI-DIFF v2.0 编码/解码示例实现
 * 
 * 用途: 演示格式规范的编码逻辑，非生产代码
 * 自测点: CF-004, RG-002, NG-002
 */

import { createHash } from 'crypto';

// ============================================================================
// 常量定义
// ============================================================================

const MAGIC_HEADER = Buffer.from('HDIF');
const MAGIC_FOOTER = Buffer.from('FEND');
const VERSION_V2 = 0x20;
const ALGORITHM_CDC_RABIN_BLAKE3 = 0x01;
const FLAGS_DEFAULT = 0x03; // COMPRESSED | CHECKSUM

const BLOCK_SIZE_DEFAULT = 8192; // 8KB

// 指令类型
enum InstructionType {
    ADD = 0b00,
    COPY = 0b01,
    RUN = 0b10,
    RESERVED = 0b11
}

// ============================================================================
// Varint 编解码
// ============================================================================

function encodeVarint(value: number): Buffer {
    const bytes: number[] = [];
    while (value > 0x7F) {
        bytes.push((value & 0x7F) | 0x80);
        value >>= 7;
    }
    bytes.push(value);
    return Buffer.from(bytes);
}

function decodeVarint(buffer: Buffer, offset: number): { value: number; nextOffset: number } {
    let result = 0;
    let shift = 0;
    let pos = offset;
    
    while (true) {
        const byte = buffer[pos];
        result |= (byte & 0x7F) << shift;
        pos++;
        if (!(byte & 0x80)) break;
        shift += 7;
        if (shift > 63) throw new Error('ERR_VARINT_TOO_LARGE');
    }
    
    return { value: result, nextOffset: pos };
}

// ============================================================================
// BLAKE3-256 存根 (实际应使用 @noble/hashes/blake3)
// ============================================================================

function blake3_256(data: Buffer): Buffer {
    // 实际项目中使用: import { blake3 } from '@noble/hashes/blake3';
    // 这里使用 Node.js crypto 模拟 (实际为SHA-256，仅作演示)
    return createHash('sha256').update(data).digest();
}

// ============================================================================
// Header 编解码
// ============================================================================

interface HdiffV2Header {
    version: number;
    flags: number;
    algorithmId: number;
}

function encodeHeader(header: HdiffV2Header): Buffer {
    const buf = Buffer.alloc(7);
    MAGIC_HEADER.copy(buf, 0);
    buf[4] = header.version;
    buf[5] = header.flags;
    buf[6] = header.algorithmId;
    return buf;
}

function decodeHeader(buffer: Buffer): { header: HdiffV2Header; offset: number } {
    // RG-002: 魔数校验
    const magic = buffer.slice(0, 4).toString('ascii');
    if (magic !== 'HDIF') {
        if (magic === 'H1DF' || magic === 'HAJI') {
            throw new Error('ERR_DEPRECATED_VERSION: Use legacy parser');
        }
        throw new Error('ERR_INVALID_MAGIC');
    }
    
    // 版本检查
    if (buffer[4] !== VERSION_V2) {
        throw new Error('ERR_UNSUPPORTED_VERSION');
    }
    
    return {
        header: {
            version: buffer[4],
            flags: buffer[5],
            algorithmId: buffer[6]
        },
        offset: 7
    };
}

// ============================================================================
// Block Metadata 编解码
// ============================================================================

interface BlockMetadata {
    oldBlockCount: number;
    newBlockCount: number;
    blockSizeHint: number;
}

function encodeBlockMetadata(metadata: BlockMetadata): Buffer {
    const parts: Buffer[] = [];
    parts.push(encodeVarint(metadata.oldBlockCount));
    parts.push(encodeVarint(metadata.newBlockCount));
    
    const hintBuf = Buffer.alloc(2);
    hintBuf.writeUInt16LE(metadata.blockSizeHint, 0);
    parts.push(hintBuf);
    
    return Buffer.concat(parts);
}

function decodeBlockMetadata(buffer: Buffer, offset: number): { metadata: BlockMetadata; nextOffset: number } {
    let pos = offset;
    
    const oldBlockCount = decodeVarint(buffer, pos);
    pos = oldBlockCount.nextOffset;
    
    const newBlockCount = decodeVarint(buffer, pos);
    pos = newBlockCount.nextOffset;
    
    const blockSizeHint = buffer.readUInt16LE(pos);
    pos += 2;
    
    return {
        metadata: {
            oldBlockCount: oldBlockCount.value,
            newBlockCount: newBlockCount.value,
            blockSizeHint
        },
        nextOffset: pos
    };
}

// ============================================================================
// Instruction 编解码
// ============================================================================

type Instruction = 
    | { type: 'add'; dataOffset: number; dataLength: number }
    | { type: 'copy'; blockIndex: number; blockCount: number }
    | { type: 'run'; fillByte: number; runLength: number };

function encodeInstruction(instr: Instruction): Buffer {
    const parts: Buffer[] = [];
    
    switch (instr.type) {
        case 'add': {
            // Type (2 bits) = 00, 后跟 dataOffset(varint) + dataLength(varint)
            parts.push(encodeVarint(instr.dataOffset));
            parts.push(encodeVarint(instr.dataLength));
            break;
        }
        case 'copy': {
            // Type (2 bits) = 01, 后跟 blockIndex(varint) + blockCount(varint)
            // 第一个字节的高2位标记类型
            const typeByte = (InstructionType.COPY << 6);
            parts.push(Buffer.from([typeByte]));
            parts.push(encodeVarint(instr.blockIndex));
            parts.push(encodeVarint(instr.blockCount));
            break;
        }
        case 'run': {
            // Type (2 bits) = 10, 后跟 fillByte(1 byte) + runLength(varint)
            const typeByte = (InstructionType.RUN << 6);
            parts.push(Buffer.from([typeByte, instr.fillByte]));
            parts.push(encodeVarint(instr.runLength));
            break;
        }
    }
    
    return Buffer.concat(parts);
}

function encodeInstructions(instructions: Instruction[]): Buffer {
    const countBuf = encodeVarint(instructions.length);
    const instrBufs = instructions.map(encodeInstruction);
    
    // 注意: 实际应使用zstd压缩此处
    // 为演示省略压缩步骤
    return Buffer.concat([countBuf, ...instrBufs]);
}

// ============================================================================
// Footer 编解码 (NG-002: 截断检测)
// ============================================================================

interface HdiffV2Footer {
    oldFileHash: Buffer;  // 32 bytes
    newFileHash: Buffer;  // 32 bytes
    patchHash: Buffer;    // 32 bytes
}

function encodeFooter(footer: HdiffV2Footer): Buffer {
    const buf = Buffer.alloc(100);
    footer.oldFileHash.copy(buf, 0);
    footer.newFileHash.copy(buf, 32);
    footer.patchHash.copy(buf, 64);
    MAGIC_FOOTER.copy(buf, 96);
    return buf;
}

function decodeFooter(buffer: Buffer): HdiffV2Footer {
    // NG-002: 最小文件大小检查
    const MIN_FILE_SIZE = 7 + 100; // Header + Footer
    if (buffer.length < MIN_FILE_SIZE) {
        throw new Error('ERR_TRUNCATED_FILE');
    }
    
    const footerStart = buffer.length - 100;
    
    // 检查Footer Magic
    const footerMagic = buffer.slice(buffer.length - 4, buffer.length);
    if (!footerMagic.equals(MAGIC_FOOTER)) {
        throw new Error('ERR_CORRUPTED_FOOTER');
    }
    
    return {
        oldFileHash: buffer.slice(footerStart, footerStart + 32),
        newFileHash: buffer.slice(footerStart + 32, footerStart + 64),
        patchHash: buffer.slice(footerStart + 64, footerStart + 96)
    };
}

function verifyPatchHash(buffer: Buffer): boolean {
    const footerStart = buffer.length - 100;
    const payloadEnd = footerStart + 64; // PatchHash之前的偏移
    
    const computedHash = blake3_256(buffer.slice(0, payloadEnd));
    const storedHash = buffer.slice(footerStart + 64, footerStart + 96);
    
    return computedHash.equals(storedHash);
}

// ============================================================================
// 完整编码器 (CF-004)
// ============================================================================

interface HdiffV2Container {
    header: HdiffV2Header;
    blockMetadata: BlockMetadata;
    instructions: Instruction[];
    payload: Buffer; // Add数据
    oldFile: Buffer;
    newFile: Buffer;
}

function encodeHdiffV2(container: HdiffV2Container): Buffer {
    // 1. 编码Header
    const headerBuf = encodeHeader(container.header);
    
    // 2. 编码Block Metadata
    const metadataBuf = encodeBlockMetadata(container.blockMetadata);
    
    // 3. 编码Instructions (应压缩)
    const instrBuf = encodeInstructions(container.instructions);
    
    // 4. Payload (应使用zstd压缩)
    // 为演示使用原始数据
    const payloadBuf = container.payload;
    
    // 5. 计算哈希
    const oldFileHash = blake3_256(container.oldFile);
    const newFileHash = blake3_256(container.newFile);
    
    // 6. 计算PatchHash (Header + Metadata + Instructions + Payload)
    const dataForPatchHash = Buffer.concat([headerBuf, metadataBuf, instrBuf, payloadBuf]);
    const patchHash = blake3_256(dataForPatchHash);
    
    // 7. 编码Footer
    const footerBuf = encodeFooter({
        oldFileHash,
        newFileHash,
        patchHash
    });
    
    // 8. 组装
    return Buffer.concat([headerBuf, metadataBuf, instrBuf, payloadBuf, footerBuf]);
}

function decodeHdiffV2(buffer: Buffer): { container: Partial<HdiffV2Container>; raw: Buffer } {
    // 验证Footer完整性 (NG-002)
    const footer = decodeFooter(buffer);
    
    // 验证PatchHash
    if (!verifyPatchHash(buffer)) {
        throw new Error('ERR_PATCH_HASH_MISMATCH');
    }
    
    // 解码Header (RG-002: 魔数校验在此)
    const { header, offset: headerEnd } = decodeHeader(buffer);
    
    // 解码Block Metadata
    const { metadata, nextOffset: metadataEnd } = decodeBlockMetadata(buffer, headerEnd);
    
    // 解码Instructions (应解压缩)
    // 为演示简化解码
    
    return {
        container: {
            header,
            blockMetadata: metadata,
            oldFile: undefined, // 需要外部提供
            newFile: undefined  // 需要外部提供
        },
        raw: buffer
    };
}

// ============================================================================
// 自测函数
// ============================================================================

function runSelfTests(): void {
    console.log('=== HAJIMI-DIFF v2.0 自测 ===\n');
    
    // RG-002: 魔数校验测试
    console.log('[RG-002] 魔数校验测试');
    try {
        decodeHeader(Buffer.from('XXXX'));
        console.log('  FAIL: 应抛出ERR_INVALID_MAGIC');
    } catch (e: any) {
        if (e.message.includes('ERR_INVALID_MAGIC')) {
            console.log('  PASS: 无效魔数正确检测');
        } else {
            console.log('  FAIL: 错误类型不匹配');
        }
    }
    
    try {
        decodeHeader(Buffer.from('H1DF'));
        console.log('  FAIL: 应抛出ERR_DEPRECATED_VERSION');
    } catch (e: any) {
        if (e.message.includes('ERR_DEPRECATED_VERSION')) {
            console.log('  PASS: 旧版本正确降级提示');
        } else {
            console.log('  FAIL: 错误类型不匹配');
        }
    }
    
    // NG-002: 截断文件检测
    console.log('\n[NG-002] 截断文件检测');
    try {
        decodeFooter(Buffer.from('HDIF')); // 太短
        console.log('  FAIL: 应抛出ERR_TRUNCATED_FILE');
    } catch (e: any) {
        if (e.message.includes('ERR_TRUNCATED_FILE')) {
            console.log('  PASS: 截断文件正确检测');
        } else {
            console.log('  FAIL: 错误类型不匹配');
        }
    }
    
    try {
        const badFooter = Buffer.concat([
            Buffer.alloc(96),
            Buffer.from('XXXX') // 错误的Footer Magic
        ]);
        decodeFooter(badFooter);
        console.log('  FAIL: 应抛出ERR_CORRUPTED_FOOTER');
    } catch (e: any) {
        if (e.message.includes('ERR_CORRUPTED_FOOTER')) {
            console.log('  PASS: 损坏Footer正确检测');
        } else {
            console.log('  FAIL: 错误类型不匹配');
        }
    }
    
    // Varint编解码测试
    console.log('\n[CF-004] Varint编解码测试');
    const testValues = [0, 1, 127, 128, 16383, 16384, 2147483647];
    let varintPass = true;
    for (const val of testValues) {
        const encoded = encodeVarint(val);
        const decoded = decodeVarint(encoded, 0);
        if (decoded.value !== val) {
            console.log(`  FAIL: ${val} 编解码不匹配`);
            varintPass = false;
        }
    }
    if (varintPass) console.log('  PASS: 所有测试值编解码正确');
    
    // CF-004: 往返测试
    console.log('\n[CF-004] 往返测试');
    const oldFile = Buffer.from(''); // 空旧文件
    const newFile = Buffer.from('Hello World');
    
    const container: HdiffV2Container = {
        header: {
            version: VERSION_V2,
            flags: FLAGS_DEFAULT,
            algorithmId: ALGORITHM_CDC_RABIN_BLAKE3
        },
        blockMetadata: {
            oldBlockCount: 0,
            newBlockCount: 1,
            blockSizeHint: BLOCK_SIZE_DEFAULT
        },
        instructions: [
            { type: 'add', dataOffset: 0, dataLength: newFile.length }
        ],
        payload: newFile,
        oldFile,
        newFile
    };
    
    try {
        const encoded = encodeHdiffV2(container);
        const decoded = decodeHdiffV2(encoded);
        
        // 验证关键字段
        if (decoded.container.header?.version === VERSION_V2 &&
            decoded.container.blockMetadata?.newBlockCount === 1) {
            console.log('  PASS: 往返编解码成功');
        } else {
            console.log('  FAIL: 解码数据不匹配');
        }
    } catch (e: any) {
        console.log(`  FAIL: ${e.message}`);
    }
    
    console.log('\n=== 自测完成 ===');
}

// 运行自测
runSelfTests();

// 导出供外部使用
export {
    encodeHeader,
    decodeHeader,
    encodeBlockMetadata,
    decodeBlockMetadata,
    encodeInstructions,
    encodeFooter,
    decodeFooter,
    encodeHdiffV2,
    decodeHdiffV2,
    encodeVarint,
    decodeVarint,
    InstructionType,
    VERSION_V2,
    MAGIC_HEADER,
    MAGIC_FOOTER
};
