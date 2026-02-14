/**
 * UI类型定义 - 修复版
 * 从 A2A_Demo_Skills/2.0 luxury 打捞并适配
 */

// ==================== Agent类型 ====================

export type AgentRole = 'pm' | 'arch' | 'qa' | 'engineer' | 'mike' | 'soyorin';

export const AGENT_ROLES: AgentRole[] = ['pm', 'arch', 'qa', 'engineer', 'mike', 'soyorin'];

export interface AgentConfig {
  name: string;
  description: string;
  powers: string[];
  color: string;
  icon: string;
}

// ==================== 消息类型 ====================

export type A2AMessageType = 
  | 'proposal' 
  | 'review' 
  | 'approve' 
  | 'reject' 
  | 'execute' 
  | 'complete' 
  | 'chat' 
  | 'broadcast' 
  | 'system';

export const MESSAGE_TYPES: A2AMessageType[] = [
  'proposal', 'review', 'approve', 'reject', 
  'execute', 'complete', 'chat', 'broadcast', 'system'
];

export interface A2AMessage {
  id: string;
  from: AgentRole;
  to: AgentRole | 'broadcast';
  type: A2AMessageType;
  timestamp: number;
  payload: {
    content: string;
    metadata?: {
      priority?: 'urgent' | 'high' | 'medium' | 'low';
      proposalId?: string;
      taskId?: string;
      attachments?: Array<{
        type: 'code' | 'doc' | 'link';
        content: string;
      }>;
    };
  };
}

// ==================== 治理类型 ====================

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'expired';
export type VoteChoice = 'for' | 'against' | 'abstain';

export interface Vote {
  voter: AgentRole;
  choice: VoteChoice;
  reason?: string;
  timestamp: number;
}

export interface Proposal {
  id: string;
  title: string;
  description: string;
  proposer: AgentRole;
  status: ProposalStatus;
  createdAt: number;
  expiresAt: number;
  requiredApprovers: AgentRole[];
  votes: Vote[];
  targetState?: string;
}

// ==================== 状态类型 ====================

export type PowerState = 'IDLE' | 'DESIGN' | 'CODE' | 'AUDIT' | 'BUILD' | 'DEPLOY' | 'DONE';

export const STATE_ORDER: PowerState[] = ['IDLE', 'DESIGN', 'CODE', 'AUDIT', 'BUILD', 'DEPLOY', 'DONE'];

export interface StateTransition {
  from: PowerState;
  to: PowerState;
  triggeredBy: AgentRole;
  timestamp: number;
  reason?: string;
  proposalId?: string;
}

// ==================== 演示类型 ====================

export interface DemoStep {
  id: string;
  agent: AgentRole;
  action: string;
  content: string;
  duration?: number;
}

export interface DemoScenario {
  id: string;
  name: string;
  description: string;
  steps: DemoStep[];
}

export type PlayerState = 'idle' | 'playing' | 'paused' | 'completed';

export interface PlaybackSpeed {
  label: string;
  value: number;
}

export const PLAYBACK_SPEEDS: PlaybackSpeed[] = [
  { label: '0.5x', value: 0.5 },
  { label: '1x', value: 1 },
  { label: '1.5x', value: 1.5 },
  { label: '2x', value: 2 },
];

// ==================== Agent配置 ====================

export const AGENT_DISPLAY_CONFIG: Record<AgentRole, AgentConfig> = {
  pm: {
    name: '客服小祥',
    description: '立法者与任务分配者',
    powers: ['创建提案', '分配任务', '最终决定'],
    color: '#884499',
    icon: '👑',
  },
  arch: {
    name: '压力怪',
    description: '系统架构师',
    powers: ['设计架构', '技术选型', '代码审查'],
    color: '#7777AA',
    icon: '🏗️',
  },
  qa: {
    name: '咕咕嘎嘎',
    description: '质量保证与测试',
    powers: ['代码审查', '测试用例', '质量门禁'],
    color: '#66BB66',
    icon: '🔍',
  },
  engineer: {
    name: '奶龙娘',
    description: '代码实现者',
    powers: ['编码实现', 'Bug修复', '性能优化'],
    color: '#FFDD88',
    icon: '💻',
  },
  mike: {
    name: 'Mike',
    description: '构建与部署专家',
    powers: ['CI/CD', '打包构建', '发布部署'],
    color: '#EE6677',
    icon: '📦',
  },
  soyorin: {
    name: 'Soyorin',
    description: '验收与文档',
    powers: ['验收测试', '文档编写', '发布说明'],
    color: '#884499',
    icon: '📝',
  },
};

export function getAgentDisplayName(role: AgentRole): string {
  return AGENT_DISPLAY_CONFIG[role]?.name || role;
}

export function getAgentConfig(role: AgentRole): AgentConfig {
  return AGENT_DISPLAY_CONFIG[role] || AGENT_DISPLAY_CONFIG.pm;
}

// ==================== Chat消息类型 ====================

export interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'agent';
  timestamp: number;
  isStreaming?: boolean;
}
