/**
 * Budget Controller Module - 预算分配与熔断控制
 * HAJIMI-PHASE2-IMPL-001 工单 B-06/06：路线F-AutoPay实现
 *
 * 功能：月度预算上限、超支检测、熔断响应<5s（PAY-003）
 * 自测点：PAY-003 - 超支熔断<5s
 *
 * @module autopay/budget/controller
 * @version 1.0.0
 */

// =============================================================================
// 类型定义
// =============================================================================

export type BudgetPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly';
export type BudgetCategory = 'compute' | 'storage' | 'api' | 'ml' | 'misc';
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface BudgetConfig {
  period: BudgetPeriod;
  totalLimit: number; // 预算上限（美元）
  categories: Record<BudgetCategory, {
    limit: number;
    alertThreshold: number; // 0-1，告警阈值比例
  }>;
  circuitBreaker: {
    enabled: boolean;
    failureThreshold: number; // 连续失败次数阈值
    recoveryTimeout: number; // 恢复超时（毫秒）
    halfOpenMaxCalls: number; // 半开状态最大测试请求
  };
}

export interface BudgetUsage {
  period: string;
  total: number;
  categories: Record<BudgetCategory, number>;
  lastUpdated: string;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
}

export interface BudgetAlert {
  id: string;
  level: 'info' | 'warning' | 'critical';
  category: BudgetCategory | 'total';
  message: string;
  usage: number;
  limit: number;
  percentage: number;
  timestamp: string;
}

export interface BudgetReport {
  config: BudgetConfig;
  currentUsage: BudgetUsage;
  remaining: number;
  percentage: number;
  alerts: BudgetAlert[];
  circuitBreaker: CircuitBreakerMetrics;
  projections: {
    estimatedMonthlyTotal: number;
    willExceed: boolean;
    daysUntilExhausted: number | null;
  };
}

// =============================================================================
// 配置常量
// =============================================================================

const DEFAULT_CONFIG: BudgetConfig = {
  period: 'monthly',
  totalLimit: 1000, // $1000/月
  categories: {
    compute: { limit: 400, alertThreshold: 0.8 },
    storage: { limit: 200, alertThreshold: 0.8 },
    api: { limit: 300, alertThreshold: 0.8 },
    ml: { limit: 150, alertThreshold: 0.7 },
    misc: { limit: 50, alertThreshold: 0.9 },
  },
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    recoveryTimeout: 30000, // 30秒
    halfOpenMaxCalls: 3,
  },
};

// 熔断响应时间目标：<5s
const CIRCUIT_BREAKER_TIMEOUT = 5000;

// =============================================================================
// 预算控制器类
// =============================================================================

export class BudgetController {
  private config: BudgetConfig;
  private usage: BudgetUsage;
  private circuitBreaker: CircuitBreakerMetrics;
  private alerts: BudgetAlert[] = [];
  private alertListeners: Array<(alert: BudgetAlert) => void> = [];

  constructor(config: Partial<BudgetConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.usage = this.initializeUsage();
    this.circuitBreaker = this.initializeCircuitBreaker();
  }

  // ==========================================================================
  // 初始化方法
  // ==========================================================================

  private initializeUsage(): BudgetUsage {
    return {
      period: this.getCurrentPeriod(),
      total: 0,
      categories: {
        compute: 0,
        storage: 0,
        api: 0,
        ml: 0,
        misc: 0,
      },
      lastUpdated: new Date().toISOString(),
    };
  }

  private initializeCircuitBreaker(): CircuitBreakerMetrics {
    return {
      state: 'CLOSED',
      failureCount: 0,
      successCount: 0,
      lastFailureTime: 0,
      lastSuccessTime: Date.now(),
      consecutiveSuccesses: 0,
      consecutiveFailures: 0,
    };
  }

  private getCurrentPeriod(): string {
    const now = new Date();
    switch (this.config.period) {
      case 'daily':
        return now.toISOString().split('T')[0];
      case 'weekly':
        const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
        return weekStart.toISOString().split('T')[0];
      case 'monthly':
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      case 'quarterly':
        const quarter = Math.floor(now.getMonth() / 3) + 1;
        return `${now.getFullYear()}-Q${quarter}`;
      default:
        return now.toISOString();
    }
  }

  // ==========================================================================
  // 预算跟踪方法
  // ==========================================================================

  /**
   * 记录支出
   * @param amount 金额（美元）
   * @param category 支出类别
   * @returns 是否超出预算
   */
  recordExpense(amount: number, category: BudgetCategory): boolean {
    // 检查是否需要重置周期
    if (this.shouldResetPeriod()) {
      this.resetPeriod();
    }

    // 更新支出
    this.usage.total += amount;
    this.usage.categories[category] += amount;
    this.usage.lastUpdated = new Date().toISOString();

    // 检查告警条件
    this.checkAlerts(category);

    // 返回是否超支
    return this.isOverBudget();
  }

