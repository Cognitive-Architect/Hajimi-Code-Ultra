/**
 * CircularDetector.js - 循环符号链接检测器
 * 工单: B-06/09 - 循环符号链接检测
 * 版本: v1.1.0
 * 标准: 3秒内完成检测
 * 
 * 自测点:
 * - CF-007: 循环符号链接检测（[CIRCULAR]标记）
 * - RG-005: 检测超时3秒限制
 * - NG-005: 深层嵌套目录（1000层）不栈溢出
 * - High-004: 并发访问下inode跟踪一致性
 * 
 * 债务声明:
 * - DEBT-CIRC-001: P2，Windows Junction点特殊处理待完善
 */

const fs = require('fs');
const path = require('path');

// ============ 错误类定义 ============

/**
 * E1001: 循环引用检测错误
 * 当检测到目录或符号链接循环时抛出
 */
class CircularReferenceError extends Error {
  constructor(filePath, inodeKey) {
    const message = inodeKey 
      ? `[CIRCULAR] Symlink loop detected at ${filePath} (inode: ${inodeKey})`
      : `[CIRCULAR] Symlink loop detected at ${filePath}`;
    super(message);
    this.name = 'CircularReferenceError';
    this.code = 'E1001';
    this.path = filePath;
    this.inodeKey = inodeKey;
  }
}

/**
 * E1003: 内部状态未初始化错误
 */
class NotInitializedError extends Error {
  constructor(component) {
    super(`[E1003] ${component} not initialized. Call init() before use.`);
    this.name = 'NotInitializedError';
    this.code = 'E1003';
    this.component = component;
  }
}

/**
 * E1004: 参数验证错误
 */
class ValidationError extends Error {
  constructor(field, value, message = '') {
    super(`[E1004] Invalid ${field}: ${value}${message ? ` - ${message}` : ''}`);
    this.name = 'ValidationError';
    this.code = 'E1004';
    this.field = field;
    this.value = value;
  }
}

/**
 * E1005: 并发冲突错误
 */
class ConcurrencyError extends Error {
  constructor(resource) {
    super(`[E1005] Concurrent access conflict on ${resource}`);
    this.name = 'ConcurrencyError';
    this.code = 'E1005';
    this.resource = resource;
  }
}

/**
 * E1006: 检测超时错误
 */
class DetectionTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`[E1006] Detection timeout after ${timeoutMs}ms`);
    this.name = 'DetectionTimeoutError';
    this.code = 'E1006';
    this.timeoutMs = timeoutMs;
  }
}

// ============ 核心检测器类 ============

/**
 * CircularReferenceDetector - 循环引用检测器
 * 
 * 核心特性:
 * 1. inode级别检测: 使用 ${dev}:${ino} 作为唯一键
 * 2. 严格初始化: 所有Set显式初始化，运行时检查
 * 3. 超时控制: 3秒超时限制 (RG-005)
 * 4. 深度限制: 1000层防栈溢出 (NG-005)
 * 5. 并发安全: 锁机制保证一致性 (High-004)
 */
class CircularReferenceDetector {
  /**
   * 创建检测器实例
   * @param {Object} options - 配置选项
   * @param {number} options.maxDepth - 最大遍历深度，默认1000
   * @param {boolean} options.followSymlinks - 是否跟随符号链接，默认true
   * @param {string[]} options.ignorePatterns - 忽略的模式，默认['node_modules', '.git']
   * @param {number} options.timeoutMs - 超时毫秒数，默认3000
   */
  constructor(options = {}) {
    // ============ FIX-05-002: 严格类型守卫 ============
    // 必须显式初始化，禁止undefined状态
    this.visitedInodes = new Set();
    this.visitedRealPaths = new Set();
    this.initialized = true;
    
    // 并发锁（High-004）
    this.detectionLock = false;
    
    // 检测开始时间（RG-005）
    this.startTime = null;
    
    // 配置选项
    this.options = {
      maxDepth: 1000,  // NG-005: 1000层限制
      followSymlinks: true,
      ignorePatterns: ['node_modules', '.git', 'dist', '.next'],
      timeoutMs: 3000,  // RG-005: 3秒超时
      ...options
    };
    
    // 统计信息
    this.stats = {
      fileCount: 0,
      dirCount: 0,
      symlinkCount: 0
    };
  }

