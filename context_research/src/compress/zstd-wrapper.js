/**
 * Zstd压缩层封装
 * 工单: B-04/09 - 压缩层集成
 * 作者: 唐音-工程师人格
 * 
 * 特性:
 * - 分层压缩策略 (元数据/内容数据/小文件)
 * - 流式处理支持
 * - 损坏数据优雅降级
 * - 进度回调API
 */

const { Transform } = require('stream');
const { EventEmitter } = require('events');

// ============================================
// 常量定义
// ============================================

const COMPRESSION_LEVELS = {
    // 元数据: 快速解压 (level 1-3)
    META: {
        MIN: 1,
        MAX: 3,
        DEFAULT: 1,
        NAME: 'fast'
    },
    // 内容数据: 体积优先 (level 12-19)
    CONTENT: {
        MIN: 12,
        MAX: 19,
        DEFAULT: 15,
        NAME: 'max'
    },
    // 默认级别
    DEFAULT: 3
};

// 小文件阈值 (4KB)
const SMALL_FILE_THRESHOLD = 4096;

// 压缩标志位定义 (基于B-03格式规范)
const COMPRESSION_FLAGS = {
    NONE: 0x00,           // 未压缩
    ZSTD: 0x80,           // zstd压缩基础值
    ALGORITHM_MASK: 0x70, // 算法位掩码
    LEVEL_MASK: 0x0F      // 级别位掩码
};

// 错误码
const ERROR_CODES = {
    CORRUPTED_DATA: 'COMP-001',
    INVALID_LEVEL: 'COMP-002',
    MEMORY_LIMIT: 'COMP-003',
    WASM_LOAD: 'COMP-004',
    UNKNOWN: 'COMP-999'
};

// ============================================
// 错误类定义
// ============================================

class CompressionError extends Error {
    constructor(code, message, recoverable = false) {
        super(message);
        this.name = 'CompressionError';
        this.code = code;
        this.recoverable = recoverable;
    }
}

// ============================================
// ZstdCompressor 主类
// ============================================

class ZstdCompressor extends EventEmitter {
    constructor(options = {}) {
        super();
        this.codec = null;
        this.wasmLoaded = false;
        this.useWasm = options.useWasm !== false;
        this.fallbackMode = false;
        
        // 延迟加载codec
        this._initPromise = null;
    }

    /**
     * 初始化压缩器
     * @private
     */
    async _initialize() {
        if (this._initPromise) return this._initPromise;
        
        this._initPromise = this._doInitialize();
        return this._initPromise;
    }

    async _doInitialize() {
        try {
            // 优先尝试WASM版本
            if (this.useWasm) {
                try {
                    const zstd = require('@bokuweb/zstd-wasm');
                    await zstd.init();
                    this.codec = zstd;
                    this.wasmLoaded = true;
                    this.emit('ready', { mode: 'wasm' });
                    return;
                } catch (e) {
                    this.emit('warn', { message: 'WASM加载失败，回退到JS实现', error: e.message });
                }
            }
            
            // 回退到纯JS实现
            const ZstdCodec = require('zstd-codec');
            this.codec = await new Promise((resolve) => {
                ZstdCodec.run((codec) => resolve(codec));
            });
            this.fallbackMode = true;
            this.emit('ready', { mode: 'js' });
        } catch (error) {
            this.emit('error', new CompressionError(
                ERROR_CODES.WASM_LOAD,
                `初始化失败: ${error.message}`,
                false
            ));
            throw error;
        }
    }

    /**
     * 验证压缩级别
     * @param {number} level - 压缩级别
     * @returns {number} - 验证后的级别
     * @private
     */
    _validateLevel(level) {
        if (typeof level !== 'number' || isNaN(level)) {
            return COMPRESSION_LEVELS.DEFAULT;
        }
        // zstd支持 1-22
        return Math.max(1, Math.min(22, Math.floor(level)));
    }

    /**
     * 检测数据类型并返回推荐压缩策略
     * @param {Buffer|string} data - 输入数据
     * @param {string} hint - 数据类型提示 ('metadata' | 'content')
     * @returns {Object} - 压缩策略
     */
    getStrategy(data, hint = 'content') {
        const size = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data);
        
        // 小文件优化: <4KB不压缩
        if (size < SMALL_FILE_THRESHOLD) {
            return {
                level: 0,
                strategy: 'none',
                shouldCompress: false,
                reason: 'small_file'
            };
        }
        
