# 第6章 React Hooks（B-06）

> **文档版本**: v1.0  
> **创建日期**: 2026-02-13  
> **关联任务**: fix.md Task 6  
> **预计工期**: 3天

---

## 6.1 useTSA Hook

### 6.1.1 设计目标

`useTSA` Hook 提供对 TSA 三层存储的 React 友好访问方式，封装数据读写、加载状态和错误处理逻辑。

### 6.1.2 接口定义

```typescript
// app/hooks/useTSA.ts

import { useState, useEffect, useCallback, useRef } from 'react';
import { tsa, StorageTier } from '@/lib/tsa';

export interface UseTSAReturn<T> {
  /** 当前存储的值 */
  value: T | null;
  /** 设置新值 */
  set: (newValue: T, options?: { tier?: StorageTier; ttl?: number }) => Promise<void>;
  /** 删除值 */
  remove: () => Promise<void>;
  /** 是否正在加载 */
  loading: boolean;
  /** 错误对象 */
  error: Error | null;
  /** 重新加载 */
  refresh: () => Promise<void>;
  /** 是否已初始化 */
  initialized: boolean;
}

export interface UseTSAOptions {
  /** 默认存储层级 */
  defaultTier?: StorageTier;
  /** 默认TTL (毫秒) */
  defaultTTL?: number;
  /** 是否在挂载时自动加载 */
  autoLoad?: boolean;
  /** 加载失败时重试次数 */
  retryCount?: number;
}
```

### 6.1.3 完整实现