  /**
   * 运行时防御：检查初始化状态
   * @throws {NotInitializedError} 如果未正确初始化
   * @private
   */
  _ensureInitialized() {
    if (!this.initialized) {
      throw new NotInitializedError('CircularReferenceDetector');
    }
    if (!this.visitedInodes) {
      throw new NotInitializedError('CircularReferenceDetector.visitedInodes');
    }
    if (!this.visitedRealPaths) {
      throw new NotInitializedError('CircularReferenceDetector.visitedRealPaths');
    }
  }

  /**
   * 检查是否超时（RG-005）
   * @throws {DetectionTimeoutError} 如果超过超时时间
   * @private
   */
  _checkTimeout() {
    if (this.startTime && (Date.now() - this.startTime > this.options.timeoutMs)) {
      throw new DetectionTimeoutError(this.options.timeoutMs);
    }
  }

  /**
   * 生成inode唯一键
   * FIX-05-002: 统一使用 ${stat.dev}:${stat.ino} 格式
   * 
   * @param {fs.Stats} stat - 文件状态对象
   * @returns {string} inode键，格式: "device:inode"
   * @private
   */
  _getInodeKey(stat) {
    return `${stat.dev}:${stat.ino}`;
  }

  /**
   * 检查路径是否被忽略
   * @param {string} filePath - 文件路径
   * @returns {boolean} 是否被忽略
   * @private
   */
  _isIgnored(filePath) {
    const basename = path.basename(filePath);
    return this.options.ignorePatterns.some(pattern => 
      basename.includes(pattern) || filePath.includes(pattern)
    );
  }

  /**
   * 获取并发锁（High-004）
   * @throws {ConcurrencyError} 如果已有检测在进行中
   * @private
   */
  _acquireLock() {
    if (this.detectionLock) {
      throw new ConcurrencyError('CircularReferenceDetector');
    }
    this.detectionLock = true;
  }

  /**
   * 释放并发锁
   * @private
   */
  _releaseLock() {
    this.detectionLock = false;
  }

  /**
   * 检查路径是否产生循环
   * FIX-05-002: 入口添加初始化检查
   * CF-007: 循环符号链接检测（[CIRCULAR]标记）
   * 
   * @param {string} filePath - 要检查的文件路径
   * @param {fs.Stats} stat - 文件状态（可选，避免重复stat）
   * @throws {CircularReferenceError} 如果检测到循环
   * @throws {DetectionTimeoutError} 如果超时
   */
  check(filePath, stat = null) {
    // ============ FIX-05-002: 运行时防御 ============
    this._ensureInitialized();
    this._checkTimeout();  // RG-005

    // 参数验证
    if (typeof filePath !== 'string' || filePath.length === 0) {
      throw new ValidationError('filePath', filePath, 'must be non-empty string');
    }

    let fileStat;
    
    if (stat) {
      fileStat = stat;
    } else {
      try {
        // 使用 statSync 跟随符号链接获取目标状态
        fileStat = fs.statSync(filePath);
      } catch (e) {
        // 无法获取stat，跳过检查（可能是断链）
        return;
      }
    }

    // 只检查目录（文件不会有inode循环问题）
    if (!fileStat.isDirectory()) {
      return;
    }

    // FIX-05-002: 使用统一的inode键格式
    const inodeKey = this._getInodeKey(fileStat);
    
    // CF-007: 检查是否已访问过（循环检测）
    if (this.visitedInodes.has(inodeKey)) {
      throw new CircularReferenceError(filePath, inodeKey);
    }

    // 同时检查真实路径（处理硬链接情况）
    if (this.options.followSymlinks) {
      try {
        const realPath = fs.realpathSync(filePath);
        if (this.visitedRealPaths.has(realPath)) {
          throw new CircularReferenceError(filePath, null);
        }
      } catch (e) {
        // realpath失败，可能是断链，忽略
      }
    }
  }