        // 根据类型选择策略
        if (hint === 'metadata') {
            return {
                level: COMPRESSION_LEVELS.META.DEFAULT,
                strategy: 'fast',
                shouldCompress: true,
                range: COMPRESSION_LEVELS.META
            };
        }
        
        return {
            level: COMPRESSION_LEVELS.CONTENT.DEFAULT,
            strategy: 'max',
            shouldCompress: true,
            range: COMPRESSION_LEVELS.CONTENT
        };
    }

    /**
     * 同步压缩 (小数据推荐)
     * @param {Buffer|string} data - 输入数据
     * @param {number} level - 压缩级别 1-22
     * @returns {Buffer} - 压缩后数据
     */
    compress(data, level = COMPRESSION_LEVELS.DEFAULT) {
        const validatedLevel = this._validateLevel(level);
        const inputBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        
        if (!this.codec) {
            throw new CompressionError(
                ERROR_CODES.UNKNOWN,
                '压缩器未初始化',
                false
            );
        }
        
        try {
            if (this.wasmLoaded) {
                // WASM版本
                const compressed = this.codec.compress(inputBuffer, validatedLevel);
                return Buffer.from(compressed);
            } else {
                // JS版本
                const simple = this.codec.ZstdSimple;
                const compressed = simple.compress(inputBuffer, validatedLevel);
                return Buffer.from(compressed);
            }
        } catch (error) {
            throw new CompressionError(
                ERROR_CODES.UNKNOWN,
                `压缩失败: ${error.message}`,
                false
            );
        }
    }

    /**
     * 异步压缩 (支持进度回调)
     * @param {Buffer|string} data - 输入数据
     * @param {Object} options - 选项
     * @returns {Promise<Object>} - 压缩结果
     */
    async compressAsync(data, options = {}) {
        await this._initialize();
        
        const { 
            level, 
            strategy = 'auto',
            progressCallback 
        } = options;
        
        const inputBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        
        // 自动策略选择
        let targetLevel = level;
        if (strategy === 'auto' || !level) {
            const strategyConfig = this.getStrategy(inputBuffer, options.dataType || 'content');
            if (!strategyConfig.shouldCompress) {
                return {
                    data: inputBuffer,
                    originalSize: inputBuffer.length,
                    compressedSize: inputBuffer.length,
                    level: 0,
                    ratio: 1.0,
                    compressed: false,
                    reason: strategyConfig.reason
                };
            }
            targetLevel = strategyConfig.level;
        }
        
        // 模拟进度回调 (同步压缩无法实现真实进度)
        if (progressCallback) {
            progressCallback(0);
        }
        
        const startTime = Date.now();
        const compressed = this.compress(inputBuffer, targetLevel);
        
        if (progressCallback) {
            progressCallback(100);
        }
        
        const originalSize = inputBuffer.length;
        const compressedSize = compressed.length;
        
        return {
            data: compressed,
            originalSize,
            compressedSize,
            level: targetLevel,
            ratio: originalSize / compressedSize,
            compressed: true,
            duration: Date.now() - startTime
        };
    }

    /**
     * 智能压缩 (根据数据类型自动选择策略)
     * @param {Buffer} data - 输入数据
     * @param {'metadata'|'content'} dataType - 数据类型
     * @returns {Object} - 压缩结果
     */
    compressSmart(data, dataType = 'content') {
        const strategy = this.getStrategy(data, dataType);
        
        if (!strategy.shouldCompress) {
            return {
                data: Buffer.isBuffer(data) ? data : Buffer.from(data),
                originalSize: data.length,
                compressedSize: data.length,
                level: 0,
                ratio: 1.0,
                compressed: false,
                strategy: strategy.strategy
            };
        }
        
        return this.compressAsync(data, { level: strategy.level });
    }

    /**
     * 同步解压
     * @param {Buffer} data - 压缩数据
     * @returns {Buffer} - 解压后数据
     */
    decompress(data) {
        if (!Buffer.isBuffer(data)) {
            throw new CompressionError(
                ERROR_CODES.CORRUPTED_DATA,
                '输入必须是Buffer类型',
                false
            );
        }
        
        if (!this.codec) {
            throw new CompressionError(
                ERROR_CODES.UNKNOWN,
                '压缩器未初始化',
                false
            );
        }
        
        try {
            if (this.wasmLoaded) {
                const decompressed = this.codec.decompress(data);
                return Buffer.from(decompressed);
            } else {
                const simple = this.codec.ZstdSimple;
                const decompressed = simple.decompress(data);
                return Buffer.from(decompressed);
            }
        } catch (error) {
            // 损坏数据优雅降级 (NG-003)
            this.emit('decompressError', { error: error.message, recoverable: true });
            
            throw new CompressionError(
                ERROR_CODES.CORRUPTED_DATA,
                `解压失败: ${error.message}`,
                true
            );
        }
    }

    /**
     * 异步解压
     * @param {Buffer} data - 压缩数据
     * @returns {Promise<Buffer>} - 解压后数据
     */
    async decompressAsync(data) {
        await this._initialize();
        return this.decompress(data);
    }

    /**
     * 创建压缩流
     * @param {number} level - 压缩级别
     * @returns {Transform} - 转换流
     */
    createCompressStream(level = COMPRESSION_LEVELS.DEFAULT) {
        const validatedLevel = this._validateLevel(level);
        const chunks = [];
        const compressor = this;
        
        return new Transform({
            transform(chunk, encoding, callback) {
                chunks.push(chunk);
                callback();
            },
            
            flush(callback) {
                try {
                    const input = Buffer.concat(chunks);
                    const compressed = compressor.compress(input, validatedLevel);
                    this.push(compressed);
                    callback();
                } catch (error) {
                    callback(error);
                }
            }
        });
    }

    /**
     * 创建解压流
     * @returns {Transform} - 转换流
     */
    createDecompressStream() {
        const chunks = [];
        const compressor = this;
        
        return new Transform({
            transform(chunk, encoding, callback) {
                chunks.push(chunk);
                callback();
            },
            
            flush(callback) {
                try {
                    const input = Buffer.concat(chunks);
                    const decompressed = compressor.decompress(input);
                    this.push(decompressed);
                    callback();
                } catch (error) {
                    // 损坏数据优雅降级
                    compressor.emit('decompressError', { error, recoverable: false });
                    callback(error);
                }
            }
        });
    }

    /**
     * 带进度回调的流式压缩 (UX-001)
     * @param {number} level - 压缩级别
     * @param {Function} progressCallback - 进度回调 (percent: number) => void
     * @returns {Transform} - 转换流
     */
    createCompressStreamWithProgress(level = COMPRESSION_LEVELS.DEFAULT, progressCallback) {
        const stream = this.createCompressStream(level);
        
        if (progressCallback && typeof progressCallback === 'function') {
            let bytesProcessed = 0;
            const originalTransform = stream._transform;
            
            stream._transform = function(chunk, encoding, callback) {
                bytesProcessed += chunk.length;
                // 注意: 流式处理无法预知总大小，这里只报告处理字节数
                progressCallback(bytesProcessed);
                return originalTransform.call(this, chunk, encoding, callback);
            };
        }
        
        return stream;
    }

    /**
     * 生成压缩标志位 (B-03格式规范)
     * @param {number} level - 压缩级别
     * @returns {number} - 标志字节
     */
    static createFlag(level) {
        if (level === 0) {
            return COMPRESSION_FLAGS.NONE;
        }
        // 级别限制在 1-15 (4位)
        const clampedLevel = Math.min(15, Math.max(1, level));
        return COMPRESSION_FLAGS.ZSTD | clampedLevel;
    }

    /**
     * 解析压缩标志位
     * @param {number} flag - 标志字节
     * @returns {Object} - 解析结果
     */
    static parseFlag(flag) {
        const isCompressed = (flag & 0x80) !== 0;
        const algorithm = (flag & COMPRESSION_FLAGS.ALGORITHM_MASK) >> 4;
        const level = flag & COMPRESSION_FLAGS.LEVEL_MASK;
        
        return {
            isCompressed,
            algorithm: algorithm === 0 ? 'zstd' : 'unknown',
            level: isCompressed ? level : 0,
            raw: flag
        };
    }

    /**
     * 获取压缩统计信息
     * @returns {Object} - 统计信息
     */
    getStats() {
        return {
            wasmLoaded: this.wasmLoaded,
            fallbackMode: this.fallbackMode,
            initialized: !!this.codec
        };
    }
}

