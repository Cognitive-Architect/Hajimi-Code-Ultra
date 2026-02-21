/**
 * MemoryMonitor.js - v2.0 HARDENED Memory Safety Monitor
 * 
 * 工单: B-05/09 内存安全HARDENED实现
 * 标准: v1.1.0 HARDENED (09-FINAL-AUDIT.md)
 * 审计官: 压力怪-Audit人格
 * 
 * 核心复制:
 * - 每64MB块检查heapUsed (v1.1.0 第2章)
 * - 超限立即throw Error (v1.1.0 2.2节)
 * - 50MB缓冲防波动 (v1.1.0 2.3节)
 * - 并发隔离: 每流独立实例
 * 
 * 自测点:
 * - High-003: 50MB限制处理100MB文件<214ms报错
 * - RG-004: 流式处理内存上限<2x原始大小
 * - NG-004: OOM前优雅退出
 * - CF-006: 1GB文件流式diff不爆内存
 */

'use strict';

// ============================================================================
// 错误类定义
// ============================================================================

/**
 * E2001: 内存限制超出错误
 * 触发条件: (used - baseline) > limit * 0.95
 */
class MemoryLimitExceededError extends Error {
  /**
   * @param {string} message - 错误消息
   * @param {Object} context - 错误上下文
   * @param {string} context.code - 错误码 (E2001)
   * @param {string} context.operation - 触发操作
   * @param {number} context.usedMB - 已使用内存(MB)
   * @param {number} context.limitMB - 限制内存(MB)
   * @param {number} context.bufferMB - 缓冲内存(MB)
   * @param {number} [context.checkpoint] - 检查点索引
   * @param {number} [context.deltaMB] - 与基线差值(MB)
   */
  constructor(message, context = {}) {
    super(message);
    this.name = 'MemoryLimitExceededError';
    this.code = context.code || 'E2001';
    this.context = context;
    this.isOperational = true;
    
    // 保持堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MemoryLimitExceededError);
    }
  }
  
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      stack: this.stack
    };
  }
}

/**
 * E2002: 预检拒绝错误
 * 触发条件: preflight()判断文件无法处理
 */
class PreflightRejectedError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'PreflightRejectedError';
    this.code = 'E2002';
    this.context = context;
    this.isOperational = true;
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PreflightRejectedError);
    }
  }
}

/**
 * E2003: 检查点违规错误
 * 触发条件: checkpoint()检测到内存超限
 */
class CheckpointViolationError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'CheckpointViolationError';
    this.code = 'E2003';
    this.context = context;
    this.isOperational = true;
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CheckpointViolationError);
    }
  }
}

// ============================================================================
// MemoryMonitor 类
// ============================================================================

/**
 * 内存安全监控器 - HARDENED实现
 * 
 * 使用方式:
 * ```javascript
 * const monitor = new MemoryMonitor(100, 50); // 100MB限制, 50MB缓冲
 * 
 * // 1. 预分配检查
 * const preflight = monitor.preflight(fileSize);
 * if (!preflight.canProcess) throw new Error(preflight.rejectionReason);
 * 
 * // 2. 流式处理
 * stream.on('data', (chunk) => {
 *   monitor.checkpoint(++chunkIndex);
 *   monitor.enforceLimit('process_chunk');
 *   // ... 处理逻辑
 * });
 * 
 * // 3. 获取统计
 * const stats = monitor.getStats();
 * ```
 */