  /**
   * 批量记录支出
   */
  recordExpenses(expenses: Array<{ amount: number; category: BudgetCategory }>): void {
    for (const expense of expenses) {
      this.recordExpense(expense.amount, expense.category);
    }
  }

  /**
   * 获取剩余预算
   */
  getRemainingBudget(): number {
    return Math.max(0, this.config.totalLimit - this.usage.total);
  }

  /**
   * 获取预算使用率
   */
  getUsagePercentage(): number {
    return (this.usage.total / this.config.totalLimit) * 100;
  }

  /**
   * 是否超出预算
   */
  isOverBudget(): boolean {
    return this.usage.total >= this.config.totalLimit;
  }

  /**
   * 特定类别是否超出预算
   */
  isCategoryOverBudget(category: BudgetCategory): boolean {
    return this.usage.categories[category] >= this.config.categories[category].limit;
  }

  // ==========================================================================
  // 熔断器方法（核心功能 - PAY-003）
  // ==========================================================================

  /**
   * 执行带熔断保护的操作
   * 目标响应时间：<5s
   */
  async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    context?: string
  ): Promise<T | null> {
    const startTime = Date.now();

    try {
      // 检查熔断器状态
      if (!this.canExecute()) {
        const error = new Error(`Circuit breaker is ${this.circuitBreaker.state}`);
        this.triggerAlert({
          id: this.generateAlertId(),
          level: 'critical',
          category: 'compute',
          message: `Circuit breaker OPEN: ${context || 'operation blocked'}`,
          usage: this.usage.total,
          limit: this.config.totalLimit,
          percentage: this.getUsagePercentage(),
          timestamp: new Date().toISOString(),
        });
        throw error;
      }

      // 执行操作（带超时）
      const result = await this.executeWithTimeout(operation, CIRCUIT_BREAKER_TIMEOUT);

      // 记录成功
      this.recordSuccess();

      // 检查响应时间
      const duration = Date.now() - startTime;
      if (duration > CIRCUIT_BREAKER_TIMEOUT) {
        console.warn(`[BudgetController] Operation exceeded ${CIRCUIT_BREAKER_TIMEOUT}ms: ${duration}ms`);
      }

      return result;
    } catch (error) {
      // 记录失败
      this.recordFailure();

      // 如果是熔断器打开，重新抛出
      if (this.circuitBreaker.state === 'OPEN') {
        throw error;
      }

      return null;
    }
  }

  /**
   * 检查是否可以执行操作
   */
  private canExecute(): boolean {
    // 如果熔断器关闭，允许执行
    if (this.circuitBreaker.state === 'CLOSED') {
      return true;
    }

    // 如果熔断器打开，检查是否超时
    if (this.circuitBreaker.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailureTime;
      if (timeSinceLastFailure >= this.config.circuitBreaker.recoveryTimeout) {
        // 切换到半开状态
        this.circuitBreaker.state = 'HALF_OPEN';
        this.circuitBreaker.consecutiveSuccesses = 0;
        return true;
      }
      return false;
    }

    // 半开状态，限制请求数量
    if (this.circuitBreaker.state === 'HALF_OPEN') {
      return this.circuitBreaker.consecutiveSuccesses < this.config.circuitBreaker.halfOpenMaxCalls;
    }

    return false;
  }

  /**
   * 带超时的执行
   */
  private executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeout}ms`));
      }, timeout);

      operation()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * 记录成功
   */
  private recordSuccess(): void {
    this.circuitBreaker.successCount++;
    this.circuitBreaker.lastSuccessTime = Date.now();
    this.circuitBreaker.consecutiveSuccesses++;
    this.circuitBreaker.consecutiveFailures = 0;

    // 半开状态下，连续成功足够次数后关闭熔断器
    if (
      this.circuitBreaker.state === 'HALF_OPEN' &&
      this.circuitBreaker.consecutiveSuccesses >= this.config.circuitBreaker.halfOpenMaxCalls
    ) {
      this.circuitBreaker.state = 'CLOSED';
      this.circuitBreaker.failureCount = 0;
    }
  }

  /**
   * 记录失败
   */
  private recordFailure(): void {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();
    this.circuitBreaker.consecutiveFailures++;
    this.circuitBreaker.consecutiveSuccesses = 0;

    // 达到失败阈值，打开熔断器
    if (
      this.circuitBreaker.consecutiveFailures >= this.config.circuitBreaker.failureThreshold
    ) {
      this.circuitBreaker.state = 'OPEN';
      
      // 触发熔断告警
      this.triggerAlert({
        id: this.generateAlertId(),
        level: 'critical',
        category: 'compute',
        message: `Circuit breaker OPENED after ${this.circuitBreaker.consecutiveFailures} consecutive failures`,
        usage: this.usage.total,
        limit: this.config.totalLimit,
        percentage: this.getUsagePercentage(),
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ==========================================================================
  // 告警系统
  // ==========================================================================

  /**
   * 检查告警条件
   */
  private checkAlerts(category: BudgetCategory): void {
    const categoryUsage = this.usage.categories[category];
    const categoryConfig = this.config.categories[category];
    const categoryPercentage = categoryUsage / categoryConfig.limit;

    // 检查类别告警
    if (categoryPercentage >= categoryConfig.alertThreshold) {
      const level: BudgetAlert['level'] =
        categoryPercentage >= 1 ? 'critical' : categoryPercentage >= 0.9 ? 'warning' : 'info';

      this.triggerAlert({
        id: this.generateAlertId(),
        level,
        category,
        message: `${category} budget ${level === 'critical' ? 'EXCEEDED' : 'threshold reached'}: $${categoryUsage.toFixed(2)} / $${categoryConfig.limit}`,
        usage: categoryUsage,
        limit: categoryConfig.limit,
        percentage: categoryPercentage * 100,
        timestamp: new Date().toISOString(),
      });
    }

    // 检查总预算告警
    const totalPercentage = this.getUsagePercentage();
    if (totalPercentage >= 90) {
      this.triggerAlert({
        id: this.generateAlertId(),
        level: totalPercentage >= 100 ? 'critical' : 'warning',
        category: 'total',
        message: `Total budget ${totalPercentage >= 100 ? 'EXCEEDED' : 'critical'}: $${this.usage.total.toFixed(2)} / $${this.config.totalLimit}`,
        usage: this.usage.total,
        limit: this.config.totalLimit,
        percentage: totalPercentage,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * 触发告警
   */
  private triggerAlert(alert: BudgetAlert): void {
    this.alerts.push(alert);
    
    // 通知监听器
    this.alertListeners.forEach((listener) => {
      try {
        listener(alert);
      } catch (error) {
        console.error('[BudgetController] Alert listener error:', error);
      }
    });

    // 限制告警历史数量
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-50);
    }
  }

  /**
   * 添加告警监听器
   */
  onAlert(listener: (alert: BudgetAlert) => void): () => void {
    this.alertListeners.push(listener);
    return () => {
      const index = this.alertListeners.indexOf(listener);
      if (index > -1) {
        this.alertListeners.splice(index, 1);
      }
    };
  }

  /**
   * 生成告警ID
   */
  private generateAlertId(): string {
    return `ALT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // ==========================================================================
  // 周期管理
  // ==========================================================================

  private shouldResetPeriod(): boolean {
    return this.usage.period !== this.getCurrentPeriod();
  }

  private resetPeriod(): void {
    this.usage = this.initializeUsage();
    this.alerts = [];
    console.log('[BudgetController] Period reset:', this.usage.period);
  }

  // ==========================================================================
  // 预测与报告
  // ==========================================================================

  /**
   * 生成预算报告
   */
  generateReport(): BudgetReport {
    const daysInPeriod = this.getDaysInPeriod();
    const daysElapsed = this.getDaysElapsed();
    const dailyAverage = daysElapsed > 0 ? this.usage.total / daysElapsed : 0;
    const projectedTotal = dailyAverage * daysInPeriod;

    return {
      config: this.config,
      currentUsage: this.usage,
      remaining: this.getRemainingBudget(),
      percentage: this.getUsagePercentage(),
      alerts: [...this.alerts],
      circuitBreaker: { ...this.circuitBreaker },
      projections: {
        estimatedMonthlyTotal: projectedTotal,
        willExceed: projectedTotal > this.config.totalLimit,
        daysUntilExhausted:
          dailyAverage > 0
            ? Math.floor(this.getRemainingBudget() / dailyAverage)
            : null,
      },
    };
  }

  private getDaysInPeriod(): number {
    switch (this.config.period) {
      case 'daily':
        return 1;
      case 'weekly':
        return 7;
      case 'monthly':
        return 30;
      case 'quarterly':
        return 90;
      default:
        return 30;
    }
  }

  private getDaysElapsed(): number {
    const periodStart = new Date(this.usage.period);
    const now = new Date();
    return Math.floor((now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
  }

  // ==========================================================================
  // 配置管理
  // ==========================================================================

  updateConfig(config: Partial<BudgetConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): BudgetConfig {
    return { ...this.config };
  }
}

// =============================================================================
// 便捷函数
// =============================================================================

let defaultController: BudgetController | null = null;

export function getBudgetController(config?: Partial<BudgetConfig>): BudgetController {
  if (!defaultController) {
    defaultController = new BudgetController(config);
  }
  return defaultController;
}

export function resetBudgetController(): void {
  defaultController = null;
}

export default BudgetController;
