/**
 * B-06 React Hooks 模块 - useTSA Hook
 * 
 * TSA(Tiered Storage Architecture)存储Hook
 * 提供对分层存储的React集成
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { StorageTier } from '@/lib/storage/types';

// ============================================================================
// 类型定义
// ============================================================================

/** TSA Hook 配置选项 */
export interface UseTSAOptions {
  /** 默认存储层级 */
  defaultTier?: StorageTier;
  /** 自动刷新间隔（毫秒） */
  refreshInterval?: number;
  /** 是否在挂载时自动加载 */
  autoLoad?: boolean;
}

/** TSA Hook 返回值 */
export interface UseTSAReturn<T> {
  /** 当前值 */
  value: T | null;
  /** 设置新值 */
  set: (newValue: T, options?: { tier?: StorageTier; ttl?: number }) => Promise<void>;
  /** 删除值 */
  remove: () => Promise<void>;
  /** 是否加载中 */
  loading: boolean;
  /** 错误对象 */
  error: Error | null;
  /** 刷新数据 */
  refresh: () => Promise<void>;
  /** 是否已初始化 */
  initialized: boolean;
}

// ============================================================================
// API 路径配置
// ============================================================================

const API_BASE = '/api/tsa';

// ============================================================================
// Hook 实现
// ============================================================================

/**
 * TSA存储Hook
 * 
 * @param key - 存储键名
 * @param defaultValue - 默认值
 * @param options - 配置选项
 * @returns TSA操作方法和状态
 * 
 * @example
 * ```typescript
 * const { value, set, remove, loading, error } = useTSA('user-preferences', {});
 * 
 * // 设置值
 * await set({ theme: 'dark' }, { tier: StorageTier.HOT });
 * 
 * // 删除值
 * await remove();
 * ```
 */
export function useTSA<T>(
  key: string,
  defaultValue: T | null = null,
  options: UseTSAOptions = {}
): UseTSAReturn<T> {
  const { autoLoad = true } = options;
  
  // 状态
  const [value, setValue] = useState<T | null>(defaultValue);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [initialized, setInitialized] = useState<boolean>(false);
  
  // 使用 ref 跟踪组件挂载状态
  const isMountedRef = useRef<boolean>(true);
  // 使用 ref 存储 abort controller
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // 清理函数
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);
  
  /**
   * 从TSA获取值
   */
  const refresh = useCallback(async (): Promise<void> => {
    if (!key) {
      setError(new Error('Key is required'));
      return;
    }
    
    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE}/get?key=${encodeURIComponent(key)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: abortController.signal,
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          // 键不存在，使用默认值
          if (isMountedRef.current) {
            setValue(defaultValue);
            setInitialized(true);
          }
          return;
        }
        throw new Error(`Failed to get value: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (isMountedRef.current) {
        if (result.success && result.data !== undefined) {
          setValue(result.data as T);
        } else {
          setValue(defaultValue);
        }
        setInitialized(true);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // 请求被取消，不设置错误
        return;
      }
      
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [key, defaultValue]);
  
  /**
   * 设置值到TSA
   */
  const set = useCallback(async (
    newValue: T,
    setOptions?: { tier?: StorageTier; ttl?: number }
  ): Promise<void> => {
    if (!key) {
      throw new Error('Key is required');
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE}/set`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key,
          value: newValue,
          tier: setOptions?.tier ?? options.defaultTier,
          ttl: setOptions?.ttl,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to set value: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to set value');
      }
      
      if (isMountedRef.current) {
        setValue(newValue);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (isMountedRef.current) {
        setError(error);
      }
      throw error;
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [key, options.defaultTier]);
  
  /**
   * 从TSA删除值
   */
  const remove = useCallback(async (): Promise<void> => {
    if (!key) {
      throw new Error('Key is required');
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE}/delete?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete value: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete value');
      }
      
      if (isMountedRef.current) {
        setValue(defaultValue);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (isMountedRef.current) {
        setError(error);
      }
      throw error;
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [key, defaultValue]);
  
  // 自动加载
  useEffect(() => {
    if (autoLoad && key) {
      refresh();
    }
  }, [key, autoLoad, refresh]);
  
  // 自动刷新
  useEffect(() => {
    if (!options.refreshInterval || options.refreshInterval <= 0) {
      return;
    }
    
    const intervalId = setInterval(() => {
      refresh();
    }, options.refreshInterval);
    
    return () => {
      clearInterval(intervalId);
    };
  }, [options.refreshInterval, refresh]);
  
  return {
    value,
    set,
    remove,
    loading,
    error,
    refresh,
    initialized,
  };
}

export default useTSA;
