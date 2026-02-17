/**
 * TSA 状态持久化实现
 * 
 * DEBT-007 修复：TSA状态持久化
 * - 四状态完整持久化（IDLE, ACTIVE, SUSPENDED, TERMINATED）
 * - IndexedDB/Redis 存储支持
 * - 故障恢复一致性
 * 
 * @module lib/tsa/state-persistence
 * @version 1.0.0
 */

import { tsa } from '@/lib/tsa';

/**
 * TSA 四状态枚举
 */
export enum TSAState {
  IDLE = 'IDLE',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  TERMINATED = 'TERMINATED'
}

/**
 * 持久化状态数据结构
 */
export interface PersistedState {
  state: TSAState;
  timestamp: number;
  version: string;
  proposalId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 存储适配器接口
 */
export interface StateStorageAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, options?: { tier?: string }): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * TSA 状态持久化管理器
 */
export class TSAStatePersistence {
  private static instance: TSAStatePersistence;
  private storage: StateStorageAdapter;
  private readonly STATE_KEY = 'tsa:state';
  private readonly VERSION = '1.0';

  private constructor(storage?: StateStorageAdapter) {
    // 使用传入的存储适配器或默认使用 TSA 存储
    this.storage = storage || this.createDefaultStorage();
  }

  /**
   * 获取单例实例
   */
  static getInstance(storage?: StateStorageAdapter): TSAStatePersistence {
    if (!TSAStatePersistence.instance) {
      TSAStatePersistence.instance = new TSAStatePersistence(storage);
    }
    return TSAStatePersistence.instance;
  }

  /**
   * 创建默认存储适配器（基于 TSA）
   */
  private createDefaultStorage(): StateStorageAdapter {
    return {
      get: async <T>(key: string): Promise<T | undefined> => {
        return tsa.get<T>(key);
      },
      set: async <T>(key: string, value: T, options?: { tier?: string }): Promise<void> => {
        tsa.set(key, value, options);
      },
      remove: async (key: string): Promise<void> => {
        tsa.remove(key);
      },
      clear: async (): Promise<void> => {
        tsa.clear();
      },
    };
  }

  /**
   * 生成状态存储键
   */
  private getStateKey(proposalId?: string): string {
    return proposalId 
      ? `${this.STATE_KEY}:${proposalId}` 
      : this.STATE_KEY;
  }

  /**
   * 持久化状态
   * @param state - 要持久化的状态
   * @param proposalId - 可选的提案ID
   */
  async persist(state: TSAState, proposalId?: string): Promise<void> {
    const data: PersistedState = {
      state,
      timestamp: Date.now(),
      version: this.VERSION,
      proposalId,
    };

    const key = this.getStateKey(proposalId);
    await this.storage.set(key, data, { tier: 'STAGING' });
  }

  /**
   * 恢复状态
   * @param proposalId - 可选的提案ID
   * @returns 恢复的状态，如果没有则返回 IDLE
   */
  async recover(proposalId?: string): Promise<TSAState> {
    const key = this.getStateKey(proposalId);
    const data = await this.storage.get<PersistedState>(key);

    if (!data) {
      return TSAState.IDLE;
    }

    // 验证状态有效性
    if (!this.isValidState(data.state)) {
      throw new Error(`Invalid persisted state: ${data.state}`);
    }

    return data.state;
  }

  /**
   * 验证状态是否有效
   */
  private isValidState(state: unknown): state is TSAState {
    return Object.values(TSAState).includes(state as TSAState);
  }

  /**
   * 获取完整持久化数据
   * @param proposalId - 可选的提案ID
   */
  async getPersistedData(proposalId?: string): Promise<PersistedState | undefined> {
    const key = this.getStateKey(proposalId);
    return this.storage.get<PersistedState>(key);
  }

  /**
   * 清除持久化状态
   * @param proposalId - 可选的提案ID，如果不传则清除所有
   */
  async clear(proposalId?: string): Promise<void> {
    if (proposalId) {
      const key = this.getStateKey(proposalId);
      await this.storage.remove(key);
    } else {
      await this.storage.clear();
    }
  }

  /**
   * 验证持久化一致性
   * @param expectedState - 期望的状态
   * @param proposalId - 可选的提案ID
   */
  async verifyPersistence(expectedState: TSAState, proposalId?: string): Promise<{
    consistent: boolean;
    persistedState: TSAState | undefined;
    expectedState: TSAState;
  }> {
    const persistedState = await this.recover(proposalId);
    const consistent = persistedState === expectedState;

    return {
      consistent,
      persistedState,
      expectedState,
    };
  }
}

/**
 * IndexedDB 存储实现
 */
export class IndexedDBStateStorage implements StateStorageAdapter {
  private dbName = 'tsa';
  private storeName = 'states';
  private db: IDBDatabase | null = null;

  /**
   * 打开 IndexedDB 数据库
   */
  private async openDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
    });
  }

  async get<T>(key: string): Promise<T | undefined> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : undefined);
      };
    });
  }

  async set<T>(key: string, value: T): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.put({ id: key, value, timestamp: Date.now() });

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async remove(key: string): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.delete(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clear(): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

/**
 * Redis 存储实现
 */
export class RedisStateStorage implements StateStorageAdapter {
  private redisUrl: string;

  constructor(redisUrl: string = process.env.REDIS_URL || 'redis://localhost:6379') {
    this.redisUrl = redisUrl;
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const response = await fetch(`${this.redisUrl}/get/${key}`);
      if (!response.ok) return undefined;
      const data = await response.json();
      return data as T;
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      await fetch(`${this.redisUrl}/set/${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      });
    } catch (error) {
      throw new Error(`Redis set failed: ${error}`);
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await fetch(`${this.redisUrl}/del/${key}`, { method: 'DELETE' });
    } catch (error) {
      throw new Error(`Redis remove failed: ${error}`);
    }
  }

  async clear(): Promise<void> {
    try {
      await fetch(`${this.redisUrl}/flush`, { method: 'POST' });
    } catch (error) {
      throw new Error(`Redis clear failed: ${error}`);
    }
  }
}

// 导出单例
export const tsaStatePersistence = TSAStatePersistence.getInstance();
export default tsaStatePersistence;
