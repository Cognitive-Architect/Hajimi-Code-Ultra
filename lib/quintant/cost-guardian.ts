/**
 * Cost Guardian - OpenRouter 额度熔断器
 * 
 * ⚠️ 安全警告：此模块管理临时API密钥预算
 * - 有效期：2026-02-09 至 2026-02-16（7天）
 * - 预算上限：$1.00 USD（硬性熔断）
 * - 熔断阈值：90%预算自动切换Mock
 * - 债务：DEBT-QUIN-TEMP-KEY-001（P0-临时债务，需每周轮换）
 * 
 * @module lib/quintant/cost-guardian
 * @version 1.4.0
 * @priority P0
 */

export interface CostMetrics {
  totalSpent: number;
  remaining: number;
  fuseThreshold: number;
  lastRequestCost: number;
  requestCount: number;
}

export class CostGuardian {
  private static readonly BUDGET_USD = 1.00;
  private static readonly FUSE_THRESHOLD = 0.90; // 90%熔断线
  private static spent = 0.00;
  private static requestCount = 0;
  private static lastRequestCost = 0.00;
  private static fused = false;

  /**
   * 检查是否可继续请求
   * @param estimatedCost 预估成本（USD）
   * @returns boolean 是否允许继续
   */
  static canProceed(estimatedCost: number = 0.001): boolean {
    // 已熔断状态
    if (this.fused) {
      console.warn('[CostGuardian] 🛑 熔断器已触发，强制使用Mock模式');
      return false;
    }

    // 检查是否会超出熔断阈值
    const projectedSpend = this.spent + estimatedCost;
    const thresholdAmount = this.BUDGET_USD * this.FUSE_THRESHOLD;

    if (projectedSpend > thresholdAmount) {
      this.fused = true;
      console.warn(`[CostGuardian] 🛑 额度熔断触发！`);
      console.warn(`  已使用: $${this.spent.toFixed(4)} / $${this.BUDGET_USD}`);
      console.warn(`  熔断线: $${thresholdAmount.toFixed(4)} (90%)`);
      console.warn(`  状态: 强制切换Mock模式`);
      return false;
    }

    return true;
  }

  /**
   * 记录实际成本
   * @param actualCost 实际成本（USD）
   */
  static recordCost(actualCost: number): void {
    this.spent += actualCost;
    this.lastRequestCost = actualCost;
    this.requestCount++;

    // 实时警告
    const percentage = (this.spent / this.BUDGET_USD) * 100;
    if (percentage >= 80 && percentage < 90) {
      console.warn(`[CostGuardian] ⚠️ 额度警告: ${percentage.toFixed(1)}%`);
    }
  }

  /**
   * 从响应头解析成本
   * @param headers OpenRouter响应头
   */
  static parseCostFromHeaders(headers: Record<string, string>): number {
    // OpenRouter 成本头字段
    const costHeader = headers['x-cost'] || headers['X-Cost'];
    if (costHeader) {
      return parseFloat(costHeader) || 0.0;
    }
    
    // 备用：通过token估算（约 $0.001/1K tokens）
    const inputTokens = parseInt(headers['x-input-tokens'] || '0');
    const outputTokens = parseInt(headers['x-output-tokens'] || '0');
    const estimatedCost = (inputTokens + outputTokens) / 1000 * 0.001;
    
    return estimatedCost;
  }

  /**
   * 获取当前额度状态
   */
  static getMetrics(): CostMetrics {
    return {
      totalSpent: this.spent,
      remaining: this.BUDGET_USD - this.spent,
      fuseThreshold: this.BUDGET_USD * this.FUSE_THRESHOLD,
      lastRequestCost: this.lastRequestCost,
      requestCount: this.requestCount,
    };
  }

  /**
   * 获取剩余预算
   */
  static getRemaining(): number {
    return this.BUDGET_USD - this.spent;
  }

  /**
   * 获取已使用百分比
   */
  static getUsagePercentage(): number {
    return (this.spent / this.BUDGET_USD) * 100;
  }

  /**
   * 是否已熔断
   */
  static isFused(): boolean {
    return this.fused;
  }

  /**
   * 手动熔断（紧急使用）
   */
  static emergencyFuse(): void {
    this.fused = true;
    console.error('[CostGuardian] 🚨 紧急熔断已触发！');
  }

  /**
   * 重置熔断器（仅测试使用）
   */
  static resetForTesting(): void {
    this.spent = 0.00;
    this.requestCount = 0;
    this.lastRequestCost = 0.00;
    this.fused = false;
    console.log('[CostGuardian] 测试重置完成');
  }

  /**
   * 预算状态摘要
   */
  static printStatus(): void {
    const metrics = this.getMetrics();
    console.log('\n╔══════════════════════════════════════╗');
    console.log('║     OpenRouter 额度状态 (v1.4.0)      ║');
    console.log('╠══════════════════════════════════════╣');
    console.log(`║ 预算上限: $${this.BUDGET_USD.toFixed(2)} USD              ║`);
    console.log(`║ 已使用:   $${metrics.totalSpent.toFixed(4)} (${this.getUsagePercentage().toFixed(1)}%)      ║`);
    console.log(`║ 剩余:     $${metrics.remaining.toFixed(4)}               ║`);
    console.log(`║ 熔断线:   $${metrics.fuseThreshold.toFixed(4)} (90%)      ║`);
    console.log(`║ 请求数:   ${metrics.requestCount}                     ║`);
    console.log(`║ 状态:     ${this.fused ? '🛑 已熔断' : '🟢 正常'}              ║`);
    console.log('╚══════════════════════════════════════╝\n');
  }
}

export default CostGuardian;