// ============================================
// 便捷函数
// ============================================

/**
 * 快速压缩 (元数据)
 * @param {Buffer} data - 输入数据
 * @returns {Promise<Object>} - 压缩结果
 */
async function compressFast(data) {
    const compressor = new ZstdCompressor();
    return compressor.compressAsync(data, { 
        level: COMPRESSION_LEVELS.META.DEFAULT,
        strategy: 'fast'
    });
}

/**
 * 最大压缩 (内容数据)
 * @param {Buffer} data - 输入数据
 * @returns {Promise<Object>} - 压缩结果
 */
async function compressMax(data) {
    const compressor = new ZstdCompressor();
    return compressor.compressAsync(data, { 
        level: COMPRESSION_LEVELS.CONTENT.DEFAULT,
        strategy: 'max'
    });
}

/**
 * 智能压缩 (自动选择策略)
 * @param {Buffer} data - 输入数据
 * @param {'metadata'|'content'} type - 数据类型
 * @returns {Promise<Object>} - 压缩结果
 */
async function compressAuto(data, type = 'content') {
    const compressor = new ZstdCompressor();
    return compressor.compressSmart(data, type);
}

// ============================================
// 导出
// ============================================

module.exports = {
    ZstdCompressor,
    CompressionError,
    COMPRESSION_LEVELS,
    SMALL_FILE_THRESHOLD,
    COMPRESSION_FLAGS,
    ERROR_CODES,
    compressFast,
    compressMax,
    compressAuto
};