  /**
   * 标记路径为已访问
   * @param {string} filePath - 文件路径
   * @param {fs.Stats} stat - 文件状态（可选）
   */
  markVisited(filePath, stat = null) {
    this._ensureInitialized();
    this._checkTimeout();  // RG-005

    let fileStat;
    if (stat) {
      fileStat = stat;
    } else {
      try {
        fileStat = fs.statSync(filePath);
      } catch {
        return;
      }
    }

    if (!fileStat.isDirectory()) {
      this.stats.fileCount++;
      return;
    }

    const inodeKey = this._getInodeKey(fileStat);
    this.visitedInodes.add(inodeKey);
    this.stats.dirCount++;

    // 检查是否是符号链接
    try {
      const lstat = fs.lstatSync(filePath);
      if (lstat.isSymbolicLink()) {
        this.stats.symlinkCount++;
      }
    } catch {
      // 忽略
    }

    if (this.options.followSymlinks) {
      try {
        const realPath = fs.realpathSync(filePath);
        this.visitedRealPaths.add(realPath);
      } catch {
        // 忽略
      }
    }
  }

  /**
   * 取消标记（回溯时使用）
   * @param {string} filePath - 文件路径
   * @param {fs.Stats} stat - 文件状态（可选）
   */
  unmarkVisited(filePath, stat = null) {
    this._ensureInitialized();

    let fileStat;
    if (stat) {
      fileStat = stat;
    } else {
      try {
        fileStat = fs.statSync(filePath);
      } catch {
        return;
      }
    }

    if (!fileStat.isDirectory()) {
      return;
    }

    const inodeKey = this._getInodeKey(fileStat);
    this.visitedInodes.delete(inodeKey);

    if (this.options.followSymlinks) {
      try {
        const realPath = fs.realpathSync(filePath);
        this.visitedRealPaths.delete(realPath);
      } catch {
        // 忽略
      }
    }
  }

  /**
   * 遍历目录并检测循环
   * NG-005: 1000层深度限制防栈溢出
   * RG-005: 3秒超时控制
   * High-004: 并发安全
   * 
   * @param {string} dirPath - 要遍历的目录
   * @param {number} depth - 当前深度（内部使用）
   * @returns {Object} 检测结果
   * @returns {boolean} result.hasCircular - 是否检测到循环
   * @returns {string} result.circularPath - 循环路径（如果有）
   * @returns {string} result.inodeKey - 检测到的inode键
   * @returns {number} result.fileCount - 遍历的文件数
   * @returns {number} result.dirCount - 遍历的目录数
   * @returns {boolean} result.timeout - 是否超时
   * @returns {boolean} result.maxDepthReached - 是否达到最大深度
   */
  detect(dirPath, depth = 0) {
    // ============ FIX-05-002: 运行时防御 ============
    this._ensureInitialized();
    
    // High-004: 获取并发锁（仅在顶层调用时）
    if (depth === 0) {
      this._acquireLock();
      this.startTime = Date.now();
    }

    try {
      // NG-005: 深度限制检查
      if (depth > this.options.maxDepth) {
        return {
          hasCircular: false,
          fileCount: this.stats.fileCount,
          dirCount: this.stats.dirCount,
          maxDepthReached: true,
          timeout: false
        };
      }

      // RG-005: 超时检查
      this._checkTimeout();

      // 验证路径参数
      if (typeof dirPath !== 'string') {
        throw new ValidationError('dirPath', dirPath, 'must be string');
      }

      try {
        // 检查循环
        this.check(dirPath);
        
        // 标记为已访问
        let stat;
        try {
          stat = fs.statSync(dirPath);
        } catch (e) {
          return {
            hasCircular: false,
            fileCount: this.stats.fileCount,
            dirCount: this.stats.dirCount,
            error: e.message,
            maxDepthReached: false,
            timeout: false
          };
        }
        
        this.markVisited(dirPath, stat);

        // 读取目录内容
        let entries;
        try {
          entries = fs.readdirSync(dirPath);
        } catch (e) {
          // 无法读取目录，回溯并返回
          this.unmarkVisited(dirPath, stat);
          return {
            hasCircular: false,
            fileCount: this.stats.fileCount,
            dirCount: this.stats.dirCount,
            error: e.message,
            maxDepthReached: false,
            timeout: false
          };
        }
        
        for (const entry of entries) {
          // RG-005: 定期检查超时
          if ((this.stats.fileCount + this.stats.dirCount) % 100 === 0) {
            this._checkTimeout();
          }

          if (this._isIgnored(entry)) {
            continue;
          }

          const fullPath = path.join(dirPath, entry);
          
          try {
            const entryStat = fs.statSync(fullPath);
            
            if (entryStat.isDirectory()) {
              // 递归检测
              const result = this.detect(fullPath, depth + 1);
              if (result.hasCircular || result.timeout) {
                return result;
              }
            } else {
              this.stats.fileCount++;
            }
          } catch (e) {
            if (e.code === 'E1001') {
              // 重新抛出循环引用错误
              throw e;
            }
            if (e.code === 'E1006') {
              // 超时错误
              return {
                hasCircular: false,
                fileCount: this.stats.fileCount,
                dirCount: this.stats.dirCount,
                timeout: true,
                maxDepthReached: false
              };
            }
            // 其他错误，跳过此文件
          }
        }

        // 回溯：取消标记
        this.unmarkVisited(dirPath, stat);

        return {
          hasCircular: false,
          fileCount: this.stats.fileCount,
          dirCount: this.stats.dirCount,
          maxDepthReached: false,
          timeout: false
        };

      } catch (e) {
        if (e.code === 'E1001') {
          return {
            hasCircular: true,
            circularPath: dirPath,
            inodeKey: e.inodeKey,
            fileCount: this.stats.fileCount,
            dirCount: this.stats.dirCount,
            maxDepthReached: false,
            timeout: false
          };
        }
        throw e;
      }

    } finally {
      // High-004: 释放锁
      if (depth === 0) {
        this._releaseLock();
      }
    }
  }