```typescript
// app/hooks/useTSA.ts

import { useState, useEffect, useCallback, useRef } from 'react';
import { tsa, StorageTier } from '@/lib/tsa';

export interface UseTSAReturn<T> {
  value: T | null;
  set: (newValue: T, options?: { tier?: StorageTier; ttl?: number }) => Promise<void>;
  remove: () => Promise<void>;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  initialized: boolean;
}

export interface UseTSAOptions {
  defaultTier?: StorageTier;
  defaultTTL?: number;
  autoLoad?: boolean;
  retryCount?: number;
}

const DEFAULT_OPTIONS: Required<UseTSAOptions> = {
  defaultTier: StorageTier.TRANSIENT,
  defaultTTL: 5 * 60 * 1000, // 5分钟
  autoLoad: true,
  retryCount: 3,
};

/**
 * useTSA Hook - TSA三层存储的React封装
 * 
 * @example
 * ```tsx
 * function UserProfile({ userId }: { userId: string }) {
 *   const { value: user, loading, error, set: updateUser } = useTSA<User>(`user:${userId}`);
 *   
 *   if (loading) return <Spinner />;
 *   if (error) return <Error message={error.message} />;
 *   
 *   return (
 *     <div>
 *       <h1>{user?.name}</h1>
 *       <button onClick={() => updateUser({ ...user, name: 'New Name' })}>
 *         Update
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useTSA<T>(
  key: string,
  defaultValue: T | null = null,
  options: UseTSAOptions = {}
): UseTSAReturn<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  const [value, setValue] = useState<T | null>(defaultValue);
  const [loading, setLoading] = useState(opts.autoLoad);
  const [error, setError] = useState<Error | null>(null);
  const [initialized, setInitialized] = useState(false);
  
  const retryAttemptRef = useRef(0);
  const isMountedRef = useRef(true);

  // 从TSA加载数据
  const loadData = useCallback(async (): Promise<void> => {
    if (!key) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // 确保TSA已初始化
      if (!tsa.isInitialized()) {
        await tsa.init();
      }
      
      const data = await tsa.get<T>(key);
      
      if (isMountedRef.current) {
        setValue(data ?? defaultValue);
        setError(null);
        retryAttemptRef.current = 0;
      }
    } catch (err) {
      if (isMountedRef.current) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        
        // 重试逻辑
        if (retryAttemptRef.current < opts.retryCount) {
          retryAttemptRef.current++;
          setTimeout(() => loadData(), 1000 * retryAttemptRef.current);
        }
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setInitialized(true);
      }
    }
  }, [key, defaultValue, opts.retryCount]);

  // 写入数据
  const set = useCallback(async (
    newValue: T,
    writeOptions?: { tier?: StorageTier; ttl?: number }
  ): Promise<void> => {
    setLoading(true);
    setError(null);
    
    try {
      await tsa.set(key, newValue, {
        tier: writeOptions?.tier ?? opts.defaultTier,
        ttl: writeOptions?.ttl ?? opts.defaultTTL,
      });
      
      if (isMountedRef.current) {
        setValue(newValue);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [key, opts.defaultTier, opts.defaultTTL]);

  // 删除数据
  const remove = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    
    try {
      await tsa.delete(key);
      
      if (isMountedRef.current) {
        setValue(null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [key]);

  // 重新加载
  const refresh = useCallback(async (): Promise<void> => {
    retryAttemptRef.current = 0;
    await loadData();
  }, [loadData]);

  // 初始加载
  useEffect(() => {
    if (opts.autoLoad) {
      loadData();
    }
  }, [key, opts.autoLoad, loadData]);

  // 清理
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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

/**
 * useTSASubscription Hook - 订阅TSA数据变更
 * 
 * 当存储中的数据被其他组件修改时自动更新
 */
export function useTSASubscription<T>(
  key: string,
  defaultValue: T | null = null
): UseTSAReturn<T> {
  const tsaState = useTSA<T>(key, defaultValue);
  
  useEffect(() => {
    // 订阅TSA变更事件
    const unsubscribe = tsa.subscribe(key, (newValue: T | null) => {
      // 值已在外部更新，触发重新渲染
    });
    
    return unsubscribe;
  }, [key]);
  
  return tsaState;
}

export default useTSA;
```

### 6.1.4 错误处理策略

| 错误类型 | 处理方式 | 用户感知 |
|----------|----------|----------|
| 初始化失败 | 自动重试3次 | loading状态保持 |
| 读取失败 | 返回默认值+错误信息 | error对象 |
| 写入失败 | 抛出异常+回滚状态 | error对象 |
| 网络超时 | 指数退避重试 | loading状态 |

---

## 6.2 useAgent Hook

### 6.2.1 设计目标

`useAgent` Hook 管理 Agent 状态、消息发送和历史加载，提供完整的聊天功能封装。

### 6.2.2 接口定义

```typescript
// app/hooks/useAgent.ts

import { useState, useCallback, useEffect, useRef } from 'react';

export interface A2AMessage {
  id: string;
  sender: string;
  receiver: string;
  content: string;
  timestamp: number;
  type: 'chat' | 'proposal' | 'vote' | 'system';
  metadata?: Record<string, unknown>;
}

export interface AgentInfo {
  id: string;
  name: string;
  role: string;
  avatar?: string;
  status: 'online' | 'offline' | 'busy';
  capabilities: string[];
}

export interface UseAgentReturn {
  /** Agent信息 */
  agent: AgentInfo | null;
  /** 消息列表 */
  messages: A2AMessage[];
  /** 是否正在加载 */
  loading: boolean;
  /** 是否正在发送 */
  sending: boolean;
  /** 错误信息 */
  error: Error | null;
  /** 发送消息 */
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<A2AMessage | null>;
  /** 加载历史消息 */
  loadHistory: (options?: LoadHistoryOptions) => Promise<void>;
  /** 流式发送消息 */
  sendMessageStream: (
    content: string,
    onChunk: (chunk: string) => void,
    options?: SendMessageOptions
  ) => Promise<void>;
  /** 清空消息 */
  clearMessages: () => void;
  /** 重新加载Agent信息 */
  refreshAgent: () => Promise<void>;
}

export interface SendMessageOptions {
  type?: A2AMessage['type'];
  metadata?: Record<string, unknown>;
  timeout?: number;
}

export interface LoadHistoryOptions {
  limit?: number;
  before?: number;
  after?: number;
}
```

### 6.2.3 完整实现

```typescript
// app/hooks/useAgent.ts

import { useState, useCallback, useEffect, useRef } from 'react';

export interface A2AMessage {
  id: string;
  sender: string;
  receiver: string;
  content: string;
  timestamp: number;
  type: 'chat' | 'proposal' | 'vote' | 'system';
  metadata?: Record<string, unknown>;
}

export interface AgentInfo {
  id: string;
  name: string;
  role: string;
  avatar?: string;
  status: 'online' | 'offline' | 'busy';
  capabilities: string[];
}

export interface UseAgentReturn {
  agent: AgentInfo | null;
  messages: A2AMessage[];
  loading: boolean;
  sending: boolean;
  error: Error | null;
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<A2AMessage | null>;
  loadHistory: (options?: LoadHistoryOptions) => Promise<void>;
  sendMessageStream: (
    content: string,
    onChunk: (chunk: string) => void,
    options?: SendMessageOptions
  ) => Promise<void>;
  clearMessages: () => void;
  refreshAgent: () => Promise<void>;
}

export interface SendMessageOptions {
  type?: A2AMessage['type'];
  metadata?: Record<string, unknown>;
  timeout?: number;
}

export interface LoadHistoryOptions {
  limit?: number;
  before?: number;
  after?: number;
}

const DEFAULT_SEND_TIMEOUT = 30000; // 30秒
const DEFAULT_HISTORY_LIMIT = 50;

/**
 * useAgent Hook - Agent聊天功能封装
 * 
 * @example
 * ```tsx
 * function ChatDialog({ agentId }: { agentId: string }) {
 *   const { 
 *     agent, 
 *     messages, 
 *     sending, 
 *     sendMessage, 
 *     loadHistory 
 *   } = useAgent(agentId);
 *   
 *   const [input, setInput] = useState('');
 *   
 *   useEffect(() => {
 *     loadHistory();
 *   }, [loadHistory]);
 *   
 *   const handleSend = async () => {
 *     if (!input.trim()) return;
 *     await sendMessage(input);
 *     setInput('');
 *   };
 *   
 *   return (
 *     <div>
 *       <h1>Chat with {agent?.name}</h1>
 *       <MessageList messages={messages} />
 *       <Input 
 *         value={input} 
 *         onChange={setInput} 
 *         onSend={handleSend}
 *         disabled={sending}
 *       />
 *     </div>
 *   );
 * }
 * ```
 */
export function useAgent(agentId: string): UseAgentReturn {
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [messages, setMessages] = useState<A2AMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  // 加载Agent信息
  const refreshAgent = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/v1/a2a/agents/${agentId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch agent info: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (isMountedRef.current) {
        setAgent(data.agent);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [agentId]);

  // 加载历史消息
  const loadHistory = useCallback(async (options: LoadHistoryOptions = {}): Promise<void> => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      params.set('sessionId', agentId);
      params.set('limit', String(options.limit ?? DEFAULT_HISTORY_LIMIT));
      if (options.before) params.set('before', String(options.before));
      if (options.after) params.set('after', String(options.after));
      
      const response = await fetch(`/api/v1/a2a/history?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to load history: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (isMountedRef.current) {
        setMessages(data.messages || []);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [agentId]);

  // 发送消息
  const sendMessage = useCallback(async (
    content: string,
    options: SendMessageOptions = {}
  ): Promise<A2AMessage | null> => {
    setSending(true);
    setError(null);
    
    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    const timeoutId = setTimeout(() => {
      abortControllerRef.current?.abort();
    }, options.timeout ?? DEFAULT_SEND_TIMEOUT);
    
    try {
      const response = await fetch('/api/v1/a2a/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: 'user',
          receiver: agentId,
          content,
          type: options.type ?? 'chat',
          metadata: options.metadata,
        }),
        signal: abortControllerRef.current.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (isMountedRef.current) {
        // 添加用户消息到列表
        const userMessage: A2AMessage = {
          id: `user-${Date.now()}`,
          sender: 'user',
          receiver: agentId,
          content,
          timestamp: Date.now(),
          type: options.type ?? 'chat',
          metadata: options.metadata,
        };
        
        // 添加Agent回复到列表
        const agentMessage: A2AMessage = {
          id: data.messageId,
          sender: agentId,
          receiver: 'user',
          content: data.content,
          timestamp: Date.now(),
          type: 'chat',
          metadata: data.metadata,
        };
        
        setMessages(prev => [...prev, userMessage, agentMessage]);
        return agentMessage;
      }
      
      return null;
    } catch (err) {
      clearTimeout(timeoutId);
      
      if (err instanceof Error && err.name === 'AbortError') {
        // 请求被取消，不设置错误
        return null;
      }
      
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
      throw err;
    } finally {
      if (isMountedRef.current) {
        setSending(false);
      }
    }
  }, [agentId]);

  // 流式发送消息
  const sendMessageStream = useCallback(async (
    content: string,
    onChunk: (chunk: string) => void,
    options: SendMessageOptions = {}
  ): Promise<void> => {
    setSending(true);
    setError(null);
    
    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    try {
      const response = await fetch('/api/v1/a2a/send/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: 'user',
          receiver: agentId,
          content,
          type: options.type ?? 'chat',
          metadata: options.metadata,
        }),
        signal: abortControllerRef.current.signal,
      });
      
      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.statusText}`);
      }
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          fullContent += chunk;
          onChunk(chunk);
        }
      }
      
      if (isMountedRef.current) {
        // 添加用户消息
        const userMessage: A2AMessage = {
          id: `user-${Date.now()}`,
          sender: 'user',
          receiver: agentId,
          content,
          timestamp: Date.now(),
          type: options.type ?? 'chat',
          metadata: options.metadata,
        };
        
        // 添加Agent完整回复
        const agentMessage: A2AMessage = {
          id: `agent-${Date.now()}`,
          sender: agentId,
          receiver: 'user',
          content: fullContent,
          timestamp: Date.now(),
          type: 'chat',
        };
        
        setMessages(prev => [...prev, userMessage, agentMessage]);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
      throw err;
    } finally {
      if (isMountedRef.current) {
        setSending(false);
      }
    }
  }, [agentId]);

  // 清空消息
  const clearMessages = useCallback((): void => {
    setMessages([]);
  }, []);

  // 初始加载Agent信息
  useEffect(() => {
    refreshAgent();
  }, [refreshAgent]);

  // 清理
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    agent,
    messages,
    loading,
    sending,
    error,
    sendMessage,
    loadHistory,
    sendMessageStream,
    clearMessages,
    refreshAgent,
  };
}

export default useAgent;
```

### 6.2.4 消息状态流转

```
┌─────────────┐    sendMessage    ┌─────────────┐
│   待发送    │ ────────────────► │   发送中    │
└─────────────┘                   └──────┬──────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
                    ▼                    ▼                    ▼
              ┌─────────┐          ┌─────────┐          ┌─────────┐
              │  成功   │          │  失败   │          │  取消   │
              └────┬────┘          └────┬────┘          └────┬────┘
                   │                    │                    │
                   ▼                    ▼                    ▼
            添加到消息列表         设置error状态         静默处理
```

---

## 6.3 useGovernance Hook

### 6.3.1 设计目标

`useGovernance` Hook 提供治理引擎的完整前端封装，包括提案 CRUD、投票功能和实时状态更新。

### 6.3.2 接口定义

```typescript
// app/hooks/useGovernance.ts

import { useState, useCallback, useEffect, useRef } from 'react';

export type ProposalStatus = 'pending' | 'voting' | 'approved' | 'rejected' | 'expired';
export type VoteChoice = 'approve' | 'reject' | 'abstain';
export type AgentRole = 'pm' | 'arch' | 'qa' | 'engineer' | 'mike';

export interface Vote {
  voter: AgentRole;
  choice: VoteChoice;
  reason?: string;
  timestamp: number;
  weight: number;
}

export interface Proposal {
  id: string;
  title: string;
  description: string;
  proposer: AgentRole;
  targetState?: string;
  status: ProposalStatus;
  votes: Vote[];
  createdAt: number;
  expiresAt: number;
  executedAt?: number;
  metadata?: Record<string, unknown>;
}

export interface VoteStats {
  total: number;
  approve: number;
  reject: number;
  abstain: number;
  approveWeight: number;
  rejectWeight: number;
  threshold: number;
  quorum: number;
  passed: boolean;
}

export interface CreateProposalRequest {
  title: string;
  description: string;
  targetState?: string;
  expiresIn?: number; // 毫秒
}

export interface UseGovernanceReturn {
  /** 提案列表 */
  proposals: Proposal[];
  /** 当前提案详情 */
  currentProposal: Proposal | null;
  /** 加载状态 */
  loading: boolean;
  /** 操作状态 */
  processing: boolean;
  /** 错误信息 */
  error: Error | null;
  /** 获取提案列表 */
  fetchProposals: (filter?: ProposalFilter) => Promise<void>;
  /** 获取单个提案 */
  fetchProposal: (id: string) => Promise<void>;
  /** 创建提案 */
  createProposal: (request: CreateProposalRequest) => Promise<Proposal | null>;
  /** 更新提案 */
  updateProposal: (id: string, updates: Partial<Proposal>) => Promise<void>;
  /** 删除提案 */
  deleteProposal: (id: string) => Promise<void>;
  /** 投票 */
  vote: (proposalId: string, choice: VoteChoice, reason?: string) => Promise<void>;
  /** 获取投票统计 */
  getVoteStats: (proposalId: string) => Promise<VoteStats | null>;
  /** 刷新当前提案 */
  refreshCurrentProposal: () => Promise<void>;
}

export interface ProposalFilter {
  status?: ProposalStatus;
  proposer?: AgentRole;
  from?: number;
  to?: number;
}
```

### 6.3.3 完整实现

```typescript
// app/hooks/useGovernance.ts

import { useState, useCallback, useEffect, useRef } from 'react';

export type ProposalStatus = 'pending' | 'voting' | 'approved' | 'rejected' | 'expired';
export type VoteChoice = 'approve' | 'reject' | 'abstain';
export type AgentRole = 'pm' | 'arch' | 'qa' | 'engineer' | 'mike';

export interface Vote {
  voter: AgentRole;
  choice: VoteChoice;
  reason?: string;
  timestamp: number;
  weight: number;
}

export interface Proposal {
  id: string;
  title: string;
  description: string;
  proposer: AgentRole;
  targetState?: string;
  status: ProposalStatus;
  votes: Vote[];
  createdAt: number;
  expiresAt: number;
  executedAt?: number;
  metadata?: Record<string, unknown>;
}

export interface VoteStats {
  total: number;
  approve: number;
  reject: number;
  abstain: number;
  approveWeight: number;
  rejectWeight: number;
  threshold: number;
  quorum: number;
  passed: boolean;
}

export interface CreateProposalRequest {
  title: string;
  description: string;
  targetState?: string;
  expiresIn?: number;
}

export interface UseGovernanceReturn {
  proposals: Proposal[];
  currentProposal: Proposal | null;
  loading: boolean;
  processing: boolean;
  error: Error | null;
  fetchProposals: (filter?: ProposalFilter) => Promise<void>;
  fetchProposal: (id: string) => Promise<void>;
  createProposal: (request: CreateProposalRequest) => Promise<Proposal | null>;
  updateProposal: (id: string, updates: Partial<Proposal>) => Promise<void>;
  deleteProposal: (id: string) => Promise<void>;
  vote: (proposalId: string, choice: VoteChoice, reason?: string) => Promise<void>;
  getVoteStats: (proposalId: string) => Promise<VoteStats | null>;
  refreshCurrentProposal: () => Promise<void>;
}

export interface ProposalFilter {
  status?: ProposalStatus;
  proposer?: AgentRole;
  from?: number;
  to?: number;
}

const DEFAULT_EXPIRES_IN = 30 * 60 * 1000; // 30分钟

/**
 * useGovernance Hook - 治理引擎前端封装
 * 
 * @example
 * ```tsx
 * function ProposalPanel() {
 *   const { 
 *     proposals, 
 *     loading, 
 *     createProposal, 
 *     vote 
 *   } = useGovernance();
 *   
 *   const handleCreate = async (title: string, description: string) => {
 *     await createProposal({ title, description });
 *   };
 *   
 *   const handleVote = async (proposalId: string, choice: VoteChoice) => {
 *     await vote(proposalId, choice);
 *   };
 *   
 *   return (
 *     <div>
 *       <ProposalList proposals={proposals} loading={loading} />
 *       <CreateProposalForm onSubmit={handleCreate} />
 *       <VoteButtons onVote={handleVote} />
 *     </div>
 *   );
 * }
 * ```
 */
export function useGovernance(): UseGovernanceReturn {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [currentProposal, setCurrentProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const currentProposalIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  // 获取提案列表
  const fetchProposals = useCallback(async (filter: ProposalFilter = {}): Promise<void> => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      if (filter.status) params.set('status', filter.status);
      if (filter.proposer) params.set('proposer', filter.proposer);
      if (filter.from) params.set('from', String(filter.from));
      if (filter.to) params.set('to', String(filter.to));
      
      const response = await fetch(`/api/v1/governance/proposals?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch proposals: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (isMountedRef.current) {
        setProposals(data.proposals || []);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // 获取单个提案
  const fetchProposal = useCallback(async (id: string): Promise<void> => {
    setLoading(true);
    setError(null);
    currentProposalIdRef.current = id;
    
    try {
      const response = await fetch(`/api/v1/governance/proposals/${id}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch proposal: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (isMountedRef.current) {
        setCurrentProposal(data.proposal);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // 创建提案
  const createProposal = useCallback(async (
    request: CreateProposalRequest
  ): Promise<Proposal | null> => {
    setProcessing(true);
    setError(null);
    
    try {
      const response = await fetch('/api/v1/governance/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...request,
          expiresIn: request.expiresIn ?? DEFAULT_EXPIRES_IN,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to create proposal: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (isMountedRef.current) {
        const newProposal = data.proposal as Proposal;
        setProposals(prev => [newProposal, ...prev]);
        return newProposal;
      }
      
      return null;
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
      throw err;
    } finally {
      if (isMountedRef.current) {
        setProcessing(false);
      }
    }
  }, []);

  // 更新提案
  const updateProposal = useCallback(async (
    id: string,
    updates: Partial<Proposal>
  ): Promise<void> => {
    setProcessing(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/v1/governance/proposals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update proposal: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (isMountedRef.current) {
        const updatedProposal = data.proposal as Proposal;
        
        // 更新列表中的提案
        setProposals(prev =>
          prev.map(p => (p.id === id ? updatedProposal : p))
        );
        
        // 更新当前提案（如果是同一个）
        if (currentProposalIdRef.current === id) {
          setCurrentProposal(updatedProposal);
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
      throw err;
    } finally {
      if (isMountedRef.current) {
        setProcessing(false);
      }
    }
  }, []);

  // 删除提案
  const deleteProposal = useCallback(async (id: string): Promise<void> => {
    setProcessing(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/v1/governance/proposals/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete proposal: ${response.statusText}`);
      }
      
      if (isMountedRef.current) {
        setProposals(prev => prev.filter(p => p.id !== id));
        
        if (currentProposalIdRef.current === id) {
          setCurrentProposal(null);
          currentProposalIdRef.current = null;
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
      throw err;
    } finally {
      if (isMountedRef.current) {
        setProcessing(false);
      }
    }
  }, []);

  // 投票
  const vote = useCallback(async (
    proposalId: string,
    choice: VoteChoice,
    reason?: string
  ): Promise<void> => {
    setProcessing(true);
    setError(null);
    
    try {
      const response = await fetch('/api/v1/governance/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId, choice, reason }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to vote: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (isMountedRef.current) {
        const updatedProposal = data.proposal as Proposal;
        
        // 更新列表中的提案
        setProposals(prev =>
          prev.map(p => (p.id === proposalId ? updatedProposal : p))
        );
        
        // 更新当前提案
        if (currentProposalIdRef.current === proposalId) {
          setCurrentProposal(updatedProposal);
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
      throw err;
    } finally {
      if (isMountedRef.current) {
        setProcessing(false);
      }
    }
  }, []);

  // 获取投票统计
  const getVoteStats = useCallback(async (proposalId: string): Promise<VoteStats | null> => {
    try {
      const response = await fetch(`/api/v1/governance/proposals/${proposalId}/stats`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch vote stats: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.stats as VoteStats;
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
      return null;
    }
  }, []);

  // 刷新当前提案
  const refreshCurrentProposal = useCallback(async (): Promise<void> => {
    if (currentProposalIdRef.current) {
      await fetchProposal(currentProposalIdRef.current);
    }
  }, [fetchProposal]);

  // 清理
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    proposals,
    currentProposal,
    loading,
    processing,
    error,
    fetchProposals,
    fetchProposal,
    createProposal,
    updateProposal,
    deleteProposal,
    vote,
    getVoteStats,
    refreshCurrentProposal,
  };
}

export default useGovernance;
```

### 6.3.4 投票规则

```yaml
# 七权投票规则配置
voting_rules:
  quorum: 3              # 最低投票人数
  approval_threshold: 0.6  # 通过阈值 (60%)
  timeout: 1800000       # 30分钟超时
  
  # 各角色权重
  weights:
    pm: 2
    arch: 2
    qa: 1
    engineer: 1
    mike: 1
```

---

## 6.4 useStateMachine Hook

### 6.4.1 设计目标

`useStateMachine` Hook 提供状态机的前端封装，支持状态流转、历史记录和实时订阅通知。

### 6.4.2 接口定义

```typescript
// app/hooks/useStateMachine.ts

import { useState, useCallback, useEffect, useRef } from 'react';

export type PowerState = 
  | 'IDLE' 
  | 'DESIGN' 
  | 'CODE' 
  | 'AUDIT' 
  | 'BUILD' 
  | 'DEPLOY' 
  | 'DONE';

export type AgentRole = 'pm' | 'arch' | 'qa' | 'engineer' | 'mike';

export interface StateTransition {
  from: PowerState;
  to: PowerState;
  triggeredBy: AgentRole;
  timestamp: number;
  context?: Record<string, unknown>;
  proposalId?: string;
}

export interface StateContext {
  currentTask?: string;
  assignedAgent?: string;
  progress?: number;
  metadata?: Record<string, unknown>;
}

export interface UseStateMachineReturn {
  /** 当前状态 */
  currentState: PowerState;
  /** 状态流转历史 */
  history: StateTransition[];
  /** 状态上下文 */
  context: StateContext | null;
  /** 加载状态 */
  loading: boolean;
  /** 流转中状态 */
  transitioning: boolean;
  /** 错误信息 */
  error: Error | null;
  /** 获取当前状态 */
  refreshState: () => Promise<void>;
  /** 触发状态流转 */
  transition: (to: PowerState, context?: Record<string, unknown>) => Promise<boolean>;
  /** 检查流转是否允许 */
  canTransition: (to: PowerState) => Promise<boolean>;
  /** 获取允许的流转目标 */
  getAllowedTransitions: () => Promise<PowerState[]>;
  /** 订阅状态变更 */
  subscribe: (callback: (transition: StateTransition) => void) => () => void;
}
```

### 6.4.3 完整实现

```typescript
// app/hooks/useStateMachine.ts

import { useState, useCallback, useEffect, useRef } from 'react';

export type PowerState = 
  | 'IDLE' 
  | 'DESIGN' 
  | 'CODE' 
  | 'AUDIT' 
  | 'BUILD' 
  | 'DEPLOY' 
  | 'DONE';

export type AgentRole = 'pm' | 'arch' | 'qa' | 'engineer' | 'mike';

export interface StateTransition {
  from: PowerState;
  to: PowerState;
  triggeredBy: AgentRole;
  timestamp: number;
  context?: Record<string, unknown>;
  proposalId?: string;
}

export interface StateContext {
  currentTask?: string;
  assignedAgent?: string;
  progress?: number;
  metadata?: Record<string, unknown>;
}

export interface UseStateMachineReturn {
  currentState: PowerState;
  history: StateTransition[];
  context: StateContext | null;
  loading: boolean;
  transitioning: boolean;
  error: Error | null;
  refreshState: () => Promise<void>;
  transition: (to: PowerState, context?: Record<string, unknown>) => Promise<boolean>;
  canTransition: (to: PowerState) => Promise<boolean>;
  getAllowedTransitions: () => Promise<PowerState[]>;
  subscribe: (callback: (transition: StateTransition) => void) => () => void;
}

// 事件订阅管理器
class StateEventManager {
  private listeners: Set<(transition: StateTransition) => void> = new Set();
  private eventSource: EventSource | null = null;

  subscribe(callback: (transition: StateTransition) => void): () => void {
    this.listeners.add(callback);
    this.ensureConnection();
    
    return () => {
      this.listeners.delete(callback);
      if (this.listeners.size === 0) {
        this.disconnect();
      }
    };
  }

  private ensureConnection(): void {
    if (this.eventSource) return;
    
    this.eventSource = new EventSource('/api/v1/state/events');
    
    this.eventSource.onmessage = (event) => {
      try {
        const transition = JSON.parse(event.data) as StateTransition;
        this.listeners.forEach(listener => listener(transition));
      } catch (err) {
        console.error('[StateEventManager] Failed to parse event:', err);
      }
    };
    
    this.eventSource.onerror = (err) => {
      console.error('[StateEventManager] EventSource error:', err);
      // 自动重连
      setTimeout(() => this.reconnect(), 5000);
    };
  }

  private disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  private reconnect(): void {
    this.disconnect();
    if (this.listeners.size > 0) {
      this.ensureConnection();
    }
  }
}

const eventManager = new StateEventManager();

/**
 * useStateMachine Hook - 状态机前端封装
 * 
 * @example
 * ```tsx
 * function StateIndicator() {
 *   const { 
 *     currentState, 
 *     history, 
 *     transitioning, 
 *     transition,
 *     getAllowedTransitions 
 *   } = useStateMachine();
 *   
 *   const [allowedStates, setAllowedStates] = useState<PowerState[]>([]);
 *   
 *   useEffect(() => {
 *     getAllowedTransitions().then(setAllowedStates);
 *   }, [currentState, getAllowedTransitions]);
 *   
 *   return (
 *     <div>
 *       <CurrentStateDisplay state={currentState} transitioning={transitioning} />
 *       <TransitionButtons 
 *         allowedStates={allowedStates} 
 *         onTransition={transition} 
 *       />
 *       <StateHistory history={history} />
 *     </div>
 *   );
 * }
 * ```
 */
export function useStateMachine(): UseStateMachineReturn {
  const [currentState, setCurrentState] = useState<PowerState>('IDLE');
  const [history, setHistory] = useState<StateTransition[]>([]);
  const [context, setContext] = useState<StateContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const isMountedRef = useRef(true);

  // 获取当前状态
  const refreshState = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/v1/state/current', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch state: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (isMountedRef.current) {
        setCurrentState(data.state);
        setHistory(data.history || []);
        setContext(data.context || null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // 触发状态流转
  const transition = useCallback(async (
    to: PowerState,
    transitionContext?: Record<string, unknown>
  ): Promise<boolean> => {
    setTransitioning(true);
    setError(null);
    
    try {
      const response = await fetch('/api/v1/state/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          to, 
          context: transitionContext 
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Transition failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (isMountedRef.current) {
        setCurrentState(to);
        
        // 添加新的流转记录
        const newTransition: StateTransition = {
          from: data.from,
          to,
          triggeredBy: data.triggeredBy,
          timestamp: Date.now(),
          context: transitionContext,
          proposalId: data.proposalId,
        };
        
        setHistory(prev => [...prev, newTransition]);
        
        if (data.context) {
          setContext(data.context);
        }
      }
      
      return true;
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
      return false;
    } finally {
      if (isMountedRef.current) {
        setTransitioning(false);
      }
    }
  }, []);

  // 检查流转是否允许
  const canTransition = useCallback(async (to: PowerState): Promise<boolean> => {
    try {
      const response = await fetch(`/api/v1/state/can-transition?from=${currentState}&to=${to}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        return false;
      }
      
      const data = await response.json();
      return data.allowed;
    } catch {
      return false;
    }
  }, [currentState]);

  // 获取允许的流转目标
  const getAllowedTransitions = useCallback(async (): Promise<PowerState[]> => {
    try {
      const response = await fetch(`/api/v1/state/allowed-transitions?from=${currentState}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        return [];
      }
      
      const data = await response.json();
      return data.allowedTransitions || [];
    } catch {
      return [];
    }
  }, [currentState]);

  // 订阅状态变更
  const subscribe = useCallback((callback: (transition: StateTransition) => void): (() => void) => {
    return eventManager.subscribe((transition) => {
      if (isMountedRef.current) {
        // 更新当前状态
        setCurrentState(transition.to);
        
        // 添加到历史
        setHistory(prev => [...prev, transition]);
        
        // 调用用户回调
        callback(transition);
      }
    });
  }, []);

  // 初始加载
  useEffect(() => {
    refreshState();
  }, [refreshState]);

  // 清理
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    currentState,
    history,
    context,
    loading,
    transitioning,
    error,
    refreshState,
    transition,
    canTransition,
    getAllowedTransitions,
    subscribe,
  };
}

export default useStateMachine;
```

### 6.4.4 状态流转图

```
                    ┌─────────────────────────────────────────┐
                    │              七权状态流转图               │
                    └─────────────────────────────────────────┘

    ┌──────┐         ┌────────┐         ┌───────┐         ┌────────┐
    │ IDLE │ ──────► │ DESIGN │ ──────► │ CODE  │ ──────► │ AUDIT  │
    └──┬───┘         └───┬────┘         └───┬───┘         └───┬────┘
       │                 │                  │                 │
       │                 │                  │                 │
       ▼                 ▼                  ▼                 ▼
    ┌──────┐         ┌────────┐         ┌───────┐         ┌────────┐
    │ DONE │ ◄────── │ DEPLOY │ ◄────── │ BUILD │ ◄────── │ AUDIT  │
    └──────┘         └────────┘         └───────┘         └────────┘

    流转规则:
    - IDLE → DESIGN: PM发起
    - DESIGN → CODE: ARCH审批
    - CODE → AUDIT: ENGINEER完成
    - AUDIT → BUILD: QA通过
    - BUILD → DEPLOY: 自动
    - DEPLOY → DONE: 自动
```

---

## 6.5 自测点（必须包含验证方法）

### 6.5.1 测试策略

```
测试金字塔:
                    ┌─────────┐
                    │  E2E    │  5%  (关键路径)
                   ┌┴─────────┴┐
                   │ Integration│  20% (模块集成)
                  ┌┴───────────┴┐
                  │    Unit      │  75% (核心逻辑)
                  └──────────────┘
```

### 6.5.2 自测点清单

| 自测ID | 验证方法 | 通过标准 | 状态 |
|--------|----------|----------|------|
| HOOK-001 | 单元测试 | useTSA数据读写与加载状态 | 🔴 |
| HOOK-002 | 单元测试 | useAgent消息发送与历史加载 | 🔴 |
| HOOK-003 | 单元测试 | useGovernance提案CRUD与投票 | 🔴 |
| HOOK-004 | 单元测试 | useStateMachine状态流转与订阅 | 🔴 |

### 6.5.3 测试代码实现

#### HOOK-001: useTSA 测试

```typescript
// tests/unit/hooks/useTSA.test.ts

import { renderHook, act, waitFor } from '@testing-library/react';
import { useTSA } from '@/app/hooks/useTSA';
import { tsa, StorageTier } from '@/lib/tsa';

// Mock TSA
jest.mock('@/lib/tsa', () => ({
  tsa: {
    init: jest.fn().mockResolvedValue(undefined),
    isInitialized: jest.fn().mockReturnValue(true),
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockReturnValue(() => {}),
  },
  StorageTier: {
    TRANSIENT: 'transient',
    STAGING: 'staging',
    ARCHIVE: 'archive',
  },
}));

describe('HOOK-001: useTSA', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with default value', () => {
    const { result } = renderHook(() => useTSA('test-key', 'default'));
    
    expect(result.current.value).toBe('default');
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('should load data from TSA on mount', async () => {
    (tsa.get as jest.Mock).mockResolvedValue('stored-value');
    
    const { result } = renderHook(() => useTSA('test-key'));
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    expect(result.current.value).toBe('stored-value');
    expect(result.current.initialized).toBe(true);
  });

  it('should handle loading state correctly', async () => {
    (tsa.get as jest.Mock).mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve('value'), 100))
    );
    
    const { result } = renderHook(() => useTSA('test-key'));
    
    expect(result.current.loading).toBe(true);
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('should set data to TSA', async () => {
    const { result } = renderHook(() => useTSA('test-key'));
    
    await act(async () => {
      await result.current.set('new-value');
    });
    
    expect(tsa.set).toHaveBeenCalledWith('test-key', 'new-value', {
      tier: StorageTier.TRANSIENT,
      ttl: 300000,
    });
    expect(result.current.value).toBe('new-value');
  });

  it('should remove data from TSA', async () => {
    const { result } = renderHook(() => useTSA('test-key', 'initial'));
    
    await act(async () => {
      await result.current.remove();
    });
    
    expect(tsa.delete).toHaveBeenCalledWith('test-key');
    expect(result.current.value).toBeNull();
  });

  it('should handle errors gracefully', async () => {
    const error = new Error('TSA Error');
    (tsa.get as jest.Mock).mockRejectedValue(error);
    
    const { result } = renderHook(() => useTSA('test-key'));
    
    await waitFor(() => {
      expect(result.current.error).toEqual(error);
    });
    
    expect(result.current.loading).toBe(false);
  });

  it('should refresh data on key change', async () => {
    (tsa.get as jest.Mock).mockResolvedValueOnce('value-1');
    
    const { result, rerender } = renderHook(
      ({ key }) => useTSA(key),
      { initialProps: { key: 'key-1' } }
    );
    
    await waitFor(() => {
      expect(result.current.value).toBe('value-1');
    });
    
    (tsa.get as jest.Mock).mockResolvedValueOnce('value-2');
    rerender({ key: 'key-2' });
    
    await waitFor(() => {
      expect(result.current.value).toBe('value-2');
    });
  });

  // 通过标准验证
  describe('通过标准验证', () => {
    it('✅ HOOK-001-1: 数据读取正常', async () => {
      (tsa.get as jest.Mock).mockResolvedValue('test-data');
      const { result } = renderHook(() => useTSA('key'));
      await waitFor(() => expect(result.current.value).toBe('test-data'));
    });

    it('✅ HOOK-001-2: 数据写入正常', async () => {
      const { result } = renderHook(() => useTSA('key'));
      await act(async () => result.current.set('new-data'));
      expect(tsa.set).toHaveBeenCalled();
    });

    it('✅ HOOK-001-3: 加载状态正确', async () => {
      const { result } = renderHook(() => useTSA('key'));
      expect(result.current.loading).toBe(true);
      await waitFor(() => expect(result.current.loading).toBe(false));
    });

    it('✅ HOOK-001-4: 错误处理正常', async () => {
      (tsa.get as jest.Mock).mockRejectedValue(new Error('test'));
      const { result } = renderHook(() => useTSA('key'));
      await waitFor(() => expect(result.current.error).not.toBeNull());
    });
  });
});
```

#### HOOK-002: useAgent 测试

```typescript
// tests/unit/hooks/useAgent.test.ts

import { renderHook, act, waitFor } from '@testing-library/react';
import { useAgent } from '@/app/hooks/useAgent';

// Mock fetch
global.fetch = jest.fn();

describe('HOOK-002: useAgent', () => {
  const mockAgentId = 'agent-1';
  const mockAgent = {
    id: mockAgentId,
    name: 'Test Agent',
    role: 'support',
    status: 'online',
    capabilities: ['chat'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should load agent info on mount', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ agent: mockAgent }),
    });

    const { result } = renderHook(() => useAgent(mockAgentId));

    await waitFor(() => {
      expect(result.current.agent).toEqual(mockAgent);
    });
  });

  it('should send message successfully', async () => {
    // Mock agent info fetch
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ agent: mockAgent }),
    });

    // Mock send message
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        messageId: 'msg-1', 
        content: 'Reply' 
      }),
    });

    const { result } = renderHook(() => useAgent(mockAgentId));

    await waitFor(() => expect(result.current.agent).not.toBeNull());

    await act(async () => {
      await result.current.sendMessage('Hello');
    });

    expect(fetch).toHaveBeenLastCalledWith('/api/v1/a2a/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: 'user',
        receiver: mockAgentId,
        content: 'Hello',
        type: 'chat',
        metadata: undefined,
      }),
      signal: expect.any(AbortSignal),
    });

    expect(result.current.messages).toHaveLength(2); // user + agent
  });

  it('should load message history', async () => {
    const mockMessages = [
      { id: '1', sender: 'user', receiver: mockAgentId, content: 'Hi', timestamp: 1, type: 'chat' },
      { id: '2', sender: mockAgentId, receiver: 'user', content: 'Hello', timestamp: 2, type: 'chat' },
    ];

    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agent: mockAgent }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: mockMessages }),
      });

    const { result } = renderHook(() => useAgent(mockAgentId));

    await act(async () => {
      await result.current.loadHistory();
    });

    expect(result.current.messages).toEqual(mockMessages);
  });

  it('should handle send error', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agent: mockAgent }),
      })
      .mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useAgent(mockAgentId));

    await waitFor(() => expect(result.current.agent).not.toBeNull());

    await act(async () => {
      try {
        await result.current.sendMessage('Hello');
      } catch {
        // Expected
      }
    });

    expect(result.current.error).not.toBeNull();
  });

  // 通过标准验证
  describe('通过标准验证', () => {
    it('✅ HOOK-002-1: 消息发送正常', async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ agent: mockAgent }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ messageId: '1', content: 'Reply' }) });
      
      const { result } = renderHook(() => useAgent(mockAgentId));
      await waitFor(() => expect(result.current.agent).not.toBeNull());
      
      await act(async () => result.current.sendMessage('test'));
      expect(result.current.messages.length).toBeGreaterThan(0);
    });

    it('✅ HOOK-002-2: 历史加载正常', async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ agent: mockAgent }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [{ id: '1', content: 'test' }] }) });
      
      const { result } = renderHook(() => useAgent(mockAgentId));
      await act(async () => result.current.loadHistory());
      expect(result.current.messages.length).toBeGreaterThan(0);
    });

    it('✅ HOOK-002-3: 流式发送正常', async () => {
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('chunk1') })
          .mockResolvedValueOnce({ done: true }),
      };
      
      (fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ agent: mockAgent }) })
        .mockResolvedValueOnce({
          ok: true,
          body: { getReader: () => mockReader },
        });

      const { result } = renderHook(() => useAgent(mockAgentId));
      await waitFor(() => expect(result.current.agent).not.toBeNull());

      const chunks: string[] = [];
      await act(async () => {
        await result.current.sendMessageStream('test', (chunk) => chunks.push(chunk));
      });
    });

    it('✅ HOOK-002-4: 错误处理正常', async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ agent: mockAgent }) })
        .mockRejectedValueOnce(new Error('test'));
      
      const { result } = renderHook(() => useAgent(mockAgentId));
      await waitFor(() => expect(result.current.agent).not.toBeNull());
      
      await act(async () => {
        try { await result.current.sendMessage('test'); } catch {}
      });
      
      expect(result.current.error).not.toBeNull();
    });
  });
});
```

#### HOOK-003: useGovernance 测试

```typescript
// tests/unit/hooks/useGovernance.test.ts

import { renderHook, act, waitFor } from '@testing-library/react';
import { useGovernance, Proposal, VoteChoice } from '@/app/hooks/useGovernance';

global.fetch = jest.fn();

describe('HOOK-003: useGovernance', () => {
  const mockProposal: Proposal = {
    id: 'prop-1',
    title: 'Test Proposal',
    description: 'Test Description',
    proposer: 'pm',
    status: 'pending',
    votes: [],
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch proposals', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ proposals: [mockProposal] }),
    });

    const { result } = renderHook(() => useGovernance());

    await act(async () => {
      await result.current.fetchProposals();
    });

    expect(result.current.proposals).toHaveLength(1);
    expect(result.current.proposals[0].title).toBe('Test Proposal');
  });

  it('should create proposal', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ proposal: mockProposal }),
    });

    const { result } = renderHook(() => useGovernance());

    await act(async () => {
      await result.current.createProposal({
        title: 'Test Proposal',
        description: 'Test Description',
      });
    });

    expect(fetch).toHaveBeenCalledWith('/api/v1/governance/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Test Proposal',
        description: 'Test Description',
        expiresIn: 1800000,
      }),
    });

    expect(result.current.proposals).toHaveLength(1);
  });

  it('should vote on proposal', async () => {
    const votedProposal = {
      ...mockProposal,
      votes: [{ voter: 'pm', choice: 'approve' as VoteChoice, timestamp: Date.now(), weight: 2 }],
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ proposal: votedProposal }),
    });

    const { result } = renderHook(() => useGovernance());

    await act(async () => {
      await result.current.vote('prop-1', 'approve');
    });

    expect(fetch).toHaveBeenCalledWith('/api/v1/governance/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposalId: 'prop-1', choice: 'approve', reason: undefined }),
    });
  });

  it('should delete proposal', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ proposals: [mockProposal] }),
    });

    const { result } = renderHook(() => useGovernance());

    await act(async () => {
      await result.current.fetchProposals();
    });

    expect(result.current.proposals).toHaveLength(1);

    (fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

    await act(async () => {
      await result.current.deleteProposal('prop-1');
    });

    expect(result.current.proposals).toHaveLength(0);
  });

  // 通过标准验证
  describe('通过标准验证', () => {
    it('✅ HOOK-003-1: 提案创建正常', async () => {
      (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ proposal: mockProposal }) });
      const { result } = renderHook(() => useGovernance());
      await act(async () => result.current.createProposal({ title: 'test', description: 'test' }));
      expect(result.current.proposals.length).toBeGreaterThan(0);
    });

    it('✅ HOOK-003-2: 提案列表获取正常', async () => {
      (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ proposals: [mockProposal] }) });
      const { result } = renderHook(() => useGovernance());
      await act(async () => result.current.fetchProposals());
      expect(result.current.proposals.length).toBeGreaterThan(0);
    });

    it('✅ HOOK-003-3: 投票功能正常', async () => {
      (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ proposal: { ...mockProposal, votes: [{ voter: 'pm', choice: 'approve', timestamp: 1, weight: 2 }] } }) });
      const { result } = renderHook(() => useGovernance());
      await act(async () => result.current.vote('prop-1', 'approve'));
      expect(fetch).toHaveBeenCalledWith('/api/v1/governance/vote', expect.any(Object));
    });

    it('✅ HOOK-003-4: 提案删除正常', async () => {
      (fetch as jest.Mock).mockResolvedValue({ ok: true });
      const { result } = renderHook(() => useGovernance());
      result.current.proposals = [mockProposal];
      await act(async () => result.current.deleteProposal('prop-1'));
      expect(result.current.proposals.length).toBe(0);
    });
  });
});
```

#### HOOK-004: useStateMachine 测试

```typescript
// tests/unit/hooks/useStateMachine.test.ts

import { renderHook, act, waitFor } from '@testing-library/react';
import { useStateMachine, PowerState, StateTransition } from '@/app/hooks/useStateMachine';

global.fetch = jest.fn();

// Mock EventSource
global.EventSource = jest.fn().mockImplementation(() => ({
  close: jest.fn(),
  onmessage: null,
  onerror: null,
})) as unknown as typeof EventSource;

describe('HOOK-004: useStateMachine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should load initial state', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        state: 'IDLE' as PowerState, 
        history: [],
        context: null,
      }),
    });

    const { result } = renderHook(() => useStateMachine());

    await waitFor(() => {
      expect(result.current.currentState).toBe('IDLE');
    });
  });

  it('should transition state', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ state: 'IDLE', history: [], context: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          success: true, 
          from: 'IDLE',
          to: 'DESIGN',
          triggeredBy: 'pm',
        }),
      });

    const { result } = renderHook(() => useStateMachine());

    await waitFor(() => expect(result.current.currentState).toBe('IDLE'));

    await act(async () => {
      const success = await result.current.transition('DESIGN');
      expect(success).toBe(true);
    });

    expect(result.current.currentState).toBe('DESIGN');
    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].from).toBe('IDLE');
    expect(result.current.history[0].to).toBe('DESIGN');
  });

  it('should get allowed transitions', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ state: 'IDLE', history: [], context: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ allowedTransitions: ['DESIGN'] }),
      });

    const { result } = renderHook(() => useStateMachine());

    await waitFor(() => expect(result.current.currentState).toBe('IDLE'));

    let allowedStates: PowerState[] = [];
    await act(async () => {
      allowedStates = await result.current.getAllowedTransitions();
    });

    expect(allowedStates).toContain('DESIGN');
  });

  it('should check if transition is allowed', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ state: 'IDLE', history: [], context: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ allowed: true }),
      });

    const { result } = renderHook(() => useStateMachine());

    await waitFor(() => expect(result.current.currentState).toBe('IDLE'));

    let canTransition = false;
    await act(async () => {
      canTransition = await result.current.canTransition('DESIGN');
    });

    expect(canTransition).toBe(true);
  });

  it('should handle transition error', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ state: 'IDLE', history: [], context: null }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Invalid transition',
        json: async () => ({ message: 'Transition not allowed' }),
      });

    const { result } = renderHook(() => useStateMachine());

    await waitFor(() => expect(result.current.currentState).toBe('IDLE'));

    await act(async () => {
      const success = await result.current.transition('DEPLOY');
      expect(success).toBe(false);
    });

    expect(result.current.error).not.toBeNull();
  });

  // 通过标准验证
  describe('通过标准验证', () => {
    it('✅ HOOK-004-1: 状态流转正常', async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ state: 'IDLE', history: [] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, from: 'IDLE', to: 'DESIGN', triggeredBy: 'pm' }) });
      
      const { result } = renderHook(() => useStateMachine());
      await waitFor(() => expect(result.current.currentState).toBe('IDLE'));
      
      await act(async () => result.current.transition('DESIGN'));
      expect(result.current.currentState).toBe('DESIGN');
    });

    it('✅ HOOK-004-2: 历史记录正常', async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ state: 'IDLE', history: [] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, from: 'IDLE', to: 'DESIGN', triggeredBy: 'pm' }) });
      
      const { result } = renderHook(() => useStateMachine());
      await waitFor(() => expect(result.current.currentState).toBe('IDLE'));
      
      await act(async () => result.current.transition('DESIGN'));
      expect(result.current.history.length).toBeGreaterThan(0);
    });

    it('✅ HOOK-004-3: 订阅通知正常', async () => {
      const { result } = renderHook(() => useStateMachine());
      const callback = jest.fn();
      
      const unsubscribe = result.current.subscribe(callback);
      expect(typeof unsubscribe).toBe('function');
      
      unsubscribe();
    });

    it('✅ HOOK-004-4: 非法流转被拒绝', async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ state: 'IDLE', history: [] }) })
        .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ message: 'Invalid' }) });
      
      const { result } = renderHook(() => useStateMachine());
      await waitFor(() => expect(result.current.currentState).toBe('IDLE'));
      
      await act(async () => result.current.transition('DEPLOY'));
      expect(result.current.error).not.toBeNull();
    });
  });
});
```

### 6.5.4 测试执行命令

```bash
# 运行所有Hook测试
npm test -- --testPathPattern="hooks"

# 运行单个Hook测试
npm test -- useTSA.test.ts
npm test -- useAgent.test.ts
npm test -- useGovernance.test.ts
npm test -- useStateMachine.test.ts

# 带覆盖率报告
npm test -- --coverage --testPathPattern="hooks"
```

### 6.5.5 通过标准汇总

| 自测ID | 测试项 | 通过标准 | 验证命令 |
|--------|--------|----------|----------|
| HOOK-001 | useTSA | 4/4项通过 | `npm test -- useTSA.test.ts` |
| HOOK-002 | useAgent | 4/4项通过 | `npm test -- useAgent.test.ts` |
| HOOK-003 | useGovernance | 4/4项通过 | `npm test -- useGovernance.test.ts` |
| HOOK-004 | useStateMachine | 4/4项通过 | `npm test -- useStateMachine.test.ts` |

---

## 6.6 文件变更清单

### 6.6.1 新增文件

| 序号 | 文件路径 | 用途 | 代码行数 |
|------|----------|------|----------|
| 1 | `app/hooks/useTSA.ts` | TSA存储Hook | ~280 |
| 2 | `app/hooks/useAgent.ts` | Agent聊天Hook | ~350 |
| 3 | `app/hooks/useGovernance.ts` | 治理引擎Hook | ~380 |
| 4 | `app/hooks/useStateMachine.ts` | 状态机Hook | ~320 |
| 5 | `app/hooks/index.ts` | Hooks统一导出 | ~20 |
| 6 | `tests/unit/hooks/useTSA.test.ts` | useTSA单元测试 | ~150 |
| 7 | `tests/unit/hooks/useAgent.test.ts` | useAgent单元测试 | ~180 |
| 8 | `tests/unit/hooks/useGovernance.test.ts` | useGovernance单元测试 | ~160 |
| 9 | `tests/unit/hooks/useStateMachine.test.ts` | useStateMachine单元测试 | ~170 |

### 6.6.2 修改文件

| 序号 | 文件路径 | 修改内容 | 影响范围 |
|------|----------|----------|----------|
| 1 | `lib/tsa/index.ts` | 添加isInitialized方法 | useTSA依赖 |
| 2 | `lib/tsa/index.ts` | 添加subscribe方法 | useTSA订阅功能 |
| 3 | `app/api/v1/a2a/agents/[id]/route.ts` | 新增Agent信息API | useAgent依赖 |

### 6.6.3 删除文件

无

### 6.6.4 依赖关系图

```
┌─────────────────────────────────────────────────────────────┐
│                      React Hooks 依赖关系                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────┐                                           │
│   │   useTSA    │◄─────────────────┐                       │
│   └──────┬──────┘                  │                       │
│          │                         │                       │
│          ▼                         │                       │
│   ┌─────────────┐                  │                       │
│   │     TSA     │                  │                       │
│   │  (lib/tsa)  │                  │                       │
│   └─────────────┘                  │                       │
│                                    │                       │
│   ┌─────────────┐                  │                       │
│   │  useAgent   │──────────────────┘ (消息持久化)          │
│   └──────┬──────┘                                           │
│          │                                                  │
│          ▼                                                  │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│   │   A2A API   │    │  useGovern  │    │useStateMach │    │
│   │ (/api/v1/*) │    │   ance      │    │    ine      │    │
│   └─────────────┘    └──────┬──────┘    └──────┬──────┘    │
│                             │                  │            │
│                             ▼                  ▼            │
│                      ┌─────────────┐    ┌─────────────┐    │
│                      │ Governance  │    │   State     │    │
│                      │    API      │    │    API      │    │
│                      └─────────────┘    └─────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 6.7 技术债务声明

### 6.7.1 Mock清单

| Mock项 | 原因 | 影响范围 | 预计清理时间 |
|--------|------|----------|--------------|
| `tsa.get/set/delete` | TSA核心未完全实现 | useTSA测试 | Phase 2完成 |
| `fetch` API | API路由业务逻辑待实现 | 所有Hook测试 | Phase A完成 |
| `EventSource` | SSE订阅待实现 | useStateMachine订阅 | Phase A完成 |
| `tsa.subscribe` | TSA事件系统待实现 | useTSA订阅功能 | Phase 2完成 |

### 6.7.2 待实现依赖

| 依赖项 | 状态 | 阻塞功能 | 预计完成时间 |
|--------|------|----------|--------------|
| `/api/v1/a2a/agents/[id]` | 🚧 未实现 | useAgent.refreshAgent | Task 4 |
| `/api/v1/a2a/send/stream` | 🚧 未实现 | useAgent.sendMessageStream | Task 4 |
| `/api/v1/state/events` | 🚧 未实现 | useStateMachine.subscribe | Task 1 |
| TSA事件订阅系统 | 🚧 未实现 | useTSASubscription | Phase 2 |

### 6.7.3 已知限制

1. **并发处理**: 当前Hook未实现乐观更新，并发操作可能导致状态不一致
2. **离线支持**: 未实现离线缓存和同步机制
3. **重试策略**: 仅实现了基础指数退避，未实现断路器模式
4. **性能优化**: 未实现虚拟列表、防抖节流等性能优化

### 6.7.4 后续优化计划

| 优化项 | 优先级 | 预计工时 | 计划版本 |
|--------|--------|----------|----------|
| 乐观更新 | P1 | 1天 | v2.1.1 |
| 离线缓存 | P2 | 2天 | v2.1.2 |
| 断路器模式 | P2 | 1天 | v2.1.2 |
| 性能优化 | P3 | 2天 | v2.2.0 |

---

## 附录

### A. Hooks使用示例

```tsx
// 完整示例: Agent聊天 + 治理提案

import { useAgent, useGovernance, useStateMachine } from '@/app/hooks';

function AgentWorkspace({ agentId }: { agentId: string }) {
  const { agent, messages, sendMessage, loading: agentLoading } = useAgent(agentId);
  const { proposals, createProposal, vote } = useGovernance();
  const { currentState, transition } = useStateMachine();

  return (
    <div className="workspace">
      <StateIndicator state={currentState} />
      <AgentChat 
        agent={agent} 
        messages={messages} 
        onSend={sendMessage}
        loading={agentLoading}
      />
      <ProposalPanel 
        proposals={proposals}
        onCreate={createProposal}
        onVote={vote}
      />
    </div>
  );
}
```

### B. 类型导出

```typescript
// app/hooks/index.ts

export { useTSA, useTSASubscription } from './useTSA';
export type { UseTSAReturn, UseTSAOptions } from './useTSA';

export { useAgent } from './useAgent';
export type { 
  A2AMessage, 
  AgentInfo, 
  UseAgentReturn,
  SendMessageOptions,
  LoadHistoryOptions 
} from './useAgent';

export { useGovernance } from './useGovernance';
export type { 
  Proposal, 
  Vote, 
  VoteStats,
  ProposalStatus,
  VoteChoice,
  UseGovernanceReturn 
} from './useGovernance';

export { useStateMachine } from './useStateMachine';
export type { 
  PowerState,
  StateTransition,
  UseStateMachineReturn 
} from './useStateMachine';
```

---

**文档生成**: B-06 React Hooks实现专家  
**审核状态**: 待审核  
**关联工单**: B-06/09
