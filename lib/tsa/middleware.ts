/**
 * TSA中间件链
 * 
 * 日志/持久化/监控中间件
 * 
 * @module lib/tsa/middleware
 * @version 1.3.0
 */

import { AgentState, TSAConfig } from './types';
import { TSAStateMachine } from './state-machine';

// ========== 中间件类型 ==========

export type MiddlewareFn = (
  context: MiddlewareContext,
  next: () => void
) => void;

export interface MiddlewareContext {
  agentId: string;
  fromState: AgentState;
  toState: AgentState;
  trigger: string;
  timestamp: number;
  duration: number;
}

// ========== 日志中间件 ==========

export function createLoggingMiddleware(): MiddlewareFn {
  return (context, next) => {
    console.log(
      `[TSA] ${context.agentId}: ${context.fromState} -> ${context.toState} (${context.trigger}) +${context.duration}ms`
    );
    next();
  };
}

// ========== 持久化中间件 ==========

export function createPersistenceMiddleware(
  storageKey: string,
  storage: Storage = localStorage
): MiddlewareFn {
  return (context, next) => {
    next();
    
    // 流转完成后持久化
    try {
      const data = {
        agentId: context.agentId,
        state: context.toState,
        lastTransition: {
          from: context.fromState,
          to: context.toState,
          trigger: context.trigger,
          timestamp: context.timestamp,
        },
      };
      storage.setItem(`${storageKey}:${context.agentId}`, JSON.stringify(data));
    } catch (e) {
      console.warn(`[TSA] Persistence failed for ${context.agentId}:`, e);
    }
  };
}

// ========== 监控中间件 ==========

export interface MetricsCollector {
  recordTransition(metric: {
    agentId: string;
    from: AgentState;
    to: AgentState;
    duration: number;
    timestamp: number;
  }): void;
  getMetrics(agentId: string): unknown;
}

export function createMonitoringMiddleware(
  collector: MetricsCollector
): MiddlewareFn {
  return (context, next) => {
    const startTime = Date.now();
    
    next();
    
    collector.recordTransition({
      agentId: context.agentId,
      from: context.fromState,
      to: context.toState,
      duration: context.duration,
      timestamp: context.timestamp,
    });
  };
}

// ========== 中间件链 ==========

export class MiddlewareChain {
  private middlewares: MiddlewareFn[] = [];

  use(middleware: MiddlewareFn): this {
    this.middlewares.push(middleware);
    return this;
  }

  execute(context: MiddlewareContext): void {
    const executeNext = (index: number): void => {
      if (index >= this.middlewares.length) return;
      
      const middleware = this.middlewares[index];
      middleware(context, () => executeNext(index + 1));
    };

    executeNext(0);
  }
}

// ========== BNF协议解析器 ==========

import { BNFCommand, BNFParsedCommand } from './types';

export class BNFParser {
  private static readonly COMMAND_PATTERN = /^\[(SPAWN|TERMINATE|VACUUM|SUSPEND|RESUME|MIGRATE)\](?::(.+))?$/;

  static parse(input: string): BNFParsedCommand | null {
    const match = input.match(this.COMMAND_PATTERN);
    if (!match) return null;

    const command = `[${match[1]}]` as BNFCommand;
    const payloadStr = match[2];
    
    let payload: Record<string, unknown> | undefined;
    if (payloadStr) {
      try {
        payload = JSON.parse(payloadStr);
      } catch {
        payload = { raw: payloadStr };
      }
    }

    return { command, payload };
  }

  static stringify(command: BNFCommand, payload?: Record<string, unknown>): string {
    if (payload) {
      return `${command}:${JSON.stringify(payload)}`;
    }
    return command;
  }

  static isValid(input: string): boolean {
    return this.COMMAND_PATTERN.test(input);
  }
}

// ========== TSA管理器 ==========

export class TSAManager {
  private machines: Map<string, TSAStateMachine> = new Map();
  private middlewareChain: MiddlewareChain;
  private config: TSAConfig;

  constructor(config: TSAConfig) {
    this.config = config;
    this.middlewareChain = new MiddlewareChain();
    
    // 注册中间件
    if (config.middleware.logging) {
      this.middlewareChain.use(createLoggingMiddleware());
    }
    if (config.middleware.persistence) {
      this.middlewareChain.use(
        createPersistenceMiddleware(config.persistence.key)
      );
    }
  }

  /**
   * 创建代理状态机
   */
  createMachine(agentId: string, initialState?: AgentState): TSAStateMachine {
    const machine = new TSAStateMachine(agentId, initialState);
    
    // 包装transition以添加中间件
    const originalTransition = machine.transition.bind(machine);
    machine.transition = (trigger: string, payload?: unknown): boolean => {
      const fromState = machine.getState();
      const startTime = Date.now();
      
      const result = originalTransition(trigger, payload);
      
      if (result) {
        const toState = machine.getState();
        this.middlewareChain.execute({
          agentId,
          fromState,
          toState,
          trigger,
          timestamp: Date.now(),
          duration: Date.now() - startTime,
        });
      }
      
      return result;
    };

    this.machines.set(agentId, machine);
    
    // HARD隔离：持久化时清零
    if (this.config.isolation === 'HARD') {
      this.clearPersistence(agentId);
    }
    
    return machine;
  }

  /**
   * 获取状态机
   */
  getMachine(agentId: string): TSAStateMachine | undefined {
    return this.machines.get(agentId);
  }

  /**
   * 移除状态机
   */
  removeMachine(agentId: string): void {
    this.machines.delete(agentId);
  }

  /**
   * 解析并执行BNF命令
   */
  executeBNF(agentId: string, command: string): boolean {
    const parsed = BNFParser.parse(command);
    if (!parsed) return false;

    const machine = this.machines.get(agentId);
    if (!machine) return false;

    const triggerMap: Record<string, string> = {
      '[SPAWN]': 'activate',
      '[TERMINATE]': 'terminate',
      '[VACUUM]': 'vacuum',
      '[SUSPEND]': 'suspend',
      '[RESUME]': 'resume',
      '[MIGRATE]': 'migrate',
    };

    const trigger = triggerMap[parsed.command];
    if (!trigger) return false;

    return machine.transition(trigger, parsed.payload);
  }

  /**
   * 清理持久化（HARD隔离）
   */
  private clearPersistence(agentId: string): void {
    if (this.config.persistence.storage === 'localStorage') {
      try {
        localStorage.removeItem(`${this.config.persistence.key}:${agentId}`);
      } catch {
        // 忽略
      }
    }
  }
}

export default TSAManager;