  /**
   * 重置检测器状态
   */
  reset() {
    this.visitedInodes.clear();
    this.visitedRealPaths.clear();
    this.stats = { fileCount: 0, dirCount: 0, symlinkCount: 0 };
    this.initialized = true;
    this.startTime = null;
    // 注意：锁状态在finally中释放，不在这里重置
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 获取已访问的inode数量
   * @returns {number} inode数量
   */
  getVisitedCount() {
    this._ensureInitialized();
    return this.visitedInodes.size;
  }

  /**
   * 获取配置选项
   * @returns {Object} 当前配置
   */
  getOptions() {
    return { ...this.options };
  }
}

// ============ 便捷函数 ============

/**
 * 快速检测目录是否存在循环引用
 * @param {string} dirPath - 目录路径
 * @param {Object} options - 检测选项
 * @returns {Object} 检测结果
 */
function detectCircular(dirPath, options = {}) {
  const detector = new CircularReferenceDetector(options);
  return detector.detect(dirPath);
}

/**
 * 检测指定路径是否为循环符号链接
 * @param {string} filePath - 文件路径
 * @param {Object} options - 检测选项
 * @returns {boolean} 是否为循环链接
 */
function isCircularSymlink(filePath, options = {}) {
  const detector = new CircularReferenceDetector({
    ...options,
    maxDepth: 1  // 只需检查一层
  });
  
  try {
    detector.check(filePath);
    return false;
  } catch (e) {
    if (e.code === 'E1001') {
      return true;
    }
    throw e;
  }
}

// ============ 模块导出 ============

module.exports = {
  // 核心类
  CircularReferenceDetector,
  
  // 错误类
  CircularReferenceError,
  NotInitializedError,
  ValidationError,
  ConcurrencyError,
  DetectionTimeoutError,
  
  // 便捷函数
  detectCircular,
  isCircularSymlink,
  
  // 错误码常量
  ErrorCodes: {
    CIRCULAR_REFERENCE: 'E1001',
    NOT_INITIALIZED: 'E1003',
    VALIDATION: 'E1004',
    CONCURRENCY: 'E1005',
    TIMEOUT: 'E1006'
  }
};
