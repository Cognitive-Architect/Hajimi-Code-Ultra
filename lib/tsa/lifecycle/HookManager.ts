/**
 * TSA 生命周期钩子管理器
 * 
 * 功能：
 * - 生命周期事件钩子管理
 * - 钩子执行与错误处理
 * - 异步钩子支持
 * - 钩子超时控制
 */

import { 
  LifecycleHookType, 
  LifecycleHook, 
  IHookManager,
  HookExecutionResult,
  LifecycleHookContext,
  PersistContext,
  RestoreContext,
  EvictContext,
  ErrorContext,
  ExpireContext,
  AccessContext,
  MigrateContext,
} from './types';

export interface HookConfig {
  /** 钩子超时时间（毫秒） */
  timeout: number;
  /** 是否在钩子错误时继续 */
  continueOnError: boolean;
  /** 是否并行执行钩子 */
  parallel: boolean;
}

export const DEFAULT_HOOK_CONFIG: HookConfig = {
  timeout: 5000, // 5秒超时
  continueOnError: true,
  parallel: false,
};

export class HookManager implements IHookManager {
  private hooks: Map<LifecycleHookType, Set<LifecycleHook>>;
  private config: HookConfig;

  constructor(config?: Partial<HookConfig>) {
    this.hooks = new Map();
    this.config = { ...DEFAULT_HOOK_CONFIG, ...config };

    // 初始化所有钩子类型
    const hookTypes: LifecycleHookType[] = [
      'onPersist',
      'onRestore',
      'onEvict',
      'onError',
      'onExpire',
      'onAccess',
      'onMigrate',
    ];
    for (const type of hookTypes) {
      this.hooks.set(type, new Set());
    }
  }

  /**
   * 注册钩子
   */
  register<T>(type: LifecycleHookType, hook: LifecycleHook<T>): () => void {
    const hooks = this.hooks.get(type);
    if (!hooks) {
      throw new Error(`Unknown hook type: ${type}`);
    }

    // 类型断言：我们信任调用者传入正确的钩子类型
    hooks.add(hook as LifecycleHook);

    // 返回取消注册函数
    return () => {
      hooks.delete(hook as LifecycleHook);
    };
  }