// ============================================
// 使用示例
// ============================================

if (require.main === module) {
    (async () => {
        console.log('=== ZstdCompressor 自测 ===\n');
        
        const compressor = new ZstdCompressor();
        await compressor._initialize();
        
        // 测试数据
        const testData = Buffer.from('Hello, Zstd Compression! '.repeat(1000));
        console.log('原始数据大小:', testData.length, 'bytes');
        
        // 测试1: 基础压缩
        console.log('\n--- 测试1: 基础压缩 (level 3) ---');
        const result1 = await compressor.compressAsync(testData, { level: 3 });
        console.log('压缩后大小:', result1.compressedSize, 'bytes');
        console.log('压缩比:', result1.ratio.toFixed(2) + 'x');
        console.log('耗时:', result1.duration, 'ms');
        
        // 测试2: 智能压缩 (内容数据)
        console.log('\n--- 测试2: 智能压缩 (content类型) ---');
        const result2 = await compressor.compressSmart(testData, 'content');
        console.log('策略:', result2.compressed ? `level ${result2.level}` : '未压缩');
        console.log('压缩比:', result2.ratio.toFixed(2) + 'x');
        
        // 测试3: 小文件优化
        console.log('\n--- 测试3: 小文件优化 (<4KB) ---');
        const smallData = Buffer.from('Small file content');
        const result3 = await compressor.compressSmart(smallData, 'metadata');
        console.log('压缩状态:', result3.compressed ? '已压缩' : '跳过压缩');
        console.log('原因:', result3.reason || 'N/A');
        
        // 测试4: 解压
        console.log('\n--- 测试4: 解压验证 ---');
        const decompressed = await compressor.decompressAsync(result1.data);
        console.log('解压后大小:', decompressed.length, 'bytes');
        console.log('数据完整性:', decompressed.equals(testData) ? '✓ 通过' : '✗ 失败');
        
        // 测试5: 压缩标志位
        console.log('\n--- 测试5: 压缩标志位 (B-03规范) ---');
        const flag1 = ZstdCompressor.createFlag(0);
        const flag2 = ZstdCompressor.createFlag(3);
        const flag3 = ZstdCompressor.createFlag(15);
        console.log('Level 0 标志:', '0x' + flag1.toString(16).padStart(2, '0'));
        console.log('Level 3 标志:', '0x' + flag2.toString(16).padStart(2, '0'));
        console.log('Level 15 标志:', '0x' + flag3.toString(16).padStart(2, '0'));
        
        // 解析测试
        const parsed = ZstdCompressor.parseFlag(flag2);
        console.log('解析结果:', JSON.stringify(parsed));
        
        // 统计信息
        console.log('\n--- 压缩器状态 ---');
        console.log(compressor.getStats());
        
        console.log('\n=== 自测完成 ===');
    })().catch(console.error);
}