class MemoryMonitor {
  /**
   * @param {number} maxMemoryMB - 最大内存限制(MB)
   * @param {number} [bufferMB=50] - 缓冲内存(MB), 防止波动误报
   */
  constructor(maxMemoryMB, bufferMB = 50) {
    // 参数验证
    if (typeof maxMemoryMB !== 'number' || maxMemoryMB <= 0) {
      throw new TypeError('maxMemoryMB must be a positive number');
    }
    if (typeof bufferMB !== 'number' || bufferMB < 0) {
      throw new TypeError('bufferMB must be a non-negative number');
    }
    
    // 核心配置 (HARDENED标准)
    this.maxMemoryMB = maxMemoryMB;
    this.maxMemoryBytes = maxMemoryMB * 1024 * 1024;
    this.bufferMB = bufferMB;
    this.bufferOverhead = bufferMB * 1024 * 1024;
    
    // 检查点间隔: 64MB (v1.1.0 HARDENED标准)
    this.checkpointInterval = 64;
    this.checkpointIntervalBytes = 64 * 1024 * 1024;
    
    // 状态追踪
    this.baselineHeap = this.captureMemory();
    this.baselineHeapMB = this.baselineHeap / 1024 / 1024;
    this.checkpoints = [];
    this.isEnforcing = true;
    this.enforceCount = 0;
    this.violationCount = 0;
    
    // 峰值追踪
    this.peakHeap = this.baselineHeap;
    this.peakHeapMB = this.baselineHeapMB;
    this.peakDeltaMB = 0;
    
    // 时间追踪
    this.createdAt = Date.now();
    this.lastCheckpointAt = null;
  }
  
  // ==========================================================================
  // 核心公共方法
  // ==========================================================================
  
  /**
   * 预分配检查 - 流处理前预检
   * 
   * 根据文件大小估算峰值内存，提前拒绝无法处理的文件
   * 
   * @param {number} fileSize - 文件大小(字节)
   * @returns {Object} 预检结果
   * @returns {boolean} .canProcess - 是否可以处理
   * @returns {number} .maxChunks - 最大块数
   * @returns {number} .estimatedPeakMB - 估算峰值内存(MB)
   * @returns {string} [rejectionReason] - 拒绝原因(当canProcess=false)
   */
  preflight(fileSize) {
    if (typeof fileSize !== 'number' || fileSize < 0) {
      throw new TypeError('fileSize must be a non-negative number');
    }
    
    // 计算块数 (64MB每块)
    const chunkSize = this.checkpointIntervalBytes;
    const maxChunks = Math.ceil(fileSize / chunkSize);
    
    // 估算峰值内存 = 当前 + (块数 * 每块开销)
    // 每块开销估算: 2MB (哈希表 + 指令缓冲区 + 安全余量)
    const perChunkOverheadMB = 2.0;
    const currentHeapMB = this.getCurrentHeapMB();
    const estimatedPeakMB = currentHeapMB + (maxChunks * perChunkOverheadMB);
    
    // 有效限制 = 限制 + 缓冲
    const effectiveLimitMB = this.maxMemoryMB + this.bufferMB;
    
    // HARDENED标准: 超过90%有效限制即拒绝（更保守）
    const thresholdMB = effectiveLimitMB * 0.90;
    
    if (estimatedPeakMB > thresholdMB) {
      return {
        canProcess: false,
        maxChunks: 0,
        estimatedPeakMB: parseFloat(estimatedPeakMB.toFixed(2)),
        rejectionReason: 
          `E2001: Memory preflight failed. Estimated peak ${estimatedPeakMB.toFixed(2)}MB ` +
          `exceeds 95% of effective limit ${effectiveLimitMB}MB ` +
          `(fileSize=${(fileSize/1024/1024).toFixed(2)}MB, maxChunks=${maxChunks})`
      };
    }
    
    return {
      canProcess: true,
      maxChunks,
      estimatedPeakMB: parseFloat(estimatedPeakMB.toFixed(2))
    };
  }
  
