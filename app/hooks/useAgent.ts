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

const DEFAULT_SEND_TIMEOUT = 30000;
const DEFAULT_HISTORY_LIMIT = 50;

export function useAgent(agentId: string): UseAgentReturn {
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [messages, setMessages] = useState<A2AMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

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
        setAgent(data.data?.agent || null);
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

  const loadHistory = useCallback(async (options: LoadHistoryOptions = {}): Promise<void> => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      params.set('sessionId', agentId);
      if (options.limit) params.set('limit', String(options.limit));
      if (options.before) params.set('before', String(options.before));
      if (options.after) params.set('after', String(options.after));
      
      const response = await fetch(`/api/v1/a2a/history?${params.toString()}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to load history: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (isMountedRef.current) {
        setMessages(data.data || []);
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

  const sendMessage = useCallback(async (
    content: string,
    options: SendMessageOptions = {}
  ): Promise<A2AMessage | null> => {
    if (!content.trim()) return null;
    
    setSending(true);
    setError(null);
    
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    
    try {
      const response = await fetch('/api/v1/a2a/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: 'user',
          receiver: agentId,
          content,
          type: options.type || 'chat',
          metadata: options.metadata,
        }),
        signal: abortControllerRef.current.signal,
      });
      
      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.statusText}`);
      }
      
      const data = await response.json();
      const message = data.data;
      
      if (isMountedRef.current && message) {
        setMessages(prev => [...prev, message]);
      }
      
      return message;
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
      return null;
    } finally {
      if (isMountedRef.current) {
        setSending(false);
      }
    }
  }, [agentId]);

  const clearMessages = useCallback((): void => {
    setMessages([]);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
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
    clearMessages,
    refreshAgent,
  };
}