  /**
   * 批量注册钩子
   */
  batchRegister(hooks: Partial<Record<LifecycleHookType, LifecycleHook>>): () => void {
    const unsubscribes: Array<() => void> = [];

    for (const [type, hook] of Object.entries(hooks)) {
      if (hook) {
        unsubscribes.push(this.register(type as LifecycleHookType, hook));
      }
    }

    // 返回批量取消注册函数
    return () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    };
  }

  /**
   * 触发钩子
   */
  async emit<T>(type: LifecycleHookType, context: T): Promise<HookExecutionResult[]> {
    const hooks = this.hooks.get(type);
    if (!hooks || hooks.size === 0) {
      return [];
    }

    const results: HookExecutionResult[] = [];

    if (this.config.parallel) {
      // 并行执行
      const promises = Array.from(hooks).map(async (hook, index) => {
        const result = await this.executeHook(type, hook, context, index);
        return result;
      });

      const settledResults = await Promise.all(promises);
      results.push(...settledResults);
    } else {
      // 串行执行
      let index = 0;
      for (const hook of hooks) {
        const result = await this.executeHook(type, hook, context, index);
        results.push(result);

        // 如果配置为不继续，且执行失败，则停止
        if (!this.config.continueOnError && !result.success) {
          break;
        }
        index++;
      }
    }

    return results;
  }

  /**
   * 检查是否有钩子
   */
  hasHook(type: LifecycleHookType): boolean {
    const hooks = this.hooks.get(type);
    return hooks !== undefined && hooks.size > 0;
  }

  /**
   * 获取钩子数量
   */
  getHookCount(type?: LifecycleHookType): number {
    if (type) {
      return this.hooks.get(type)?.size ?? 0;
    }

    let total = 0;
    for (const hooks of this.hooks.values()) {
      total += hooks.size;
    }
    return total;
  }

  /**
   * 清除指定类型的钩子
   */
  clearType(type: LifecycleHookType): boolean {
    const hooks = this.hooks.get(type);
    if (hooks) {
      hooks.clear();
      return true;
    }
    return false;
  }

  /**
   * 清除所有钩子
   */
  clear(): void {
    for (const hooks of this.hooks.values()) {
      hooks.clear();
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<HookConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取配置
   */
  getConfig(): HookConfig {
    return { ...this.config };
  }

  // ============================================================================
  // 便捷方法（双重用途：注册或触发）
  // ============================================================================

  /**
   * onPersist 钩子 - 传入函数则注册，传入上下文则触发
   */
  onPersist(hook: LifecycleHook<PersistContext>): () => void;
  onPersist(context: PersistContext): Promise<HookExecutionResult[]>;
  onPersist(arg: LifecycleHook<PersistContext> | PersistContext): (() => void) | Promise<HookExecutionResult[]> {
    if (typeof arg === 'function') {
      return this.register('onPersist', arg);
    }
    return this.emit('onPersist', arg);
  }

  /**
   * onRestore 钩子 - 传入函数则注册，传入上下文则触发
   */
  onRestore(hook: LifecycleHook<RestoreContext>): () => void;
  onRestore(context: RestoreContext): Promise<HookExecutionResult[]>;
  onRestore(arg: LifecycleHook<RestoreContext> | RestoreContext): (() => void) | Promise<HookExecutionResult[]> {
    if (typeof arg === 'function') {
      return this.register('onRestore', arg);
    }
    return this.emit('onRestore', arg);
  }

  /**
   * onEvict 钩子 - 传入函数则注册，传入上下文则触发
   */
  onEvict(hook: LifecycleHook<EvictContext>): () => void;
  onEvict(context: EvictContext): Promise<HookExecutionResult[]>;
  onEvict(arg: LifecycleHook<EvictContext> | EvictContext): (() => void) | Promise<HookExecutionResult[]> {
    if (typeof arg === 'function') {
      return this.register('onEvict', arg);
    }
    return this.emit('onEvict', arg);
  }

  /**
   * onError 钩子 - 传入函数则注册，传入上下文则触发
   */
  onError(hook: LifecycleHook<ErrorContext>): () => void;
  onError(context: ErrorContext): Promise<HookExecutionResult[]>;
  onError(arg: LifecycleHook<ErrorContext> | ErrorContext): (() => void) | Promise<HookExecutionResult[]> {
    if (typeof arg === 'function') {
      return this.register('onError', arg);
    }
    return this.emit('onError', arg);
  }

  /**
   * onExpire 钩子 - 传入函数则注册，传入上下文则触发
   */
  onExpire(hook: LifecycleHook<ExpireContext>): () => void;
  onExpire(context: ExpireContext): Promise<HookExecutionResult[]>;
  onExpire(arg: LifecycleHook<ExpireContext> | ExpireContext): (() => void) | Promise<HookExecutionResult[]> {
    if (typeof arg === 'function') {
      return this.register('onExpire', arg);
    }
    return this.emit('onExpire', arg);
  }

  /**
   * onAccess 钩子 - 传入函数则注册，传入上下文则触发
   */
  onAccess(hook: LifecycleHook<AccessContext>): () => void;
  onAccess(context: AccessContext): Promise<HookExecutionResult[]>;
  onAccess(arg: LifecycleHook<AccessContext> | AccessContext): (() => void) | Promise<HookExecutionResult[]> {
    if (typeof arg === 'function') {
      return this.register('onAccess', arg);
    }
    return this.emit('onAccess', arg);
  }

  /**
   * onMigrate 钩子 - 传入函数则注册，传入上下文则触发
   */
  onMigrate(hook: LifecycleHook<MigrateContext>): () => void;
  onMigrate(context: MigrateContext): Promise<HookExecutionResult[]>;
  onMigrate(arg: LifecycleHook<MigrateContext> | MigrateContext): (() => void) | Promise<HookExecutionResult[]> {
    if (typeof arg === 'function') {
      return this.register('onMigrate', arg);
    }
    return this.emit('onMigrate', arg);
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 执行单个钩子
   */
  private async executeHook<T>(
    type: LifecycleHookType,
    hook: LifecycleHook,
    context: T,
    index: number
  ): Promise<HookExecutionResult> {
    const startTime = performance.now();
    const result: HookExecutionResult = {
      type,
      success: true,
      executionTime: 0,
    };

    try {
      // 使用 Promise.race 实现超时控制
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Hook execution timeout after ${this.config.timeout}ms`));
        }, this.config.timeout);
      });

      const hookPromise = Promise.resolve(hook(context as LifecycleHookContext));
      await Promise.race([hookPromise, timeoutPromise]);

      result.executionTime = Math.round(performance.now() - startTime);
    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error.message : 'Unknown error';
      result.executionTime = Math.round(performance.now() - startTime);

      console.error(`Hook execution error [${type}#${index}]:`, error);
    }

    return result;
  }
}

export default HookManager;