  /**
   * 硬截止检查 - enforce硬截止 (v1.1.0 HARDENED核心)
   * 
   * 检查当前内存使用，若超限则强制GC并throw Error
   * 禁止仅打印日志而不阻止执行!
   * 
   * @param {string} [operation='unknown'] - 当前操作名称(用于错误追踪)
   * @throws {MemoryLimitExceededError} 当内存超限时
   */
  enforceLimit(operation = 'unknown') {
    if (!this.isEnforcing) {
      return;
    }
    
    this.enforceCount++;
    
    const usage = process.memoryUsage();
    const heapUsed = usage.heapUsed;
    const external = usage.external || 0;
    const totalUsed = heapUsed + external;
    
    // 更新峰值
    if (heapUsed > this.peakHeap) {
      this.peakHeap = heapUsed;
      this.peakHeapMB = heapUsed / 1024 / 1024;
      const delta = this.peakHeapMB - this.baselineHeapMB;
      if (delta > this.peakDeltaMB) {
        this.peakDeltaMB = delta;
      }
    }
    
    // HARDENED标准: 实际使用 > 限制 + 缓冲
    const effectiveLimitBytes = this.maxMemoryBytes + this.bufferOverhead;
    
    if (totalUsed > effectiveLimitBytes) {
      this.violationCount++;
      
      // 第一次超限: 尝试强制GC
      this.triggerGC();
      
      // 再次检查
      const afterGCUsage = process.memoryUsage();
      const afterGCTotal = afterGCUsage.heapUsed + (afterGCUsage.external || 0);
      
      if (afterGCTotal > effectiveLimitBytes) {
        // 强制GC后仍超限: throw Error (HARDENED要求)
        const usedMB = afterGCTotal / 1024 / 1024;
        const limitMB = this.maxMemoryMB;
        const bufferMB = this.bufferMB;
        
        throw new MemoryLimitExceededError(
          `Memory limit exceeded: ${usedMB.toFixed(2)}MB > ${limitMB}MB limit + ${bufferMB}MB buffer ` +
          `(operation: ${operation})`,
          {
            code: 'E2001',
            operation,
            usedMB: parseFloat(usedMB.toFixed(2)),
            limitMB,
            bufferMB,
            heapUsedMB: parseFloat((afterGCUsage.heapUsed / 1024 / 1024).toFixed(2)),
            externalMB: parseFloat(((afterGCUsage.external || 0) / 1024 / 1024).toFixed(2)),
            beforeGC_MB: parseFloat((totalUsed / 1024 / 1024).toFixed(2)),
            enforceCount: this.enforceCount,
            violationCount: this.violationCount
          }
        );
      }
    }
  }
  
  /**
   * 检查点 - 每处理64MB块后调用 (v1.1.0 HARDENED)
   * 
   * @param {number} chunkIndex - 块索引(从1开始)
   * @throws {CheckpointViolationError} 当检查点内存超限时
   */
  checkpoint(chunkIndex) {
    if (typeof chunkIndex !== 'number' || chunkIndex < 1) {
      throw new TypeError('chunkIndex must be a positive integer');
    }
    
    const currentHeap = this.captureMemory();
    const now = Date.now();
    
    // 记录检查点
    this.checkpoints.push({
      index: chunkIndex,
      heapUsed: currentHeap,
      heapUsedMB: parseFloat((currentHeap / 1024 / 1024).toFixed(2)),
      timestamp: now,
      deltaFromBaseline: parseFloat(((currentHeap - this.baselineHeap) / 1024 / 1024).toFixed(2))
    });
    
    this.lastCheckpointAt = now;
    
    // HARDENED标准: 每64MB块检查 (chunkIndex是块数，每块64MB)
    // 实际上checkpoint每块都调用，这里检查delta
    const deltaMB = (currentHeap - this.baselineHeap) / 1024 / 1024;
    const thresholdMB = this.maxMemoryMB * 0.95;
    
    if (deltaMB > thresholdMB) {
      // 尝试GC
      this.triggerGC();
      
      const afterGC = this.captureMemory();
      const afterGCDeltaMB = (afterGC - this.baselineHeap) / 1024 / 1024;
      
      if (afterGCDeltaMB > thresholdMB) {
        this.violationCount++;
        throw new CheckpointViolationError(
          `E2003: Checkpoint ${chunkIndex} violation. ` +
          `Memory delta ${afterGCDeltaMB.toFixed(2)}MB > 95% limit ${thresholdMB.toFixed(2)}MB ` +
          `(baseline: ${this.baselineHeapMB.toFixed(2)}MB, current: ${(afterGC/1024/1024).toFixed(2)}MB)`,
          {
            code: 'E2003',
            checkpoint: chunkIndex,
            deltaMB: parseFloat(afterGCDeltaMB.toFixed(2)),
            thresholdMB: parseFloat(thresholdMB.toFixed(2)),
            baselineMB: parseFloat(this.baselineHeapMB.toFixed(2)),
            currentMB: parseFloat((afterGC / 1024 / 1024).toFixed(2))
          }
        );
      }
    }
  }
  
