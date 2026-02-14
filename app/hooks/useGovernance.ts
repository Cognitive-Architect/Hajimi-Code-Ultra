import { useState, useCallback, useEffect, useRef } from 'react';
import type { 
  Proposal, 
  VoteResult, 
  VoteStats, 
  CreateProposalRequest,
  ProposalListResponse,
} from '@/lib/core/governance/types';
import type { AgentRole, PowerState } from '@/lib/types/state';

export type VoteChoice = 'approve' | 'reject' | 'abstain';

export interface CreateProposalInput {
  title: string;
  description: string;
  targetState: PowerState;
  proposer: AgentRole;
}

export interface UseGovernanceReturn {
  proposals: Proposal[];
  loading: boolean;
  error: Error | null;
  createProposal: (data: CreateProposalInput) => Promise<Proposal | null>;
  vote: (proposalId: string, choice: VoteChoice, reason?: string) => Promise<VoteResult | null>;
  refreshProposals: () => Promise<void>;
  getProposal: (id: string) => Promise<Proposal | null>;
  getVoteStats: (proposalId: string) => Promise<VoteStats | null>;
}

export interface UseGovernanceOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function useGovernance(
  voterRole: AgentRole = 'pm',
  options: UseGovernanceOptions = {}
): UseGovernanceReturn {
  const { autoRefresh = true, refreshInterval = 30000 } = options;
  
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const refreshProposals = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    
    try {
      const response = await fetch('/api/v1/governance/proposals', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: abortControllerRef.current.signal,
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch proposals: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (isMountedRef.current) {
        setProposals(data.data?.proposals || []);
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

  const createProposal = useCallback(async (input: CreateProposalInput): Promise<Proposal | null> => {
    setLoading(true);
    setError(null);
    
    try {
      const request: CreateProposalRequest = {
        ...input,
        type: 'state_transition',
      };
      
      const response = await fetch('/api/v1/governance/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to create proposal: ${response.statusText}`);
      }
      
      const data = await response.json();
      const proposal = data.data;
      
      if (isMountedRef.current && proposal) {
        setProposals(prev => [proposal, ...prev]);
      }
      
      return proposal;
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
      return null;
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const vote = useCallback(async (
    proposalId: string,
    choice: VoteChoice,
    reason?: string
  ): Promise<VoteResult | null> => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/v1/governance/proposals/${proposalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voter: voterRole, choice, reason }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to vote: ${response.statusText}`);
      }
      
      const data = await response.json();
      const result = data.data;
      
      if (isMountedRef.current) {
        await refreshProposals();
      }
      
      return result;
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
      return null;
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [voterRole, refreshProposals]);

  const getProposal = useCallback(async (id: string): Promise<Proposal | null> => {
    try {
      const response = await fetch(`/api/v1/governance/proposals/${id}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to get proposal: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.data;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      return null;
    }
  }, []);

  const getVoteStats = useCallback(async (proposalId: string): Promise<VoteStats | null> => {
    try {
      const response = await fetch(`/api/v1/governance/vote?proposalId=${proposalId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to get vote stats: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.data;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      return null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    
    refreshProposals();
    
    if (autoRefresh) {
      refreshTimerRef.current = setInterval(refreshProposals, refreshInterval);
    }
    
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [refreshProposals, autoRefresh, refreshInterval]);

  return {
    proposals,
    loading,
    error,
    createProposal,
    vote,
    refreshProposals,
    getProposal,
    getVoteStats,
  };
}