  /**
   * 获取内存使用统计
   * 
   * @returns {Object} 内存统计
   * @returns {number} .currentHeapMB - 当前堆内存(MB)
   * @returns {number} .baselineHeapMB - 基线堆内存(MB)
   * @returns {number} .deltaFromBaselineMB - 与基线差值(MB)
   * @returns {number} .effectiveLimitMB - 有效限制(MB) = limit + buffer
   * @returns {number} .checkpointsPassed - 通过的检查点数
   * @returns {boolean} .isLimitExceeded - 是否已超过限制
   * @returns {number} .peakHeapMB - 峰值堆内存(MB)
   * @returns {number} .peakDeltaMB - 峰值与基线差值(MB)
   * @returns {number} .enforceCount - enforceLimit调用次数
   * @returns {number} .violationCount - 违规次数
   */
  getStats() {
    const currentHeap = this.captureMemory();
    const currentHeapMB = currentHeap / 1024 / 1024;
    const deltaMB = currentHeapMB - this.baselineHeapMB;
    
    // 更新峰值
    if (currentHeap > this.peakHeap) {
      this.peakHeap = currentHeap;
      this.peakHeapMB = currentHeapMB;
      if (deltaMB > this.peakDeltaMB) {
        this.peakDeltaMB = deltaMB;
      }
    }
    
    return {
      currentHeapMB: parseFloat(currentHeapMB.toFixed(2)),
      baselineHeapMB: parseFloat(this.baselineHeapMB.toFixed(2)),
      deltaFromBaselineMB: parseFloat(deltaMB.toFixed(2)),
      effectiveLimitMB: this.maxMemoryMB + this.bufferMB,
      checkpointsPassed: this.checkpoints.length,
      isLimitExceeded: (currentHeap + (process.memoryUsage().external || 0)) > 
                       (this.maxMemoryBytes + this.bufferOverhead),
      peakHeapMB: parseFloat(this.peakHeapMB.toFixed(2)),
      peakDeltaMB: parseFloat(this.peakDeltaMB.toFixed(2)),
      enforceCount: this.enforceCount,
      violationCount: this.violationCount,
      maxMemoryMB: this.maxMemoryMB,
      bufferMB: this.bufferMB,
      uptimeMS: Date.now() - this.createdAt
    };
  }
  
  // ==========================================================================
  // 内部私有方法
  // ==========================================================================
  
  /**
   * 捕获当前内存使用
   * @returns {number} 堆使用字节数
   * @private
   */
  captureMemory() {
    return process.memoryUsage().heapUsed;
  }
  
  /**
   * 获取当前堆内存(MB)
   * @returns {number}
   * @private
   */
  getCurrentHeapMB() {
    return this.captureMemory() / 1024 / 1024;
  }
  
  /**
   * 获取与基线的差值(MB)
   * @returns {number}
   * @private
   */
  getDeltaFromBaselineMB() {
    return (this.captureMemory() - this.baselineHeap) / 1024 / 1024;
  }
  
  /**
   * 触发垃圾回收 (如可用)
   * @private
   */
  triggerGC() {
    if (global.gc) {
      global.gc();
    }
  }
  
  // ==========================================================================
  // 控制方法
  // ==========================================================================
  
  /**
   * 暂停强制检查 (调试用，不推荐生产使用)
   */
  pauseEnforcing() {
    this.isEnforcing = false;
  }
  
  /**
   * 恢复强制检查
   */
  resumeEnforcing() {
    this.isEnforcing = true;
  }
  
  /**
   * 重置基线 (用于新的处理阶段)
   */
  resetBaseline() {
    this.baselineHeap = this.captureMemory();
    this.baselineHeapMB = this.baselineHeap / 1024 / 1024;
    this.checkpoints = [];
    this.peakHeap = this.baselineHeap;
    this.peakHeapMB = this.baselineHeapMB;
    this.peakDeltaMB = 0;
  }
}

// ============================================================================
// 导出
// ============================================================================

module.exports = {
  MemoryMonitor,
  MemoryLimitExceededError,
  PreflightRejectedError,
  CheckpointViolationError
};

// ES Module兼容
if (typeof exports === 'object' && typeof module !== 'undefined') {
  module.exports.default = MemoryMonitor;
}
